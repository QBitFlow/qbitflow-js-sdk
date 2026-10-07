/**
 * Custom error classes for the QBitFlow SDK.
 *
 * Every error a request, a validator or a webhook helper throws extends
 * {@link QBitFlowError}, so a single `instanceof` check catches them all. (The only
 * exception is the `QBitFlow` constructor, which throws a plain `Error` for an invalid
 * configuration — a blank API key, a malformed base URL.) Errors raised from an API response
 * carry the HTTP status in {@link QBitFlowError.statusCode} and any per-field failures in
 * {@link QBitFlowError.fields}; errors raised by the SDK itself (client-side validation, a
 * network failure) leave `statusCode` undefined.
 *
 * | HTTP status                              | Class                    |
 * | ---------------------------------------- | ------------------------ |
 * | 400, 422                                 | `ValidationException`    |
 * | 401                                      | `UnauthorizedException`  |
 * | 403                                      | `ForbiddenException`     |
 * | 404                                      | `NotFoundException`      |
 * | 409                                      | `ConflictException`      |
 * | 429                                      | `RateLimitException`     |
 * | any other 4xx                            | `QBitFlowError` (base)   |
 * | 3xx, 5xx, empty/non-JSON 2xx, bad shape  | `ServerException`        |
 * | no response                              | `NetworkException`       |
 */

/**
 * A single field-level validation failure.
 *
 * The API reports validation failures as a list of these, one per offending field:
 *
 * ```json
 * {"errors":[{"field":"ProductName","message":"ProductName is too short"},
 *            {"field":"Price","message":"Price is too short"}]}
 * ```
 */
export interface FieldError {
	/** Name of the offending field, as the API names it. */
	field: string;
	/** The API's explanation for that field. */
	message: string;
}

/** Optional details attached to an error. */
export interface QBitFlowErrorOptions {
	/** Per-field validation failures reported by the API. */
	fields?: FieldError[];
	/** HTTP status of the response that produced this error, when there was one. */
	statusCode?: number;
}

/**
 * Base error class for all QBitFlow SDK errors
 */
export class QBitFlowError extends Error {
	/**
	 * Per-field validation failures, when the API reported them; empty otherwise.
	 *
	 * Prefer this over parsing `message` when you need to map failures back onto form
	 * fields. `message` lists every failure too, but as prose.
	 */
	public readonly fields: FieldError[];

	/**
	 * HTTP status code of the response that produced this error. Undefined for errors the
	 * SDK raised itself — client-side validation, or a request that got no response.
	 */
	public readonly statusCode?: number;

	constructor(message: string, options: QBitFlowErrorOptions = {}) {
		super(message);
		this.name = 'QBitFlowError';
		this.fields = options.fields ?? [];
		this.statusCode = options.statusCode;
		Object.setPrototypeOf(this, QBitFlowError.prototype);
	}
}

/**
 * Error thrown when a resource is not found (404)
 */
export class NotFoundException extends QBitFlowError {
	constructor(message: string = 'Resource not found', options: QBitFlowErrorOptions = {}) {
		super(message, { statusCode: 404, ...options });
		this.name = 'NotFoundException';
		Object.setPrototypeOf(this, NotFoundException.prototype);
	}
}

/**
 * Error thrown when authentication fails (401)
 */
export class UnauthorizedException extends QBitFlowError {
	constructor(
		message: string = 'Unauthorized: Invalid API key',
		options: QBitFlowErrorOptions = {}
	) {
		super(message, { statusCode: 401, ...options });
		this.name = 'UnauthorizedException';
		Object.setPrototypeOf(this, UnauthorizedException.prototype);
	}
}

/**
 * Error thrown when a request is forbidden (403)
 */
export class ForbiddenException extends QBitFlowError {
	constructor(message: string = 'Forbidden: Access denied', options: QBitFlowErrorOptions = {}) {
		super(message, { statusCode: 403, ...options });
		this.name = 'ForbiddenException';
		Object.setPrototypeOf(this, ForbiddenException.prototype);
	}
}

/**
 * Error thrown when request validation fails — by the API (400, 422) or by the SDK before
 * the request is sent (client-side checks; `statusCode` is then undefined).
 */
export class ValidationException extends QBitFlowError {
	constructor(message: string = 'Validation failed', options: QBitFlowErrorOptions = {}) {
		super(message, options);
		this.name = 'ValidationException';
		Object.setPrototypeOf(this, ValidationException.prototype);
	}
}

/**
 * Error thrown when the request conflicts with the current state of the resource (409) —
 * for example triggering a billing cycle on a subscription that is not yet due.
 */
export class ConflictException extends QBitFlowError {
	constructor(message: string = 'Conflict', options: QBitFlowErrorOptions = {}) {
		super(message, { statusCode: 409, ...options });
		this.name = 'ConflictException';
		Object.setPrototypeOf(this, ConflictException.prototype);
	}
}

/** Options for {@link RateLimitException}. */
export interface RateLimitExceptionOptions extends QBitFlowErrorOptions {
	/** Seconds to wait before retrying, from the `Retry-After` header. */
	retryAfter?: number;
}

/**
 * Error thrown when rate limit is exceeded (429). Rate-limited requests are never retried
 * automatically; honour {@link RateLimitException.retryAfter} when it is present.
 */
export class RateLimitException extends QBitFlowError {
	/** Seconds to wait before retrying, as advertised by the API's `Retry-After` header. */
	public readonly retryAfter?: number;

	constructor(message: string = 'Rate limit exceeded', options: RateLimitExceptionOptions = {}) {
		const { retryAfter, ...rest } = options;
		super(message, { statusCode: 429, ...rest });
		this.name = 'RateLimitException';
		this.retryAfter = retryAfter;
		Object.setPrototypeOf(this, RateLimitException.prototype);
	}
}

/**
 * Error thrown when the API misbehaves: a 5xx (after the retry budget is spent on GET
 * requests), a 3xx (the base URL is misconfigured), a 2xx whose body is empty (other than a
 * 204) or not JSON, or a response field of the wrong JSON type (the message names the field
 * path). `statusCode` is the HTTP status of the offending response.
 */
export class ServerException extends QBitFlowError {
	constructor(message: string = 'Internal server error', options: QBitFlowErrorOptions = {}) {
		super(message, options);
		this.name = 'ServerException';
		Object.setPrototypeOf(this, ServerException.prototype);
	}
}

/**
 * Error thrown when no response was received: connection refused, DNS failure, timeout — or
 * a request that could not be sent at all. GET requests are retried on transport failures
 * before this is thrown; other verbs, and requests that could not be built, fail on the
 * first attempt.
 */
export class NetworkException extends QBitFlowError {
	constructor(message: string = 'Network request failed', options: QBitFlowErrorOptions = {}) {
		super(message, options);
		this.name = 'NetworkException';
		Object.setPrototypeOf(this, NetworkException.prototype);
	}
}
