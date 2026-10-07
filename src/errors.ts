/**
 * The SDK's errors. Every error it throws is a {@link QBitFlowError}; every concrete class
 * extends {@link ApiError}, which carries the HTTP status, the API's `code`, `details`,
 * `requestId`, `fieldErrors` and the raw body.
 *
 * | Condition | Class |
 * |---|---|
 * | 400 `validation_failed`, or an input the SDK refused before sending (no `status`) | {@link ValidationError} |
 * | other 400 (`bad_request`, `foreign_key_violation`, …) | {@link BadRequestError} |
 * | 401 | {@link AuthenticationError} |
 * | 403 (`forbidden`, `policy_disabled`, `plan_required`) | {@link PermissionDeniedError} |
 * | 404 | {@link NotFoundError} |
 * | 409 (`unique_violation`, `tx_already_sent`, `merchant_not_ready`, …) | {@link ConflictError} |
 * | 410 (`merchant_closed`) | {@link GoneError} |
 * | 422 `idempotency_key_reused` | {@link IdempotencyError} |
 * | 429 | {@link RateLimitError} |
 * | other 4xx (413 `request_too_large`, …) | {@link ApiError} |
 * | 5xx, 3xx, a 2xx whose body is not the expected JSON | {@link ServerError} |
 * | no response (DNS, connection, TLS, timeout, abort) | {@link NetworkError} |
 * | a webhook signature that does not verify | {@link WebhookSignatureError} |
 *
 * `instanceof` works across the package's CommonJS and ES module builds (and across two copies
 * of the package): the classes match on a brand, not only on the prototype chain.
 *
 * @module
 */

/** One failing input of a validation error. */
export interface FieldError {
	/** The input's wire name, dotted when nested (e.g. `frequency.unit`). */
	field: string;
	/** What is wrong with it. */
	message: string;
}

/** The brands of an error instance (its class and every ancestor), shared by every copy of the SDK. */
const KINDS = Symbol.for('qbitflow.errorKinds');

/** The base class of every error the SDK throws. */
export class QBitFlowError extends Error {
	/** @internal The class's brand. */
	static readonly kind: string = 'QBitFlowError';

	/** Matches instances of this class created by any copy of the SDK (CJS or ESM build). */
	static [Symbol.hasInstance](value: unknown): boolean {
		if (Function.prototype[Symbol.hasInstance].call(this, value)) return true;
		if (value === null || typeof value !== 'object') return false;
		const kinds = (value as Record<symbol, unknown>)[KINDS];
		return Array.isArray(kinds) && kinds.includes((this as unknown as { kind: string }).kind);
	}

	constructor(message: string) {
		super(message);
		Object.setPrototypeOf(this, new.target.prototype);
		const kinds: string[] = [];
		for (
			let ctor: unknown = new.target;
			typeof ctor === 'function' && ctor !== Error;
			ctor = Object.getPrototypeOf(ctor)
		) {
			const kind = (ctor as { kind?: unknown }).kind;
			if (typeof kind === 'string' && !kinds.includes(kind)) kinds.push(kind);
		}
		Object.defineProperty(this, KINDS, { value: kinds, enumerable: false });
		Object.defineProperty(this, 'name', {
			value: (new.target as unknown as { kind: string }).kind,
			enumerable: false,
			configurable: true,
			writable: true,
		});
	}
}

/** What an {@link ApiError} is built from. @internal */
export interface ApiErrorInit {
	/** The API's message (the body's `error`), else a default. */
	message: string;
	status?: number;
	code?: string;
	details?: Record<string, unknown>;
	requestId?: string;
	fieldErrors?: FieldError[];
	rawBody?: string;
	cause?: unknown;
}

/**
 * The payload every SDK error carries, and the error thrown as is for an HTTP error without a
 * more specific class (e.g. 413 `request_too_large`).
 *
 * `message` reads `"<message> (status <status>, code <code>, request <requestId>)"` followed by
 * `"; <field>: <message>"` for each field error; {@link ApiError.rawMessage} is the API's own
 * message.
 */
export class ApiError extends QBitFlowError {
	static override readonly kind: string = 'ApiError';

	/** The HTTP status; `undefined` when no response was received (client-side checks, network errors). */
	readonly status: number | undefined;
	/** The API's machine-readable code (e.g. `not_found`, `unique_violation`); `''` when absent. */
	readonly code: string;
	/** The API's human-readable message (never branch on it), else a status default. */
	readonly rawMessage: string;
	/** The error body's structured data (e.g. `details.field`); never `null`. */
	readonly details: Record<string, unknown>;
	/** The request's id (the body's `requestId`, else the `X-Request-Id` response header); quote it to support. */
	readonly requestId: string;
	/** The failing inputs (`details.errors`, or the SDK's own checks), by wire name. */
	readonly fieldErrors: FieldError[];
	/** The error response's body as received (it may carry a development server's debug text); `''` without one. */
	readonly rawBody: string;
	/** The underlying cause (a transport, timeout or decoding error), if any. */
	readonly cause: unknown;

	constructor(init: ApiErrorInit) {
		super(formatMessage(init));
		this.status = init.status;
		this.code = init.code ?? '';
		this.rawMessage = init.message;
		this.details = init.details ?? {};
		this.requestId = init.requestId ?? '';
		this.fieldErrors = init.fieldErrors ?? [];
		this.rawBody = init.rawBody ?? '';
		this.cause = init.cause;
	}
}

/** Renders the error's message: `<message> (status …, code …, request …); field: message`. */
function formatMessage(init: ApiErrorInit): string {
	let out = init.message || 'qbitflow error';
	const meta: string[] = [];
	if (init.status) meta.push(`status ${init.status}`);
	if (init.code) meta.push(`code ${init.code}`);
	if (init.requestId) meta.push(`request ${init.requestId}`);
	if (meta.length > 0) out += ` (${meta.join(', ')})`;
	for (const fe of init.fieldErrors ?? []) out += `; ${fe.field}: ${fe.message}`;
	if (init.cause !== undefined) {
		const cause =
			init.cause instanceof Error
				? init.cause.message || init.cause.name
				: typeof init.cause === 'string'
					? init.cause
					: '';
		if (cause) out += `: ${cause}`;
	}
	return out;
}

/** A 400 `validation_failed`, or an input the SDK refused before sending anything (`status` undefined). */
export class ValidationError extends ApiError {
	static override readonly kind: string = 'ValidationError';
}

/** Any other 400 (`bad_request`, `foreign_key_violation`, …). */
export class BadRequestError extends ApiError {
	static override readonly kind: string = 'BadRequestError';
}

/** A 401: the API key is missing, unknown, expired or revoked. */
export class AuthenticationError extends ApiError {
	static override readonly kind: string = 'AuthenticationError';
}

/** A 403 (`forbidden`, `policy_disabled` with `details.policy`, `plan_required`). */
export class PermissionDeniedError extends ApiError {
	static override readonly kind: string = 'PermissionDeniedError';
}

/** A 404: the resource does not exist, or is outside the request's space. */
export class NotFoundError extends ApiError {
	static override readonly kind: string = 'NotFoundError';
}

/**
 * A 409 (`unique_violation` with `details.field`, `tx_already_sent`, `merchant_not_ready` with
 * `details.reason`, `refund_already_exists` with `details.refundUuid`, `held_funds_pending`,
 * `already_joined`, `payment_not_due`, `conflict`, `idempotency_key_in_use`, …).
 */
export class ConflictError extends ApiError {
	static override readonly kind: string = 'ConflictError';
}

/** A 410 (`merchant_closed`): the merchant's space is closed. */
export class GoneError extends ApiError {
	static override readonly kind: string = 'GoneError';
}

/** A 422 `idempotency_key_reused`: the key was already used for another request. Never retried. */
export class IdempotencyError extends ApiError {
	static override readonly kind: string = 'IdempotencyError';
}

/** What a {@link RateLimitError} is built from. @internal */
export interface RateLimitErrorInit extends ApiErrorInit {
	retryAfter?: number;
	limit?: number;
	periodSeconds?: number;
}

/**
 * A 429, thrown once the retries are exhausted, or at once when the API asks to wait more than
 * 60 seconds.
 */
export class RateLimitError extends ApiError {
	static override readonly kind: string = 'RateLimitError';

	/** How long the API asked to wait, in seconds (`Retry-After`, else `details.retryAfterSeconds`); 0 when unknown. */
	readonly retryAfter: number;
	/** The requests allowed per period (`details.limit`); 0 when unknown. */
	readonly limit: number;
	/** The limit's period in seconds (`details.periodSeconds`); 0 when unknown. */
	readonly periodSeconds: number;

	constructor(init: RateLimitErrorInit) {
		super(init);
		this.retryAfter = init.retryAfter ?? 0;
		this.limit = init.limit ?? 0;
		this.periodSeconds = init.periodSeconds ?? 0;
	}
}

/** A 5xx (503 `network_unavailable`, 504 `timeout` included), a 3xx (redirects are never followed), or a 2xx whose body is not the expected JSON. */
export class ServerError extends ApiError {
	static override readonly kind: string = 'ServerError';
}

/** No response was received (DNS, connection, TLS, timeout, an aborted signal). `cause` holds the reason. */
export class NetworkError extends ApiError {
	static override readonly kind: string = 'NetworkError';
}

/** Why a webhook signature was refused. */
export type WebhookSignatureReason =
	| 'missingHeader'
	| 'malformedHeader'
	| 'timestampOutsideTolerance'
	| 'noMatchingSignature'
	| 'invalidSignature';

/** The values of {@link WebhookSignatureReason}. */
export const WebhookSignatureReason = {
	/** The `QBitFlow-Signature` header is empty. */
	MissingHeader: 'missingHeader',
	/** No `t`, a `t` that is not an integer (or given twice), or no `v1`. */
	MalformedHeader: 'malformedHeader',
	/** `t` is too far from now, in either direction. */
	TimestampOutsideTolerance: 'timestampOutsideTolerance',
	/** No `v1` matches the expected signature. */
	NoMatchingSignature: 'noMatchingSignature',
	/** The API's check (`webhooks.verifyRemote`) refused it. */
	InvalidSignature: 'invalidSignature',
} as const satisfies Record<string, WebhookSignatureReason>;

/** What a {@link WebhookSignatureError} is built from. @internal */
export interface WebhookSignatureErrorInit extends ApiErrorInit {
	reason: WebhookSignatureReason;
}

/** A webhook's signature could not be verified: locally (no `status`) or by the API (400 `invalid_signature`). */
export class WebhookSignatureError extends ApiError {
	static override readonly kind: string = 'WebhookSignatureError';

	/** Why. */
	readonly reason: WebhookSignatureReason;

	constructor(init: WebhookSignatureErrorInit) {
		super(init);
		this.reason = init.reason;
	}
}

/** Error codes the SDK branches on. @internal */
export const CODE_VALIDATION_FAILED = 'validation_failed';
/** @internal */
export const CODE_IDEMPOTENCY_KEY_IN_USE = 'idempotency_key_in_use';
/** @internal */
export const CODE_IDEMPOTENCY_KEY_REUSED = 'idempotency_key_reused';
/** @internal */
export const CODE_INVALID_SIGNATURE = 'invalid_signature';

/**
 * Whether `err` is a failure the retry policy treats as transient: a network error or timeout, a
 * 5xx, a 429, or a 409 `idempotency_key_in_use`. It does not say whether the method may be
 * retried (only reads and the 7 idempotent creates are).
 */
export function isRetryable(err: unknown): boolean {
	if (err instanceof NetworkError || err instanceof RateLimitError) return true;
	if (err instanceof ServerError) return (err.status ?? 0) >= 500;
	if (err instanceof ConflictError) return err.code === CODE_IDEMPOTENCY_KEY_IN_USE;
	return false;
}

/** A client-side {@link ValidationError} (nothing was sent). @internal */
export function validationError(message: string, fieldErrors: FieldError[] = []): ValidationError {
	return new ValidationError({ message, fieldErrors });
}

/**
 * A client-side {@link ValidationError} for one input; the message follows the field's name
 * (`fieldError('timeout', 'must be positive')` → `timeout must be positive`). @internal
 */
export function fieldError(field: string, message: string, cause?: unknown): ValidationError {
	return new ValidationError({
		message: 'validation failed',
		fieldErrors: [{ field, message: `${field} ${message}` }],
		cause,
	});
}
