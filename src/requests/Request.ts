import { DEFAULT_BASE_URL } from '../config.js';
import { decodeWith, Schema } from '../decode.js';
import { ServerException, ValidationException } from '../exceptions/index.js';
import { excerpt, SendOptions, Transport, TransportResponse } from './Transport.js';

export type { HttpMethod } from './Transport.js';

/** Per-request knobs for GET requests, used by the request classes. */
export type RequestOptions = Pick<SendOptions, 'retriable'>;

/** Strip a trailing slash so `baseUrl + '/customer/'` never yields `//customer/`. */
export function normalizeBaseUrl(baseUrl: string | undefined): string {
	const trimmed = (baseUrl ?? '').trim();
	if (trimmed === '') {
		return DEFAULT_BASE_URL;
	}
	return trimmed.replace(/\/+$/, '');
}

/**
 * Build the `On-Behalf-Of` header for a user id.
 *
 * `0` means "act at the organization level": no header at all (the API rejects
 * `On-Behalf-Of: 0`).
 *
 * @throws {ValidationException} When `userId` is not a non-negative safe integer
 */
export function onBehalfOfHeaders(userId: unknown): Record<string, string> {
	if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId < 0) {
		throw new ValidationException(
			'userId must be a non-negative safe integer (0 = organization level)'
		);
	}
	return userId > 0 ? { 'On-Behalf-Of': String(userId) } : {};
}

/**
 * Base class of every service (`client.products`, `client.customers` …).
 *
 * A service holds the client's shared {@link Transport} plus its own extra headers (the
 * `On-Behalf-Of` header of an `onBehalfOf()` copy). Every JSON response is decoded against a
 * schema — see `decode.ts` for the policy — so the returned objects match their declared
 * types at runtime, not just at compile time.
 */
export class Request {
	/** The HTTP transport shared with every other service of the client. */
	protected readonly transport: Transport;
	/** Extra headers sent with every request of this service. */
	protected readonly headers: Readonly<Record<string, string>>;

	/**
	 * @param transport - The client's shared transport
	 * @param headers - Extra headers sent with every request (used for `On-Behalf-Of`)
	 */
	constructor(transport: Transport, headers: Readonly<Record<string, string>> = {}) {
		this.transport = transport;
		this.headers = headers;
	}

	/**
	 * Act on behalf of a specific user within the same organization, scoping this service's
	 * requests to that user's resources. Requires an organization-level admin/owner API key.
	 * To scope every service at once, use `client.onBehalfOf(userId)`.
	 *
	 * Passing `0` means "act at the organization level" — the header is omitted entirely.
	 *
	 * @param userId - ID of the user to act for, or 0 to act at the organization level
	 * @returns A copy of this service that sends `On-Behalf-Of: <userId>`
	 * @throws {ValidationException} When `userId` is negative, not an integer or not a safe
	 *   integer
	 *
	 * @example
	 * ```typescript
	 * // All products available to user 123
	 * const userProducts = await client.products.onBehalfOf(123).getAll();
	 * ```
	 */
	public onBehalfOf(userId: number): this {
		const headers = onBehalfOfHeaders(userId);
		const ServiceConstructor = this.constructor as new (
			transport: Transport,
			headers?: Readonly<Record<string, string>>
		) => this;
		return new ServiceConstructor(this.transport, headers);
	}

	/**
	 * Decode a JSON response body against `schema`.
	 *
	 * An empty body (other than a 204) or a body that is not JSON is a response-shape failure
	 * ({@link ServerException} with the HTTP status); so is a field of the wrong JSON type.
	 */
	private decodeJson<T>(schema: Schema<T>, response: TransportResponse): T {
		const { status, data } = response;
		if (status === 204) {
			return decodeWith(schema, undefined, { statusCode: status });
		}
		if (data === undefined || data === '') {
			throw new ServerException('Expected a JSON response but the body was empty', {
				statusCode: status,
			});
		}
		if (typeof data === 'string') {
			throw new ServerException(
				`Expected a JSON response but the body could not be parsed: ${excerpt(data)}`,
				{ statusCode: status }
			);
		}
		return decodeWith(schema, data, { statusCode: status });
	}

	/** GET a JSON resource and decode it. */
	protected async getJson<T>(
		schema: Schema<T>,
		endpoint: string,
		params?: Record<string, unknown>,
		options: RequestOptions = {}
	): Promise<T> {
		const response = await this.transport.send('GET', endpoint, {
			...options,
			params,
			headers: this.headers,
		});
		return this.decodeJson(schema, response);
	}

	/** GET a text resource (the CSV export), returned verbatim. */
	protected async getText(endpoint: string, params?: Record<string, unknown>): Promise<string> {
		const response = await this.transport.send('GET', endpoint, {
			params,
			headers: this.headers,
			responseType: 'text',
		});
		return typeof response.data === 'string' ? response.data : String(response.data ?? '');
	}

	/** POST a JSON body (never retried) and decode the response. */
	protected async postJson<T>(
		schema: Schema<T>,
		endpoint: string,
		body: unknown,
		options: Pick<SendOptions, 'rawBody'> = {}
	): Promise<T> {
		const response = await this.transport.send('POST', endpoint, {
			body,
			rawBody: options.rawBody,
			headers: this.headers,
		});
		return this.decodeJson(schema, response);
	}

	/** PUT a JSON body (never retried) and decode the response. */
	protected async putJson<T>(schema: Schema<T>, endpoint: string, body: unknown): Promise<T> {
		const response = await this.transport.send('PUT', endpoint, {
			body,
			headers: this.headers,
		});
		return this.decodeJson(schema, response);
	}

	/** DELETE (never retried) and decode the response. */
	protected async deleteJson<T>(schema: Schema<T>, endpoint: string): Promise<T> {
		const response = await this.transport.send('DELETE', endpoint, { headers: this.headers });
		return this.decodeJson(schema, response);
	}
}
