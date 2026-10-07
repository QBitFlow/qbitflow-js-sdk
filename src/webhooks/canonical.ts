/**
 * Canonical JSON, byte-identical to Go's `encoding/json`, and webhook-body decoding.
 *
 * @internal Not part of the public API; use `canonicalJson` / `verifyWebhookSignature`.
 */

import { ValidationException } from '../exceptions/index.js';

/** A lone UTF-16 surrogate (half of a pair with no partner). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Replace every lone surrogate with U+FFFD, as Go does when it decodes a JSON string such as
 * `"\ud800"` (Go strings are UTF-8, where a lone surrogate cannot exist).
 */
export function toWellFormed(value: string): string {
	return value.replace(LONE_SURROGATE, '\uFFFD');
}

/**
 * Compare two well-formed strings by code point — which is the order of their UTF-8 bytes,
 * the order Go sorts map keys in. (JavaScript's default sort compares UTF-16 code units, which
 * puts U+10000.. before U+E000..U+FFFF.)
 */
export function compareCodePoints(a: string, b: string): number {
	const length = Math.min(a.length, b.length);
	for (let i = 0; i < length; ) {
		const ca = a.codePointAt(i) as number;
		const cb = b.codePointAt(i) as number;
		if (ca !== cb) {
			return ca - cb;
		}
		i += ca > 0xffff ? 2 : 1;
	}
	return a.length - b.length;
}

/**
 * Quote a string the way Go's `encoding/json` does.
 *
 * `JSON.stringify` already matches Go for quotes, backslashes and control characters
 * (`\b`, `\f`, `\n`, `\r`, `\t`, `\u00XX` otherwise) and leaves non-ASCII literal. Go
 * additionally escapes `<`, `>` and `&` (HTML-safe output) and the line terminators
 * U+2028 / U+2029; those are applied here. All five only ever appear inside string values,
 * so replacing on the quoted output is safe.
 */
function encodeString(value: string): string {
	return JSON.stringify(toWellFormed(value))
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/**
 * Render a number the way Go's `encoding/json` does for a float64.
 *
 * Go formats floats with ECMAScript's rules — shortest round-trip digits, plain decimal for
 * exponents in [-6, 21), `d.ddde±x` outside that range — so `JSON.stringify` agrees with it
 * byte for byte, with one exception: Go writes a negative zero as `-0`, JavaScript as `0`.
 */
function encodeNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new ValidationException('JSON value contains a non-finite number');
	}
	if (Object.is(value, -0)) {
		return '-0';
	}
	return JSON.stringify(value);
}

/**
 * Serialize a plain JSON value into its canonical form: object keys sorted at every level by
 * UTF-8 byte order, arrays in their original order, no whitespace, Go's escaping and number
 * formatting, lone surrogates replaced by U+FFFD.
 */
export function encodeCanonical(value: unknown): string {
	if (value === null) {
		return 'null';
	}

	switch (typeof value) {
		case 'boolean':
			return value ? 'true' : 'false';
		case 'number':
			return encodeNumber(value);
		case 'string':
			return encodeString(value);
		case 'object':
			break;
		default:
			throw new ValidationException(`JSON value contains a ${typeof value}`);
	}

	if (Array.isArray(value)) {
		return (
			'[' +
			value.map((item) => (item === undefined ? 'null' : encodeCanonical(item))).join(',') +
			']'
		);
	}

	// Keys that differ only by a lone surrogate collapse onto the same Go key; the later
	// member wins, as it does in Go's decoder.
	const members = new Map<string, unknown>();
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (item === undefined) {
			continue; // JSON.stringify drops undefined members too.
		}
		members.set(toWellFormed(key), item);
	}

	const keys = [...members.keys()].sort(compareCodePoints);
	return (
		'{' +
		keys.map((key) => encodeString(key) + ':' + encodeCanonical(members.get(key))).join(',') +
		'}'
	);
}

/**
 * Turn any JS value into the plain JSON value `JSON.stringify` would produce — honouring
 * `toJSON` (Dates …), unwrapping boxed primitives, dropping `undefined`/functions/symbols
 * from objects (`null` in arrays) — but keeping `-0`, which a `JSON.stringify` round trip
 * would lose. A value JSON cannot represent is a {@link ValidationException}.
 */
export function toPlainJson(value: unknown, what: string, stack: object[] = []): unknown {
	if (value !== null && typeof value === 'object') {
		const withToJson = value as { toJSON?: unknown };
		if (typeof withToJson.toJSON === 'function') {
			return toPlainJson((withToJson.toJSON as () => unknown).call(value), what, stack);
		}
		if (value instanceof Number || value instanceof String || value instanceof Boolean) {
			return toPlainJson(value.valueOf(), what, stack);
		}
	}

	switch (typeof value) {
		case 'string':
		case 'boolean':
			return value;
		case 'number':
			if (!Number.isFinite(value)) {
				throw new ValidationException(`${what} contains a non-finite number (${value})`);
			}
			return value;
		case 'bigint':
			throw new ValidationException(`${what} contains a BigInt, which JSON cannot represent`);
		case 'undefined':
		case 'function':
		case 'symbol':
			return undefined;
	}

	if (value === null) {
		return null;
	}

	if (stack.includes(value as object)) {
		throw new ValidationException(`${what} contains a circular reference`);
	}
	const nested = [...stack, value as object];

	if (Array.isArray(value)) {
		return value.map((item) => {
			const plain = toPlainJson(item, what, nested);
			return plain === undefined ? null : plain;
		});
	}

	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		const plain = toPlainJson(item, what, nested);
		if (plain !== undefined) {
			out[key] = plain;
		}
	}
	return out;
}

/** Whether a value is an ArrayBuffer (checked by tag, so it also works across realms). */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
	const tag = Object.prototype.toString.call(value);
	return tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]';
}

/** Whether a value is raw bytes: a Buffer, any typed array / DataView, or an ArrayBuffer. */
function isBytes(value: unknown): value is ArrayBufferView | ArrayBuffer {
	return ArrayBuffer.isView(value) || isArrayBuffer(value);
}

/** Decode raw bytes as UTF-8 text. */
function bytesToText(value: ArrayBufferView | ArrayBuffer): string {
	if (ArrayBuffer.isView(value)) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8');
	}
	return Buffer.from(value).toString('utf8');
}

/**
 * Decode a webhook body given in any of the forms frameworks hand it over in:
 *
 * - raw JSON text: a `string`, a `Buffer`, a `Uint8Array` (or any typed array / DataView), an
 *   `ArrayBuffer` — parsed as JSON;
 * - an already-parsed value — reduced to its plain JSON view (see {@link toPlainJson}).
 *
 * @throws {ValidationException} When the body is missing, is not valid JSON, or contains a
 *   value JSON cannot represent
 */
export function decodeJsonInput(payload: unknown, what = 'webhook payload'): unknown {
	if (payload === undefined || payload === null) {
		throw new ValidationException(`${what} is required`);
	}

	if (typeof payload === 'string' || isBytes(payload)) {
		const text = typeof payload === 'string' ? payload : bytesToText(payload);
		try {
			return JSON.parse(text) as unknown;
		} catch {
			throw new ValidationException(`${what} is not valid JSON`);
		}
	}

	const plain = toPlainJson(payload, what);
	if (plain === undefined) {
		throw new ValidationException(`${what} cannot be serialized as JSON`);
	}
	return plain;
}
