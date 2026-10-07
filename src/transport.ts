/**
 * The HTTP layer: headers, the retry policy (behaviour §3), error mapping (§4) and response
 * decoding (§6), on the global `fetch` (or an injected one).
 *
 * @internal Not part of the public API.
 */

import { type DecodeContext, describe, type Schema } from './decode.js';
import { encodeBody } from './encode.js';
import {
	ApiError,
	type ApiErrorInit,
	AuthenticationError,
	BadRequestError,
	CODE_IDEMPOTENCY_KEY_IN_USE,
	CODE_IDEMPOTENCY_KEY_REUSED,
	CODE_VALIDATION_FAILED,
	ConflictError,
	fieldError,
	type FieldError,
	GoneError,
	IdempotencyError,
	NetworkError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
	ServerError,
	ValidationError,
} from './errors.js';
import { USER_AGENT } from './version.js';
import { checkOnBehalfOf, isIdempotencyKey, isRequestId } from './validate.js';

/** The response a {@link FetchLike} resolves to: the parts of a `fetch` `Response` the SDK reads. */
export interface FetchResponse {
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	text(): Promise<string>;
}

/** The request a {@link FetchLike} receives. */
export interface FetchInit {
	method: string;
	headers: Record<string, string>;
	body?: string;
	redirect: 'manual';
	signal: AbortSignal;
}

/** A `fetch` implementation (the global one by default): inject one for tests or other runtimes. */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

/** Options of one call (every method's last argument). */
export interface RequestOptions {
	/**
	 * Act in a member's space for this call (`On-Behalf-Of`: a member's `userUuid`; organization
	 * key only). Overrides the client's; `''` forces the organization level.
	 */
	onBehalfOf?: string;
	/**
	 * The `Idempotency-Key` of one of the 7 idempotent creates (the SDK otherwise generates a UUID
	 * v4 per call), e.g. to retry a create across processes: 1 to 255 printable ASCII characters
	 * without spaces. Other methods ignore it.
	 */
	idempotencyKey?: string;
	/** Sent as `X-Request-Id` (1 to 128 of `A-Z a-z 0-9 - _ . :`); the API echoes it and errors carry it. */
	requestId?: string;
	/**
	 * Cancels the call: an abort stops the attempt in flight and any retry
	 * (a `NetworkError`, its `cause` the signal's reason).
	 */
	signal?: AbortSignal;
}

/** The HTTP methods the API uses. */
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** One API call. */
export interface Endpoint {
	method: Method;
	/** The route below the base URL, starting with `/`, every caller-supplied segment escaped. */
	path: string;
	/** The encoded query string, without `?` (`''`/absent: none). */
	query?: string;
	/** Encoded as JSON (absent: no body, no `Content-Type`). */
	body?: unknown;
	/**
	 * One of the 7 idempotent creates: sends an `Idempotency-Key` (generated per call, or the
	 * option's) and is retried like a read. Other writes never are.
	 */
	idempotent?: boolean;
	/** Overrides `Accept` (default `application/json`). */
	accept?: string;
}

/** A response, its body read in full. */
export interface RawResponse {
	status: number;
	headers: { get(name: string): string | null };
	body: string;
}

/** The first back-off, in ms; attempt n (0-based) waits `1 s · 2^n`. */
const RETRY_BASE_MS = 1000;
/** The longest wait before retrying a 429, in ms: a longer one throws the `RateLimitError` at once. */
const MAX_RETRY_WAIT_MS = 60_000;
/** Bounds a `Retry-After` (about a year: far above the 60 s the SDK waits anyway). */
const MAX_RETRY_AFTER_SECONDS = 365 * 24 * 3600;

/** Waits `ms`, or rejects when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/** A random (version 4) UUID: the default `Idempotency-Key`. */
export function newUUIDv4(): string {
	const c = (
		globalThis as {
			crypto?: {
				randomUUID?: () => string;
				getRandomValues?: <T extends Uint8Array>(a: T) => T;
			};
		}
	).crypto;
	if (c?.randomUUID) return c.randomUUID();
	const b = new Uint8Array(16);
	if (c?.getRandomValues) c.getRandomValues(b);
	else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The configuration a client and its `onBehalfOf` copies share. */
export class Transport {
	/** Test hook: waits between attempts. */
	sleep: (ms: number, signal?: AbortSignal) => Promise<void> = sleep;
	/** Test hook: the clock, in ms (`Retry-After` HTTP-dates). */
	now: () => number = Date.now;
	/** Test hook: generates an `Idempotency-Key`. */
	newKey: () => string = newUUIDv4;

	constructor(
		readonly apiKey: string,
		readonly baseUrl: string,
		/** Per attempt, in ms. */
		readonly timeout: number,
		readonly maxRetries: number,
		readonly fetch: FetchLike
	) {}

	/**
	 * Performs `e`: applies the request options, builds the headers, encodes the body and runs
	 * the retry policy. Resolves with any 2xx response, else throws a typed error.
	 */
	async send(
		e: Endpoint,
		clientOnBehalfOf: string,
		options: RequestOptions = {}
	): Promise<RawResponse> {
		if (options === null || typeof options !== 'object') options = {};
		let onBehalfOf = clientOnBehalfOf;
		if (options.onBehalfOf !== undefined && options.onBehalfOf !== null) {
			checkOnBehalfOf(options.onBehalfOf);
			onBehalfOf = options.onBehalfOf;
		}
		const requestId = options.requestId;
		if (requestId !== undefined && requestId !== null && requestId !== '') {
			if (typeof requestId !== 'string' || !isRequestId(requestId)) {
				throw fieldError(
					'X-Request-Id',
					'must be 1 to 128 characters among A-Z a-z 0-9 - _ . :'
				);
			}
		}

		const headers: Record<string, string> = {
			'X-API-Key': this.apiKey,
			'User-Agent': USER_AGENT,
			Accept: e.accept ?? 'application/json',
		};
		if (onBehalfOf) headers['On-Behalf-Of'] = onBehalfOf;
		if (requestId) headers['X-Request-Id'] = requestId;
		if (e.idempotent) {
			const key = options.idempotencyKey;
			if (key === undefined || key === null || key === '') {
				headers['Idempotency-Key'] = this.newKey(); // one key per call, reused by every retry
			} else if (typeof key !== 'string' || !isIdempotencyKey(key)) {
				throw fieldError(
					'Idempotency-Key',
					'must be 1 to 255 printable ASCII characters without spaces'
				);
			} else {
				headers['Idempotency-Key'] = key;
			}
		}

		let payload: string | undefined;
		if (e.body !== undefined) {
			payload = encodeBody(e.body);
			headers['Content-Type'] = 'application/json';
		}

		const url = this.baseUrl + e.path + (e.query ? `?${e.query}` : '');
		const maxRetries = e.method === 'GET' || e.idempotent ? this.maxRetries : 0;
		const signal = options.signal;

		for (let attempt = 0; ; attempt++) {
			let error: unknown;
			try {
				const res = await this.roundTrip(e.method, url, payload, headers, signal);
				if (res.status >= 200 && res.status < 300) return res;
				error = errorFromResponse(res, this.now());
			} catch (err) {
				error = err;
			}

			if (attempt >= maxRetries || !shouldRetry(error, e.idempotent === true)) throw error;
			// A retry is due but the caller gave up: report the cancellation, whichever moment it raced with.
			if (signal?.aborted) {
				throw new NetworkError({
					message: 'request cancelled while waiting to retry',
					cause: signal.reason,
				});
			}
			const delay = retryDelay(error, attempt);
			if (delay === undefined) throw error;
			try {
				await this.sleep(delay, signal);
			} catch (err) {
				throw new NetworkError({
					message: 'request cancelled while waiting to retry',
					cause: err,
				});
			}
		}
	}

	/** One HTTP attempt, bounded by the per-attempt timeout (the body read included). */
	private async roundTrip(
		method: Method,
		url: string,
		body: string | undefined,
		headers: Record<string, string>,
		signal: AbortSignal | undefined
	): Promise<RawResponse> {
		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort(new Error(`timeout after ${this.timeout} ms`));
		}, this.timeout);
		const onAbort = () => controller.abort(signal?.reason);
		if (signal?.aborted) controller.abort(signal.reason);
		else signal?.addEventListener('abort', onAbort, { once: true });

		const fail = (message: string, cause: unknown): NetworkError => {
			if (signal?.aborted)
				return new NetworkError({
					message: 'request cancelled',
					cause: signal.reason ?? cause,
				});
			if (timedOut)
				return new NetworkError({
					message: `request timed out after ${this.timeout} ms`,
					cause,
				});
			return new NetworkError({ message, cause });
		};

		try {
			let res: FetchResponse;
			try {
				res = await this.fetch(url, {
					method,
					headers: { ...headers },
					body,
					redirect: 'manual',
					signal: controller.signal,
				});
			} catch (err) {
				throw fail('request failed', err);
			}
			let text: string;
			try {
				text = await res.text();
			} catch (err) {
				throw fail('failed to read the response', err);
			}
			return { status: res.status, headers: res.headers, body: text };
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		}
	}
}

/**
 * Whether a failed attempt may be retried: a network error or timeout, a 5xx, a 429, or — for
 * the idempotent creates — a 409 `idempotency_key_in_use`. Every other 4xx, a 3xx and a
 * response-shape failure are final.
 */
export function shouldRetry(err: unknown, idempotent: boolean): boolean {
	if (err instanceof NetworkError || err instanceof RateLimitError) return true;
	if (err instanceof ServerError) return (err.status ?? 0) >= 500;
	if (err instanceof ConflictError) return idempotent && err.code === CODE_IDEMPOTENCY_KEY_IN_USE;
	return false;
}

/**
 * The wait before the retry that follows `attempt` (0-based), in ms: `1 s · 2^attempt`, and for
 * a 429 at least its `Retry-After`. `undefined` when a 429's wait exceeds 60 s.
 */
export function retryDelay(err: unknown, attempt: number): number | undefined {
	let delay = RETRY_BASE_MS * 2 ** Math.min(attempt, 30);
	if (err instanceof RateLimitError) {
		delay = Math.max(delay, err.retryAfter * 1000);
		if (delay > MAX_RETRY_WAIT_MS) return undefined;
	}
	return delay;
}

/** Go's `http.StatusText`, for the default message of a status without a body message. */
const STATUS_TEXT: Record<number, string> = {
	300: 'Multiple Choices',
	301: 'Moved Permanently',
	302: 'Found',
	303: 'See Other',
	304: 'Not Modified',
	305: 'Use Proxy',
	307: 'Temporary Redirect',
	308: 'Permanent Redirect',
	400: 'Bad Request',
	401: 'Unauthorized',
	402: 'Payment Required',
	403: 'Forbidden',
	404: 'Not Found',
	405: 'Method Not Allowed',
	406: 'Not Acceptable',
	407: 'Proxy Authentication Required',
	408: 'Request Timeout',
	409: 'Conflict',
	410: 'Gone',
	411: 'Length Required',
	412: 'Precondition Failed',
	413: 'Request Entity Too Large',
	414: 'Request URI Too Long',
	415: 'Unsupported Media Type',
	416: 'Requested Range Not Satisfiable',
	417: 'Expectation Failed',
	418: "I'm a teapot",
	421: 'Misdirected Request',
	422: 'Unprocessable Entity',
	423: 'Locked',
	424: 'Failed Dependency',
	425: 'Too Early',
	426: 'Upgrade Required',
	428: 'Precondition Required',
	429: 'Too Many Requests',
	431: 'Request Header Fields Too Large',
	451: 'Unavailable For Legal Reasons',
	500: 'Internal Server Error',
	501: 'Not Implemented',
	502: 'Bad Gateway',
	503: 'Service Unavailable',
	504: 'Gateway Timeout',
	505: 'HTTP Version Not Supported',
	506: 'Variant Also Negotiates',
	507: 'Insufficient Storage',
	508: 'Loop Detected',
	510: 'Not Extended',
	511: 'Network Authentication Required',
};

/** The default message for a status without a body message. */
export function statusMessage(status: number): string {
	const text = STATUS_TEXT[status];
	return text ? text.toLowerCase() : `http status ${status}`;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** Reads `details.errors` (`[{field, message}]`), skipping malformed entries. */
function fieldErrorsFromDetails(details: Record<string, unknown>): FieldError[] {
	const list = details.errors;
	if (!Array.isArray(list)) return [];
	const out: FieldError[] = [];
	for (const item of list) {
		if (!isPlainObject(item)) continue;
		const field = typeof item.field === 'string' ? item.field : '';
		const message = typeof item.message === 'string' ? item.message : '';
		if (field === '' && message === '') continue;
		out.push({ field, message });
	}
	return out;
}

/**
 * The payload of a non-2xx response. Each key is read on its own so a malformed one never hides
 * the others; field errors come from `details.errors` only (never a top-level `errors`).
 */
export function parseApiError(res: RawResponse): ApiErrorInit {
	const init: ApiErrorInit & { details: Record<string, unknown> } = {
		message: '',
		status: res.status,
		code: '',
		details: {},
		requestId: '',
		fieldErrors: [],
		rawBody: res.body,
	};
	let body: unknown;
	try {
		body = JSON.parse(res.body);
	} catch {
		body = undefined;
	}
	if (isPlainObject(body)) {
		if (typeof body.error === 'string') init.message = body.error;
		if (typeof body.code === 'string') init.code = body.code;
		if (isPlainObject(body.details)) init.details = body.details;
		if (typeof body.requestId === 'string') init.requestId = body.requestId;
		init.fieldErrors = fieldErrorsFromDetails(init.details);
	}
	if (!init.message) init.message = statusMessage(res.status);
	if (!init.requestId) init.requestId = res.headers.get('x-request-id') ?? '';
	return init;
}

/** Reads an integer from `details`; 0 when absent or unusable. */
function detailInt(details: Record<string, unknown>, key: string): number {
	const v = details[key];
	if (typeof v === 'number' && v >= 0 && v < 2 ** 31) return Math.trunc(v);
	if (typeof v === 'string' && /^[+-]?\d+$/.test(v)) {
		const n = Number(v);
		return Number.isSafeInteger(n) ? n : 0;
	}
	return 0;
}

/**
 * The wait a 429 asks for, in seconds: the `Retry-After` header (delta-seconds or an
 * HTTP-date, rounded up), else `details.retryAfterSeconds`; 0 when neither is usable.
 */
export function retryAfterSeconds(
	headers: { get(name: string): string | null },
	details: Record<string, unknown>,
	nowMs: number
): number {
	const value = (headers.get('retry-after') ?? '').trim();
	if (value !== '') {
		if (/^[+-]?\d+$/.test(value)) {
			const seconds = Number(value);
			if (seconds >= 0) return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
		} else {
			const when = Date.parse(value);
			if (!Number.isNaN(when)) {
				const waitMs = when - nowMs;
				return waitMs < 0 ? 0 : Math.ceil(waitMs / 1000);
			}
		}
	}
	const seconds = detailInt(details, 'retryAfterSeconds');
	return seconds > 0 ? Math.min(seconds, MAX_RETRY_AFTER_SECONDS) : 0;
}

/** Maps a non-2xx response to the SDK's typed error. */
export function errorFromResponse(res: RawResponse, nowMs: number): ApiError {
	const init = parseApiError(res);
	const status = res.status;
	if (status === 400) {
		return init.code === CODE_VALIDATION_FAILED
			? new ValidationError(init)
			: new BadRequestError(init);
	}
	if (status === 401) return new AuthenticationError(init);
	if (status === 403) return new PermissionDeniedError(init);
	if (status === 404) return new NotFoundError(init);
	if (status === 409) return new ConflictError(init);
	if (status === 410) return new GoneError(init);
	if (status === 422 && init.code === CODE_IDEMPOTENCY_KEY_REUSED)
		return new IdempotencyError(init);
	if (status === 429) {
		const details = init.details ?? {};
		return new RateLimitError({
			...init,
			retryAfter: retryAfterSeconds(res.headers, details, nowMs),
			limit: detailInt(details, 'limit'),
			periodSeconds: detailInt(details, 'periodSeconds'),
		});
	}
	if (status >= 500 || status < 200 || (status >= 300 && status < 400))
		return new ServerError(init);
	return new ApiError(init);
}

/** The decode context of an API answer: a wrong type is a `ServerError` with the status. */
export function responseContext(res: RawResponse): DecodeContext {
	return {
		fail(path, expected, value) {
			const where = path === '' ? 'the body' : path;
			return new ServerError({
				message: `unexpected response body: ${where} should be ${expected}, got ${describe(value)}`,
				status: res.status,
				requestId: res.headers.get('x-request-id') ?? '',
			});
		},
	};
}

/**
 * Decodes a 2xx JSON answer (behaviour §6): an empty or non-JSON body, or a value of the wrong
 * type, is a `ServerError`.
 */
export function decodeResponse<T>(schema: Schema<T>, res: RawResponse): T {
	const requestId = res.headers.get('x-request-id') ?? '';
	if (res.body.trim() === '') {
		throw new ServerError({
			message: 'empty response body where JSON was expected',
			status: res.status,
			requestId,
		});
	}
	let value: unknown;
	try {
		value = JSON.parse(res.body);
	} catch (err) {
		throw new ServerError({
			message: 'unexpected response body',
			status: res.status,
			requestId,
			cause: err,
		});
	}
	if (value === null && schema.expected !== 'an array') {
		throw new ServerError({
			message: 'unexpected response body: null where an object was expected',
			status: res.status,
			requestId,
		});
	}
	return schema.decode(value, '', responseContext(res));
}
