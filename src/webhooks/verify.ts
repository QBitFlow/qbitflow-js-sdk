/**
 * Local webhook signature verification.
 *
 * Verifying locally needs your webhook secret but no network call, so it keeps working
 * when the API is unreachable and costs nothing per webhook. The alternative,
 * `client.webhooks.verify()`, asks QBitFlow to check the signature for you: no secret
 * required, but one round-trip per webhook.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { ValidationException } from '../exceptions/index.js';
import { decodeJsonInput, encodeCanonical } from './canonical.js';

/** Header carrying the HMAC signature, formatted `sha256=<hex>`. */
export const HEADER_SIGNATURE = 'X-Webhook-Signature-256';
/** Header carrying the send time, in unix seconds. */
export const HEADER_TIMESTAMP = 'X-Webhook-Timestamp';
/** Header carrying the transaction id, e.g. `pay@<uuid>`. */
export const HEADER_WEBHOOK_ID = 'X-Webhook-Id';

/**
 * How far a webhook's timestamp may be from the current clock before it is rejected as a
 * replay. Must match the server's `MaxTimestampAge`.
 */
export const DEFAULT_MAX_TIMESTAMP_AGE_SECONDS = 300;

const SIGNATURE_PREFIX = 'sha256=';

/** Options for {@link verifyWebhookSignature}. */
export interface VerifyWebhookOptions {
	/**
	 * Replay window in seconds. Defaults to {@link DEFAULT_MAX_TIMESTAMP_AGE_SECONDS}; a value
	 * `<= 0` also means the default.
	 */
	maxTimestampAgeSeconds?: number;
	/** Override the clock, in unix seconds. Test-only. */
	nowSeconds?: number;
	/**
	 * Skip the replay check.
	 *
	 * Leave this off in production: without the check a captured webhook can be replayed
	 * forever. It exists for replaying stored webhooks in a test harness.
	 */
	skipTimestampCheck?: boolean;
}

/**
 * Render a webhook payload the way QBitFlow signs it.
 *
 * The signature covers a *canonical* rendering rather than the bytes as they arrived,
 * because JSON key order is not significant and intermediaries (proxies, frameworks,
 * logging layers) routinely re-serialize a body and reorder keys. Signing raw bytes would
 * make verification fail for a payload that is in fact untouched.
 *
 * Canonical means: object keys sorted at every level (by UTF-8 byte order), no insignificant
 * whitespace, non-ASCII left literal, `<`, `>`, `&`, U+2028 and U+2029 escaped as `\u003c`,
 * `\u003e`, `\u0026`, `\u2028`, `\u2029`, a lone surrogate replaced by U+FFFD, and every
 * number rendered from its float64 value under Go's formatting rules (`-0` included).
 *
 * Those rules come from Go: the QBitFlow API is written in Go and its `encoding/json`
 * behaves exactly so. Every QBitFlow SDK reproduces them, so all four compute an identical
 * signature for the same payload, and each SDK's test suite pins the same Go-generated
 * reference vectors.
 *
 * @param payload - Raw JSON (a string, a Buffer / Uint8Array / ArrayBuffer), or an
 *   already-parsed value
 * @returns The canonical JSON string that gets signed
 * @throws {ValidationException} When the payload is missing, is not valid JSON, or contains a
 *   value JSON cannot represent (a non-finite number, a BigInt, a circular reference)
 */
export function canonicalJson(payload: unknown): string {
	return encodeCanonical(decodeJsonInput(payload));
}

/**
 * Compute the signature QBitFlow would send for a payload.
 *
 * The signed message is `<timestamp>.<canonical-json>`; the result is the hex-encoded
 * HMAC-SHA256 of that message under your webhook secret, prefixed with `sha256=` — exactly
 * the value delivered in the `X-Webhook-Signature-256` header.
 *
 * Exported mainly so you can generate valid webhooks in your own tests. To check an
 * incoming webhook use {@link verifyWebhookSignature}, which also enforces the replay
 * window and compares in constant time.
 *
 * @param secret - Your webhook secret, from the QBitFlow dashboard
 * @param timestamp - The `X-Webhook-Timestamp` value
 * @param payload - The webhook body
 */
export function computeWebhookSignature(
	secret: string,
	timestamp: string,
	payload: unknown
): string {
	if (!secret) {
		throw new ValidationException('webhook secret is required');
	}
	if (!timestamp) {
		throw new ValidationException('webhook timestamp is required');
	}

	const hmac = createHmac('sha256', secret);
	hmac.update(timestamp, 'utf8');
	hmac.update('.', 'utf8');
	hmac.update(canonicalJson(payload), 'utf8');

	return SIGNATURE_PREFIX + hmac.digest('hex');
}

/** Compare two strings without leaking how many leading bytes matched. */
function constantTimeEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');

	// timingSafeEqual throws on a length mismatch, which would itself leak length. Compare
	// against a fixed-size digest of each so the comparison is always equal-length.
	const digestA = createHmac('sha256', 'length-guard').update(bufA).digest();
	const digestB = createHmac('sha256', 'length-guard').update(bufB).digest();

	return timingSafeEqual(digestA, digestB) && bufA.length === bufB.length;
}

/**
 * Verify a webhook locally, without calling the QBitFlow API.
 *
 * Performs the same three checks the server does:
 *
 * 1. The timestamp is within the replay window, which is what stops a captured webhook
 *    from being replayed later.
 * 2. The HMAC-SHA256 of `<timestamp>.<canonical-json>` under your secret matches.
 * 3. The comparison is constant-time, so a timing side channel cannot be used to guess the
 *    signature byte by byte.
 *
 * The secret comes from the QBitFlow dashboard. Treat it like a password: keep it in your
 * environment or secret manager, never in source control, and never send it anywhere.
 *
 * @throws {ValidationException} When the webhook is not authentic — do not trust the payload
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature, extractWebhookHeaders } from 'qbitflow';
 *
 * app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
 *   const { signature, timestamp } = extractWebhookHeaders(req.headers);
 *   try {
 *     verifyWebhookSignature(process.env.QBITFLOW_WEBHOOK_SECRET!, timestamp, signature, req.body);
 *   } catch {
 *     return res.status(400).send('invalid webhook');
 *   }
 *   const event = JSON.parse(req.body.toString('utf8'));
 *   res.sendStatus(200);
 * });
 * ```
 */
export function verifyWebhookSignature(
	secret: string,
	timestamp: string,
	signature: string,
	payload: unknown,
	options: VerifyWebhookOptions = {}
): void {
	if (!signature) {
		throw new ValidationException('webhook signature is required');
	}

	if (!options.skipTimestampCheck) {
		verifyTimestamp(timestamp, options);
	}

	const expected = computeWebhookSignature(secret, timestamp, payload);

	if (!constantTimeEquals(expected, signature)) {
		throw new ValidationException('webhook signature mismatch');
	}
}

/** Bounds of a Go `int64`, the type the server parses the timestamp into. */
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/**
 * Enforce the replay window, comparing in absolute terms so a webhook from a clock
 * slightly ahead of ours is treated the same as one slightly behind.
 *
 * The timestamp is parsed like Go's `strconv.ParseInt`: ASCII `[+-]?[0-9]+`, no surrounding
 * whitespace, within the int64 range. The age is computed exactly (BigInt), so an extreme
 * timestamp cannot overflow into the window.
 */
function verifyTimestamp(timestamp: string, options: VerifyWebhookOptions): void {
	if (!timestamp) {
		throw new ValidationException('webhook timestamp is required');
	}

	if (!/^[+-]?[0-9]+$/.test(timestamp)) {
		throw new ValidationException('webhook timestamp is not a unix-seconds integer');
	}

	const ts = BigInt(timestamp);
	if (ts < INT64_MIN || ts > INT64_MAX) {
		throw new ValidationException('webhook timestamp is out of range');
	}

	const now = BigInt(Math.floor(options.nowSeconds ?? Date.now() / 1000));
	const configured = options.maxTimestampAgeSeconds;
	const maxAge =
		typeof configured === 'number' && Number.isFinite(configured) && configured > 0
			? configured
			: DEFAULT_MAX_TIMESTAMP_AGE_SECONDS;
	const diff = now - ts;
	const age = diff < 0n ? -diff : diff;

	if (Number(age) > maxAge) {
		throw new ValidationException(
			`webhook timestamp expired: age ${age}s exceeds the maximum of ${maxAge}s`
		);
	}
}

/** The QBitFlow headers carried by an incoming webhook. */
export interface WebhookHeaders {
	/** `X-Webhook-Signature-256`, formatted `sha256=<hex>`. */
	signature: string;
	/** `X-Webhook-Timestamp`, in unix seconds. */
	timestamp: string;
	/** `X-Webhook-Id`: the transaction id, e.g. `pay@<uuid>`. */
	webhookId: string;
	/** True when this is the dashboard's connectivity test rather than a real transaction. */
	isTest: boolean;
}

/** The dashboard "Test webhook" id. */
export const TEST_WEBHOOK_ID = 'test-webhook-id';

/**
 * Pull the QBitFlow headers out of an incoming request.
 *
 * Accepts anything header-shaped, so it works across frameworks without the SDK having to
 * know about them: a Node `IncomingHttpHeaders` (Express, Fastify, raw `http`), a Fetch
 * `Headers` instance (Next.js route handlers, Hono, Deno, Bun), or a plain object. Lookup
 * is case-insensitive, since HTTP header names are.
 *
 * @example
 * ```typescript
 * const { signature, timestamp, isTest } = extractWebhookHeaders(req.headers);
 * if (isTest) return res.sendStatus(200); // connectivity check, nothing to process
 * ```
 */
export function extractWebhookHeaders(
	headers: Headers | Record<string, string | string[] | undefined>
): WebhookHeaders {
	const get = (name: string): string => {
		// Fetch API Headers: already case-insensitive.
		if (typeof (headers as Headers).get === 'function') {
			return (headers as Headers).get(name) ?? '';
		}

		const plain = headers as Record<string, string | string[] | undefined>;
		const wanted = name.toLowerCase();
		for (const key of Object.keys(plain)) {
			if (key.toLowerCase() === wanted) {
				const value = plain[key];
				return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
			}
		}
		return '';
	};

	const webhookId = get(HEADER_WEBHOOK_ID);

	return {
		signature: get(HEADER_SIGNATURE),
		timestamp: get(HEADER_TIMESTAMP),
		webhookId,
		isTest: webhookId === TEST_WEBHOOK_ID,
	};
}
