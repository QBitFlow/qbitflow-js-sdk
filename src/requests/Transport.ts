import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { DEFAULT_RETRY_DELAY } from '../config.js';
import {
	ConflictException,
	FieldError,
	ForbiddenException,
	NetworkException,
	NotFoundException,
	QBitFlowError,
	RateLimitException,
	ServerException,
	UnauthorizedException,
	ValidationException,
} from '../exceptions/index.js';
import { sleep } from '../utils/index.js';
import { VERSION } from '../version.js';

/** HTTP verbs the SDK uses. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Per-request options. */
export interface SendOptions {
	/** Query parameters. */
	params?: Record<string, unknown>;
	/** Extra headers for this request (the service's `On-Behalf-Of`). */
	headers?: Readonly<Record<string, string>>;
	/**
	 * `'text'` to receive the body verbatim (the CSV accounting export). Defaults to JSON.
	 */
	responseType?: 'json' | 'text';
	/**
	 * Whether a transport failure or a 5xx may be retried. Defaults to `true` for GET and
	 * `false` for every other verb. Set to `false` on a GET that performs an action
	 * (force-cancel, execute-billing, the claim-funds test trigger) so it is never replayed.
	 */
	retriable?: boolean;
	/** Request body, JSON-encoded by the SDK (a non-finite number or a BigInt is rejected). */
	body?: unknown;
	/** An already-encoded JSON body, sent verbatim. Takes precedence over `body`. */
	rawBody?: string;
}

/** A successful HTTP exchange. */
export interface TransportResponse {
	/** HTTP status (2xx). */
	status: number;
	/** The decoded JSON body, the raw text body, or `''` for an empty body. */
	data: unknown;
}

/** Settings shared by every service of one client. */
export interface TransportSettings {
	apiKey: string;
	baseUrl: string;
	timeout: number;
	maxRetries: number;
}

/** Longest excerpt of a response body embedded in an error message. */
const MAX_BODY_EXCERPT = 200;

/** Shorten a response body for an error message. */
export function excerpt(body: string): string {
	const flat = body.trim();
	return flat.length > MAX_BODY_EXCERPT ? `${flat.slice(0, MAX_BODY_EXCERPT)}…` : flat;
}

/**
 * Axios failures that mean the request could not even be built (a bad URL, an unsupported
 * protocol, an invalid option). Retrying cannot help, so they are never retried.
 */
const CONFIGURATION_ERROR_CODES: ReadonlySet<string> = new Set([
	'ERR_INVALID_URL',
	'ERR_BAD_OPTION',
	'ERR_BAD_OPTION_VALUE',
	'ERR_BAD_REQUEST',
	'ERR_NOT_SUPPORT',
	'ERR_DEPRECATED',
	'ERR_CANCELED',
	'ERR_FORM_DATA_DEPTH_EXCEEDED',
]);

/**
 * Whether a failure that produced no HTTP response may be retried: every transport-level
 * failure (connection refused or reset, DNS, timeout …) is; a configuration error is not.
 */
export function isRetriableTransportError(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return !(typeof code === 'string' && CONFIGURATION_ERROR_CODES.has(code));
}

/**
 * JSON-encode a request body. A value JSON cannot represent (`NaN`, `Infinity`, a BigInt, a
 * circular structure) is a {@link ValidationException} rather than being silently turned into
 * `null` by `JSON.stringify` or escaping as an untyped `TypeError`.
 */
export function encodeRequestBody(value: unknown): string {
	let json: string | undefined;
	try {
		json = JSON.stringify(value, (_key, item: unknown) => {
			if (typeof item === 'number' && !Number.isFinite(item)) {
				throw new ValidationException(
					`request body contains a non-finite number (${String(item)})`
				);
			}
			if (typeof item === 'bigint') {
				throw new ValidationException(
					'request body contains a BigInt, which JSON cannot represent'
				);
			}
			return item;
		});
	} catch (error) {
		if (error instanceof ValidationException) {
			throw error;
		}
		throw new ValidationException(
			`request body cannot be encoded as JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	if (json === undefined) {
		throw new ValidationException('request body cannot be encoded as JSON');
	}
	return json;
}

/**
 * The HTTP transport shared by every service of a client (and by its `onBehalfOf` copies).
 *
 * **Retry policy.** Only idempotent requests — HTTP GET — are retried, and only when the
 * failure is a transport error (no response) or a 5xx. POST, PUT and DELETE are sent exactly
 * once, so a session or a customer is never created twice because a proxy timed out after
 * the server had already processed the request. The GET routes that perform an action
 * (`force-cancel`, `execute-billing`, the claim-funds test trigger) opt out with
 * `retriable: false`. 4xx, 429, 3xx and configuration errors are never retried. Back-off is
 * exponential: 1 s, 2 s, 4 s …
 *
 * **Redirects are not followed.** A 3xx means the base URL is misconfigured; following it
 * would forward the API key to whatever host the redirect names.
 */
export class Transport {
	readonly apiKey: string;
	readonly baseUrl: string;
	readonly timeout: number;
	readonly maxRetries: number;
	private readonly http: AxiosInstance;

	constructor(settings: TransportSettings) {
		this.apiKey = settings.apiKey;
		this.baseUrl = settings.baseUrl;
		this.timeout = settings.timeout;
		this.maxRetries = settings.maxRetries;

		this.http = axios.create({
			baseURL: this.baseUrl,
			timeout: this.timeout,
			maxRedirects: 0,
			headers: {
				'X-API-Key': this.apiKey,
				'Content-Type': 'application/json',
				'User-Agent': `qbitflow-js/${VERSION}`,
			},
			// Bodies are encoded by the SDK (see encodeRequestBody); send them untouched.
			transformRequest: [(data: unknown) => data],
		});
	}

	/**
	 * Send a request, retrying idempotent requests on transient failures.
	 *
	 * @returns The status and body of the successful (2xx) response
	 * @throws {QBitFlowError} The mapped error for any non-2xx response or transport failure
	 */
	async send(
		method: HttpMethod,
		endpoint: string,
		options: SendOptions = {}
	): Promise<TransportResponse> {
		const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
		const data =
			options.rawBody !== undefined
				? options.rawBody
				: options.body !== undefined
					? encodeRequestBody(options.body)
					: undefined;

		const config: AxiosRequestConfig = {
			method,
			url,
			data,
			params: options.params,
			headers: options.headers ? { ...options.headers } : undefined,
			responseType: options.responseType ?? 'json',
		};

		const retriable = options.retriable ?? method === 'GET';
		const budget = retriable ? Math.max(0, this.maxRetries) : 0;

		for (let attempt = 0; ; attempt++) {
			let response: AxiosResponse<unknown>;

			try {
				response = await this.http.request<unknown>(config);
			} catch (error) {
				const canRetry = attempt < budget;

				if (axios.isAxiosError(error) && error.response) {
					if (error.response.status >= 500 && canRetry) {
						await sleep(DEFAULT_RETRY_DELAY * 2 ** attempt);
						continue;
					}
					throw this.mapResponseError(error);
				}

				// No response at all: connection refused, DNS failure, timeout — or a request
				// that could not be built (bad URL, invalid option), which is never retried.
				const retryable = isRetriableTransportError(error);
				if (retryable && canRetry) {
					await sleep(DEFAULT_RETRY_DELAY * 2 ** attempt);
					continue;
				}

				const code = (error as { code?: unknown } | null)?.code;
				const message = error instanceof Error ? error.message : String(error);
				throw new NetworkException(
					retryable
						? `Network request failed: ${typeof code === 'string' ? `${code} — ` : ''}${message || 'no response received'}`
						: `Request could not be sent: ${typeof code === 'string' ? `${code} — ` : ''}${message}`
				);
			}

			return { status: response.status, data: response.data };
		}
	}

	/**
	 * Extract the field-level failures from a decoded error body.
	 *
	 * The API reports validation failures as a list, one entry per offending field:
	 * `{"errors":[{"field":"Price","message":"Price is too short"}]}`. Every entry is kept.
	 */
	private extractFieldErrors(errors: unknown): FieldError[] {
		if (!Array.isArray(errors)) {
			return [];
		}

		const entries: FieldError[] = [];

		for (const raw of errors) {
			if (typeof raw === 'string' && raw !== '') {
				entries.push({ field: '', message: raw });
				continue;
			}

			if (raw !== null && typeof raw === 'object') {
				const entry = raw as { field?: unknown; message?: unknown };
				const field = typeof entry.field === 'string' ? entry.field : '';
				const message = typeof entry.message === 'string' ? entry.message : '';

				if (field !== '' || message !== '') {
					entries.push({ field, message });
				}
			}
		}

		return entries;
	}

	/**
	 * Extract the message and the field failures from an error response.
	 *
	 * A text body (the CSV export's error responses, a gateway page) is parsed as JSON first.
	 * Precedence: `error` → the joined `errors[]` list (`Field: message; …`) → `message` →
	 * a non-JSON body (shortened to 200 characters) → the HTTP status text.
	 */
	private extractError(response: AxiosResponse<unknown>): {
		message: string;
		fields: FieldError[];
	} {
		let data: unknown = response.data;
		const fallback = response.statusText
			? `HTTP ${response.status} ${response.statusText}`
			: `HTTP ${response.status}`;

		if (typeof data === 'string') {
			const text = data.trim();
			if (text === '') {
				return { message: fallback, fields: [] };
			}
			try {
				data = JSON.parse(text);
			} catch {
				return { message: excerpt(text), fields: [] };
			}
		}

		if (data === undefined || data === null) {
			return { message: fallback, fields: [] };
		}

		if (typeof data !== 'object') {
			return { message: String(data), fields: [] };
		}

		const body = data as { error?: unknown; errors?: unknown; message?: unknown };
		const fields = this.extractFieldErrors(body.errors);

		if (typeof body.error === 'string' && body.error !== '') {
			return { message: body.error, fields };
		}

		if (fields.length > 0) {
			const message = fields
				.map((entry) => (entry.field ? `${entry.field}: ${entry.message}` : entry.message))
				.join('; ');

			return { message, fields };
		}

		// `message` is the *success* envelope's key and does not appear on error responses,
		// but honour it in case a gateway synthesises one.
		if (typeof body.message === 'string' && body.message !== '') {
			return { message: body.message, fields };
		}

		return { message: fallback, fields };
	}

	/**
	 * Read a `Retry-After` header as a number of seconds (delta-seconds, or an HTTP date
	 * turned into seconds from now, floored at 0).
	 */
	private parseRetryAfter(response: AxiosResponse<unknown>): number | undefined {
		const raw: unknown = response.headers?.['retry-after'];
		const value = Array.isArray(raw) ? raw[0] : raw;
		if (typeof value !== 'string' || value.trim() === '') {
			return undefined;
		}

		if (/^\d+$/.test(value.trim())) {
			return Number(value.trim());
		}

		const at = Date.parse(value);
		if (Number.isNaN(at)) {
			return undefined;
		}
		return Math.max(0, Math.ceil((at - Date.now()) / 1000));
	}

	/**
	 * Map an HTTP error response onto the SDK's exception hierarchy.
	 *
	 * | status                 | exception                            |
	 * | ---------------------- | ------------------------------------ |
	 * | 400, 422               | ValidationException                  |
	 * | 401                    | UnauthorizedException                |
	 * | 403                    | ForbiddenException                   |
	 * | 404                    | NotFoundException                    |
	 * | 409                    | ConflictException                    |
	 * | 429                    | RateLimitException (+ retryAfter)    |
	 * | other 4xx              | QBitFlowError (base) with statusCode |
	 * | 3xx, 5xx               | ServerException                      |
	 */
	private mapResponseError(error: AxiosError<unknown>): QBitFlowError {
		const response = error.response as AxiosResponse<unknown>;
		const statusCode = response.status;
		const { message, fields } = this.extractError(response);
		const options = { fields, statusCode };

		switch (statusCode) {
			case 400:
			case 422:
				return new ValidationException(message, options);
			case 401:
				return new UnauthorizedException(message, options);
			case 403:
				return new ForbiddenException(message, options);
			case 404:
				return new NotFoundException(message, options);
			case 409:
				return new ConflictException(message, options);
			case 429:
				return new RateLimitException(message, {
					...options,
					retryAfter: this.parseRetryAfter(response),
				});
		}

		if (statusCode >= 400 && statusCode < 500) {
			return new QBitFlowError(message, options);
		}

		if (statusCode >= 300 && statusCode < 400) {
			const location: unknown = response.headers?.['location'];
			return new ServerException(
				`Unexpected redirect (${statusCode})${typeof location === 'string' && location ? ` to ${location}` : ''}: check the configured base URL`,
				options
			);
		}

		return new ServerException(message, options);
	}
}
