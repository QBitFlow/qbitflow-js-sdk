/**
 * Schema-driven response decoding.
 *
 * TypeScript types are erased at runtime, so casting `JSON.parse` output to an interface
 * promises fields the API may legitimately leave out. Every response is therefore decoded
 * against a schema that mirrors the Go server type, with one policy for all four QBitFlow
 * SDKs:
 *
 * - A field that is **absent or `null`** where the type is non-nullable decodes to its zero
 *   value — `0`, `''`, `false`, `[]`, a zero-valued nested object, or the Go zero time
 *   `0001-01-01T00:00:00Z` — exactly as Go's `encoding/json` would. Never an error.
 * - A **nullable** field (a Go pointer) is always present on the decoded object, as its value
 *   or `null`.
 * - A field present with the **wrong JSON type** (a string where a number is expected, an
 *   object where a list is expected …) is a response-shape failure: a {@link ServerException}
 *   naming the field path and carrying the HTTP status.
 * - Unknown extra keys are kept on the object; enum values the SDK does not know stay raw
 *   strings.
 *
 * @internal Not part of the public API.
 */

import { ServerException } from './exceptions/index.js';

/** Go's zero `time.Time`, which a non-nullable timestamp decodes to when it is absent. */
export const ZERO_TIME = '0001-01-01T00:00:00Z';

/** Context threaded through a decode, used to build errors. */
export interface DecodeContext {
	/** HTTP status of the response being decoded, when there was one. */
	statusCode?: number;
}

/** A decoder for one JSON value of type `T`. */
export interface Schema<T> {
	/** Human-readable description of the expected JSON value, used in errors. */
	readonly expected: string;
	/**
	 * Decode `value` (a parsed JSON value, or `undefined` when absent).
	 * @param path - Location of the value, for error messages (`items[2].currency.id`)
	 */
	decode(value: unknown, path: string, ctx: DecodeContext): T;
}

const isAbsent = (value: unknown): value is null | undefined =>
	value === undefined || value === null;

const describe = (value: unknown): string => {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	switch (typeof value) {
		case 'string':
			return 'a string';
		case 'number':
			return 'a number';
		case 'boolean':
			return 'a boolean';
		case 'object':
			return 'an object';
		default:
			return typeof value;
	}
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** Build the response-shape failure for a value of the wrong JSON type. */
export function shapeError(
	expected: string,
	value: unknown,
	path: string,
	ctx: DecodeContext
): ServerException {
	return new ServerException(
		`Unexpected response shape at ${path === '' ? '<root>' : path}: expected ${expected}, got ${describe(value)}`,
		{ statusCode: ctx.statusCode }
	);
}

const childPath = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

/** A JSON string; absent/null → `''`. */
export const string: Schema<string> = {
	expected: 'a string',
	decode(value, path, ctx) {
		if (isAbsent(value)) return '';
		if (typeof value === 'string') return value;
		throw shapeError(this.expected, value, path, ctx);
	},
};

/**
 * A string-valued enum. Values the SDK does not know are passed through unchanged.
 */
export function enumString<E extends string>(): Schema<E | (string & {})> {
	return string as Schema<E | (string & {})>;
}

/** A JSON number (Go float); absent/null → `0`. */
export const number: Schema<number> = {
	expected: 'a number',
	decode(value, path, ctx) {
		if (isAbsent(value)) return 0;
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		throw shapeError(this.expected, value, path, ctx);
	},
};

/** A JSON integer (Go int/uint); absent/null → `0`. An integral float such as `3.0` is fine. */
export const integer: Schema<number> = {
	expected: 'an integer',
	decode(value, path, ctx) {
		if (isAbsent(value)) return 0;
		if (typeof value === 'number' && Number.isInteger(value)) return value;
		throw shapeError(this.expected, value, path, ctx);
	},
};

/** A JSON boolean; absent/null → `false`. */
export const boolean: Schema<boolean> = {
	expected: 'a boolean',
	decode(value, path, ctx) {
		if (isAbsent(value)) return false;
		if (typeof value === 'boolean') return value;
		throw shapeError(this.expected, value, path, ctx);
	},
};

/** An RFC3339 timestamp string (Go `time.Time`); absent/null → {@link ZERO_TIME}. */
export const timestamp: Schema<string> = {
	expected: 'an RFC3339 timestamp string',
	decode(value, path, ctx) {
		if (isAbsent(value)) return ZERO_TIME;
		if (typeof value === 'string') return value;
		throw shapeError(this.expected, value, path, ctx);
	},
};

/** Any JSON value, passed through untouched (absent → `undefined`). */
export const unknownValue: Schema<unknown> = {
	expected: 'any JSON value',
	decode(value) {
		return value;
	},
};

/** A Go pointer: absent/null → `null`, otherwise decoded by `inner`. */
export function nullable<T>(inner: Schema<T>): Schema<T | null> {
	return {
		get expected() {
			return `${inner.expected} or null`;
		},
		decode(value, path, ctx) {
			return isAbsent(value) ? null : inner.decode(value, path, ctx);
		},
	};
}

/** A Go slice: absent/null → `[]`, otherwise every element decoded by `item`. */
export function list<T>(item: Schema<T>): Schema<T[]> {
	return {
		expected: 'an array',
		decode(value, path, ctx) {
			if (isAbsent(value)) return [];
			if (!Array.isArray(value)) throw shapeError(this.expected, value, path, ctx);
			return value.map((element, index) => item.decode(element, `${path}[${index}]`, ctx));
		},
	};
}

/** The field decoders of an object schema: exactly one per property of `T`. */
export type Fields<T> = { [K in keyof T]-?: Schema<T[K]> };

/**
 * A Go struct: absent/null → every field at its zero value; otherwise each known field is
 * decoded and unknown keys are kept as they are.
 */
export function object<T>(fields: Fields<T>): Schema<T> {
	const keys = Object.keys(fields) as Array<keyof T & string>;
	return {
		expected: 'an object',
		decode(value, path, ctx) {
			if (!isAbsent(value) && !isPlainObject(value)) {
				throw shapeError(this.expected, value, path, ctx);
			}
			const source: Record<string, unknown> = isAbsent(value) ? {} : value;
			const out: Record<string, unknown> = { ...source };
			for (const key of keys) {
				out[key] = fields[key].decode(source[key], childPath(path, key), ctx);
			}
			return out as T;
		},
	};
}

/** Defer building a schema, for recursive types (`Currency.mainCurrency`). */
export function lazy<T>(build: () => Schema<T>): Schema<T> {
	let resolved: Schema<T> | undefined;
	const get = (): Schema<T> => (resolved ??= build());
	return {
		get expected() {
			return get().expected;
		},
		decode(value, path, ctx) {
			return get().decode(value, path, ctx);
		},
	};
}

/**
 * A value whose shape depends on a discriminator in the raw JSON (a session by `txType`, a
 * subscription webhook by `type`).
 */
export function custom<T>(
	expected: string,
	decode: (value: unknown, path: string, ctx: DecodeContext) => T
): Schema<T> {
	return { expected, decode };
}

/**
 * Read a raw member of a JSON object without decoding it (for discriminators).
 */
export function rawMember(value: unknown, key: string): unknown {
	return isPlainObject(value) ? value[key] : undefined;
}

/** Decode a whole response body. */
export function decodeWith<T>(schema: Schema<T>, value: unknown, ctx: DecodeContext = {}): T {
	return schema.decode(value, '', ctx);
}
