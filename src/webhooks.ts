/**
 * Webhook verification and parsing, usable without a client (a webhook receiver may not hold an
 * API key):
 *
 * ```ts
 * import { webhooks } from 'qbitflow';
 *
 * const event = webhooks.constructEvent(rawBody, req.headers['qbitflow-signature'], secret);
 * if (event.type === 'payment.completed') fulfil(event.data.reference);
 * ```
 *
 * `client.webhooks.verify`, `constructEvent` and `parseEvent` delegate to these functions.
 *
 * @module
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { type DecodeContext, describe } from './decode.js';
import { EventType, type KnownEventType } from './enums.js';
import { fieldError, WebhookSignatureError, type WebhookSignatureReason } from './errors.js';
import type { PaymentSessionData, SubscriptionSessionData } from './models/checkout.js';
import type { Event, EventOf, UnknownEvent } from './models/events.js';
import { EnvelopeSchema, EVENT_DATA_SCHEMAS } from './schemas.js';
import { trimSpace } from './validate.js';

/** The header carrying `t=<unix seconds>,v1=<hex>` (two `v1` during a secret rotation). */
export const SIGNATURE_HEADER = 'QBitFlow-Signature';
/** The header carrying the event's id (`evt_…`): deduplicate on it. */
export const EVENT_ID_HEADER = 'QBitFlow-Event-Id';
/** The header carrying the event's type. */
export const EVENT_TYPE_HEADER = 'QBitFlow-Event-Type';
/** The header carrying the payload version (`v1` or `v2`). */
export const WEBHOOK_VERSION_HEADER = 'QBitFlow-Webhook-Version';
/** How far a signature's timestamp may be from now by default, in seconds. */
export const DEFAULT_TOLERANCE = 300;

/** A webhook body as received: the raw bytes, or the text decoded from them (never re-serialized JSON). */
export type RawBody = string | Uint8Array;

/** A signature header as a framework hands it over (Node's `IncomingHttpHeaders` included). */
export type SignatureHeader = string | readonly string[] | null | undefined;

/** Options of {@link verify} and {@link constructEvent}. */
export interface VerifyOptions {
	/** How far the signature's timestamp may be from now, in seconds, in either direction (default 300; 0 or less keeps it). */
	tolerance?: number;
	/** The clock the timestamp is checked against (tests, replays): a date, or a function returning one. */
	now?: Date | (() => Date);
}

const MAX_INT64 = 2n ** 63n - 1n;

function bodyBytes(rawBody: RawBody): Buffer {
	if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
	if (rawBody instanceof Uint8Array)
		return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
	throw fieldError('body', 'must be a string or bytes (the raw body as received)');
}

function headerText(header: SignatureHeader): string {
	if (typeof header === 'string') return header;
	if (Array.isArray(header)) return header.join(',');
	return '';
}

function signatureError(reason: WebhookSignatureReason, message: string): WebhookSignatureError {
	return new WebhookSignatureError({ message, reason });
}

/**
 * Splits `t=…,v1=…[,v1=…]`: parts on `,`, each on its first `=`, spaces trimmed, other keys
 * ignored. It needs exactly one `t` made of ASCII digits (an int64), and a `v1`.
 */
function parseSignatureHeader(
	header: string
): { timestamp: bigint; text: string; signatures: string[] } | undefined {
	let timestamp: bigint | undefined;
	let text = '';
	const signatures: string[] = [];
	for (const part of header.split(',')) {
		const eq = part.indexOf('=');
		if (eq < 0) continue;
		const key = trimSpace(part.slice(0, eq));
		const value = trimSpace(part.slice(eq + 1));
		if (key === 't') {
			if (timestamp !== undefined || !/^[0-9]+$/.test(value)) return undefined;
			const t = BigInt(value);
			if (t > MAX_INT64) return undefined;
			timestamp = t;
			text = value;
		} else if (key === 'v1') {
			signatures.push(value);
		}
	}
	return timestamp !== undefined && signatures.length > 0
		? { timestamp, text, signatures }
		: undefined;
}

/**
 * Checks a webhook delivery's signature. `rawBody` is the body exactly as received (never
 * re-serialized), `signatureHeader` the `QBitFlow-Signature` header (`t=<unix
 * seconds>,v1=<hex>[,v1=<hex>]`), `secret` the endpoint's `whsec_…` secret.
 *
 * It accepts the delivery when `t` is within the tolerance (300 s) of now and any `v1` equals
 * `hex(HMAC-SHA256(secret, t + "." + rawBody))`, compared in constant time; during a secret
 * rotation either secret's signature matches. It returns nothing, or throws a
 * `WebhookSignatureError` whose `reason` says why (an empty secret is a `ValidationError`).
 */
export function verify(
	rawBody: RawBody,
	signatureHeader: SignatureHeader,
	secret: string,
	options: VerifyOptions = {}
): void {
	if (typeof secret !== 'string' || secret === '') {
		throw fieldError('secret', "is required (the endpoint's whsec_… secret)");
	}
	const body = bodyBytes(rawBody);
	const header = headerText(signatureHeader);
	if (trimSpace(header) === '') {
		throw signatureError('missingHeader', `missing ${SIGNATURE_HEADER} header`);
	}
	const parsed = parseSignatureHeader(header);
	if (!parsed) {
		throw signatureError(
			'malformedHeader',
			`malformed ${SIGNATURE_HEADER} header: it needs one t=<unix seconds> and at least one v1=<signature>`
		);
	}

	const tolerance =
		typeof options.tolerance === 'number' &&
		Number.isFinite(options.tolerance) &&
		options.tolerance > 0
			? options.tolerance
			: DEFAULT_TOLERANCE;
	const clock = options.now;
	const now = clock === undefined ? new Date() : typeof clock === 'function' ? clock() : clock;
	const ageMs = now.getTime() - Number(parsed.timestamp) * 1000;
	if (!(Math.abs(ageMs) <= tolerance * 1000)) {
		throw signatureError(
			'timestampOutsideTolerance',
			`webhook timestamp is outside the tolerance (${tolerance} s)`
		);
	}

	const expected = Buffer.from(
		createHmac('sha256', Buffer.from(secret, 'utf8'))
			.update(`${parsed.text}.`) // the t text as received (leading zeros kept)
			.update(body)
			.digest('hex'),
		'utf8'
	);
	let matched = false;
	for (const signature of parsed.signatures) {
		// Every v1 is compared, in constant time: never stop at the first.
		const candidate = Buffer.from(signature, 'utf8');
		if (candidate.length === expected.length && timingSafeEqual(candidate, expected))
			matched = true;
	}
	if (!matched) throw signatureError('noMatchingSignature', 'no webhook signature matches');
}

/**
 * The `QBitFlow-Signature` header QBitFlow would send for `rawBody`: `t=<timestamp>,v1=<hex>`,
 * `hex(HMAC-SHA256(secret, t + "." + rawBody))`. For tests of your webhook handler:
 * `verify(body, sign(body, secret), secret)` passes. `timestamp` is in Unix seconds (default
 * now). An empty secret, or a timestamp that is not a non-negative integer, is a
 * `ValidationError`.
 */
export function sign(rawBody: RawBody, secret: string, timestamp?: number): string {
	if (typeof secret !== 'string' || secret === '') {
		throw fieldError('secret', "is required (the endpoint's whsec_… secret)");
	}
	const t = timestamp ?? Math.floor(Date.now() / 1000);
	if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 0) {
		throw fieldError('timestamp', 'must be a non-negative integer (Unix seconds)');
	}
	const signature = createHmac('sha256', Buffer.from(secret, 'utf8'))
		.update(`${t}.`)
		.update(bodyBytes(rawBody))
		.digest('hex');
	return `t=${t},v1=${signature}`;
}

/** The decode context of a webhook body: a wrong type is the caller's input, a `ValidationError`. */
function eventContext(field: 'body' | 'data', eventType: string): DecodeContext {
	return {
		fail(path, expected, value) {
			const detail = `${path === '' ? 'the body' : path} should be ${expected}, got ${describe(value)}`;
			return field === 'body'
				? fieldError('body', `is not a valid webhook event (${detail})`)
				: fieldError('data', `does not match the ${eventType} event's data (${detail})`);
		},
	};
}

/**
 * Parses a webhook body (or an event of the log) **without** verifying it: use it on a body
 * already verified (`verify`, `client.webhooks.verifyRemote`). A body that is not a JSON object,
 * whose version is not `v2`, or whose fields have the wrong type, is a `ValidationError`; an
 * unknown type is not an error (an {@link UnknownEvent} with its raw `data`).
 */
export function parseEvent(rawBody: RawBody): Event {
	const text =
		typeof rawBody === 'string' ? rawBody : new TextDecoder().decode(bodyBytes(rawBody));
	const trimmed = text.trim();
	if (!trimmed.startsWith('{'))
		throw fieldError('body', 'must be a JSON object (a webhook event)');
	let value: Record<string, unknown>;
	try {
		value = JSON.parse(trimmed) as Record<string, unknown>;
	} catch (err) {
		throw fieldError('body', 'is not a valid webhook event', err);
	}
	const envelope = EnvelopeSchema.decode(value, '', eventContext('body', ''));
	if (envelope.version !== 'v2') {
		throw fieldError(
			'version',
			'must be v2: the endpoint is still on v1, move it to v2 in the dashboard'
		);
	}
	const schema = Object.prototype.hasOwnProperty.call(EVENT_DATA_SCHEMAS, envelope.type)
		? EVENT_DATA_SCHEMAS[envelope.type]
		: undefined;
	const data = schema
		? schema.decode(value.data, 'data', eventContext('data', envelope.type))
		: value.data === undefined
			? null
			: value.data;
	return { ...envelope, data } as Event;
}

/** Verifies a webhook delivery ({@link verify}) and parses it ({@link parseEvent}). */
export function constructEvent(
	rawBody: RawBody,
	signatureHeader: SignatureHeader,
	secret: string,
	options: VerifyOptions = {}
): Event {
	verify(rawBody, signatureHeader, secret, options);
	return parseEvent(rawBody);
}

const KNOWN_EVENT_TYPES: readonly string[] = Object.values(EventType);

/** Narrows an event to a known type: `if (webhooks.isEventType(event, 'payment.completed')) event.data.reference`. */
export function isEventType<T extends KnownEventType>(event: Event, type: T): event is EventOf<T> {
	return event.type === type;
}

/** Whether the event's type is one this SDK does not know (its `data` is then raw). */
export function isUnknownEvent(event: Event): event is UnknownEvent {
	return !KNOWN_EVENT_TYPES.includes(event.type);
}

/** Tells a `checkout.expired` subscription session (`txType` `createSubscription`) from a payment session. */
export function isSubscriptionSession(
	data: PaymentSessionData | SubscriptionSessionData
): data is SubscriptionSessionData {
	return data.txType === 'createSubscription';
}

/**
 * The data of an event of type `type`, typed; a `ValidationError` when the event is of another
 * type.
 */
export function eventData<T extends KnownEventType>(event: Event, type: T): EventOf<T>['data'] {
	if (event.type !== type) throw fieldError('type', `is ${event.type}, not ${type}`);
	return (event as unknown as { data: EventOf<T>['data'] }).data;
}
