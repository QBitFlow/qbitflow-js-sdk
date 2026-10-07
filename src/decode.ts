/**
 * Schema-driven decoding of the API's answers and of webhook events.
 *
 * TypeScript types are erased at run time, so a cast of `JSON.parse`'s output would promise
 * fields the API may leave out. Every body is decoded against a schema mirroring the API's
 * types, with the policy all four QBitFlow SDKs share (behaviour §6):
 *
 * - **Lenient on absence**: an absent or `null` value where the field is required decodes to its
 *   zero value (`''`, `0`, `false`, `[]`, a zero object, the zero time `0001-01-01T00:00:00Z`);
 *   an optional field is left out; a nullable one is `null`. Never an error.
 * - **Strict on type**: a value of the wrong JSON type (a string for a number, an object for a
 *   list, a fractional or negative number for an unsigned integer, a string that is not an RFC
 *   3339 timestamp…) fails: a `ServerError` for an API answer, a `ValidationError` for a webhook
 *   body (the caller's input).
 * - Unknown keys are kept; enum values the SDK does not know stay raw strings. Decimal strings
 *   stay strings.
 *
 * @internal Not part of the public API.
 */

/** Go's zero `time.Time`: what a required timestamp decodes to when it is absent. */
export const ZERO_TIME = '0001-01-01T00:00:00Z';

/** How a decode reports a value of the wrong type. */
export interface DecodeContext {
	/** Builds the error for the value at `path` (`items[2].currency.id`), which is not `expected`. */
	fail(path: string, expected: string, value: unknown): Error;
	/** Called for each key an object schema does not model (tests use it to prove models complete). */
	unknown?(path: string): void;
}

/** A decoder for one JSON value of type `T`. */
export interface Schema<T> {
	/** The expected JSON value, in words (for errors). */
	readonly expected: string;
	/** Decodes `value` (a parsed JSON value, or `undefined` when absent). */
	decode(value: unknown, path: string, ctx: DecodeContext): T;
}

const isAbsent = (value: unknown): value is null | undefined =>
	value === undefined || value === null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** Describes a JSON value's type, for errors. */
export function describe(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	switch (typeof value) {
		case 'string':
			return 'a string';
		case 'number':
			return Number.isInteger(value) ? 'an integer' : 'a number';
		case 'boolean':
			return 'a boolean';
		case 'object':
			return 'an object';
		default:
			return typeof value;
	}
}

const childPath = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

/** A JSON string; absent/null → `''`. */
export const string: Schema<string> = {
	expected: 'a string',
	decode(value, path, ctx) {
		if (isAbsent(value)) return '';
		if (typeof value === 'string') return value;
		throw ctx.fail(path, this.expected, value);
	},
};

/** A string-valued enum; values the SDK does not know pass through unchanged. */
export function enumString<E extends string>(): Schema<E> {
	return string as Schema<E>;
}

/** A JSON number (a float); absent/null → `0`. */
export const number: Schema<number> = {
	expected: 'a number',
	decode(value, path, ctx) {
		if (isAbsent(value)) return 0;
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		throw ctx.fail(path, this.expected, value);
	},
};

/** A JSON integer; absent/null → `0`. An integral float (`3.0`, `1e3`) is accepted. */
export const integer: Schema<number> = {
	expected: 'an integer',
	decode(value, path, ctx) {
		if (isAbsent(value)) return 0;
		if (typeof value === 'number' && Number.isInteger(value)) return value;
		throw ctx.fail(path, this.expected, value);
	},
};

/** A non-negative JSON integer (an unsigned type on the server); absent/null → `0`. */
export const unsigned: Schema<number> = {
	expected: 'a non-negative integer',
	decode(value, path, ctx) {
		if (isAbsent(value)) return 0;
		if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
		throw ctx.fail(path, this.expected, value);
	},
};

/** A JSON boolean; absent/null → `false`. */
export const boolean: Schema<boolean> = {
	expected: 'a boolean',
	decode(value, path, ctx) {
		if (isAbsent(value)) return false;
		if (typeof value === 'boolean') return value;
		throw ctx.fail(path, this.expected, value);
	},
};

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Whether `value` is an RFC 3339 timestamp (any offset, any fraction). */
export function isRFC3339(value: string): boolean {
	return RFC3339.test(value) && !Number.isNaN(Date.parse(value));
}

/** An RFC 3339 timestamp, kept as sent; absent/null → {@link ZERO_TIME}. */
export const timestamp: Schema<string> = {
	expected: 'an RFC 3339 timestamp',
	decode(value, path, ctx) {
		if (isAbsent(value)) return ZERO_TIME;
		if (typeof value === 'string' && isRFC3339(value)) return value;
		throw ctx.fail(path, this.expected, value);
	},
};

/** Any JSON value, untouched (absent → `null`). */
export const raw: Schema<unknown> = {
	expected: 'any JSON value',
	decode(value) {
		return value === undefined ? null : value;
	},
};

/** A value the server may send as `null`: absent/null → `null`. */
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

/** An optional field: absent/null → left out of the decoded object. */
export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
	return {
		get expected() {
			return inner.expected;
		},
		decode(value, path, ctx) {
			return isAbsent(value) ? undefined : inner.decode(value, path, ctx);
		},
	};
}

/** A list: absent/null → `[]`, otherwise every element decoded by `item`. */
export function list<T>(item: Schema<T>): Schema<T[]> {
	return {
		expected: 'an array',
		decode(value, path, ctx) {
			if (isAbsent(value)) return [];
			if (!Array.isArray(value)) throw ctx.fail(path, this.expected, value);
			return value.map((element, index) => item.decode(element, `${path}[${index}]`, ctx));
		},
	};
}

/** The field decoders of an object schema: exactly one per property of `T`. */
export type Fields<T> = { [K in keyof T]-?: Schema<T[K]> };

/**
 * An object: absent/null → every field at its zero value; otherwise each known field is decoded
 * (an optional field decoded as absent is left out) and unknown keys are kept as they are.
 */
export function object<T>(fields: Fields<T>): Schema<T> {
	const keys = Object.keys(fields) as Array<keyof T & string>;
	return {
		expected: 'an object',
		decode(value, path, ctx) {
			if (!isAbsent(value) && !isPlainObject(value))
				throw ctx.fail(path, this.expected, value);
			const source: Record<string, unknown> = isAbsent(value) ? {} : value;
			const out: Record<string, unknown> = { ...source };
			if (ctx.unknown) {
				for (const key of Object.keys(source)) {
					if (!Object.prototype.hasOwnProperty.call(fields, key))
						ctx.unknown(childPath(path, key));
				}
			}
			for (const key of keys) {
				const decoded = fields[key].decode(source[key], childPath(path, key), ctx);
				if (decoded === undefined) delete out[key];
				else out[key] = decoded;
			}
			return out as T;
		},
	};
}

/** Defers building a schema, for recursive types (`Currency.mainCurrency`). */
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

/** A value whose shape depends on the raw JSON (a session by its `txType`, an event by its `type`). */
export function custom<T>(
	expected: string,
	decode: (value: unknown, path: string, ctx: DecodeContext) => T
): Schema<T> {
	return { expected, decode };
}

/** Reads a raw member of a JSON object without decoding it (for discriminators). */
export function rawMember(value: unknown, key: string): unknown {
	return isPlainObject(value) ? value[key] : undefined;
}

/** Decodes a whole body. */
export function decodeWith<T>(schema: Schema<T>, value: unknown, ctx: DecodeContext): T {
	return schema.decode(value, '', ctx);
}
