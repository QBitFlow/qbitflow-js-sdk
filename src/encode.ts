/**
 * Request encoding: path segments, query strings and JSON bodies.
 *
 * @internal Not part of the public API.
 */

import { fieldError } from './errors.js';

/** A lone UTF-16 surrogate: a string that cannot be encoded as UTF-8. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** Whether a string is well-formed Unicode (no lone surrogate). */
export function isWellFormed(value: string): boolean {
	return !LONE_SURROGATE.test(value);
}

const HEX = '0123456789ABCDEF';
const UTF8 = new TextEncoder();

/** Percent-encodes every UTF-8 byte of `value` whose character `keep` refuses. */
function escape(value: string, keep: (c: string) => boolean, spaceAsPlus: boolean): string {
	let out = '';
	for (const ch of value) {
		if (keep(ch)) {
			out += ch;
		} else if (spaceAsPlus && ch === ' ') {
			out += '+';
		} else {
			for (const byte of UTF8.encode(ch)) out += `%${HEX[byte >> 4]}${HEX[byte & 15]}`;
		}
	}
	return out;
}

const UNRESERVED = /^[A-Za-z0-9\-_.~]$/;
const PATH_SAFE = /^[A-Za-z0-9\-_.~$&+:=@]$/;

/**
 * Escapes one path segment as Go's `url.PathEscape` does: a `/` inside a reference is sent as
 * `%2F`, never as a path separator. A segment that is only dots (`.`, `..`) is refused with a
 * `ValidationError`: `fetch` normalises it away (even escaped), so it would reach another route.
 */
export function pathSegment(field: string, value: string): string {
	if (!isWellFormed(value)) throw fieldError(field, 'must be valid Unicode (no lone surrogate)');
	if (/^\.+$/.test(value) && value.length <= 2) {
		throw fieldError(field, 'cannot be "." or ".." (not addressable in a URL path)');
	}
	return escape(value, (c) => PATH_SAFE.test(c), false);
}

/** Escapes a query key or value as Go's `url.QueryEscape` does (space → `+`). */
export function queryEscape(value: string): string {
	return escape(value, (c) => UNRESERVED.test(c), true);
}

/** A query string under construction: unset values are omitted, keys are sorted. */
export class Query {
	private readonly values = new Map<string, string>();

	/** Sets `key` to `value`. */
	set(key: string, value: string): this {
		this.values.set(key, value);
		return this;
	}

	/** Sets a string when non-empty. */
	string(key: string, value: string | undefined | null): this {
		if (typeof value === 'string' && value !== '') this.values.set(key, value);
		return this;
	}

	/** Sets a flag when `true` (a `false` flag is the default and is not sent). */
	flag(key: string, value: boolean | undefined | null): this {
		if (value === true) this.values.set(key, 'true');
		return this;
	}

	/** Sets a tri-state boolean when given: `true` or `false`. */
	bool(key: string, value: boolean | undefined | null): this {
		if (typeof value === 'boolean') this.values.set(key, String(value));
		return this;
	}

	/** Sets an integer when non-zero, in decimal. */
	int(key: string, value: number | undefined | null): this {
		if (typeof value === 'number' && value !== 0) this.values.set(key, String(value));
		return this;
	}

	/** Sets an instant when given: a `Date` as ISO 8601 (UTC), a string as is (RFC 3339). */
	time(key: string, value: Date | string | undefined | null): this {
		if (value instanceof Date) this.values.set(key, value.toISOString());
		else if (typeof value === 'string' && value !== '') this.values.set(key, value);
		return this;
	}

	/** Sets a cursor page's `limit` and `cursor`. */
	page(limit: number | undefined, cursor: string | undefined): this {
		return this.int('limit', limit).string('cursor', cursor);
	}

	/** Encodes the query (without `?`): keys sorted, `+` offsets escaped as `%2B`. */
	encode(): string {
		return [...this.values.keys()]
			.sort()
			.map((key) => `${queryEscape(key)}=${queryEscape(this.values.get(key) as string)}`)
			.join('&');
	}
}

/**
 * Encodes a request body as JSON. A value JSON cannot represent (a non-finite number, a lone
 * surrogate that is not valid UTF-8, a bigint) is the caller's: a `ValidationError` naming its
 * wire path, and nothing is sent.
 */
export function encodeBody(body: unknown): string {
	const bad = findUnencodable(body, '', 0);
	if (bad) throw fieldError(bad.field || 'body', bad.message);
	try {
		return JSON.stringify(body);
	} catch (err) {
		throw fieldError('body', 'cannot be encoded as JSON', err);
	}
}

function joinPath(path: string, key: string): string {
	return path === '' ? key : `${path}.${key}`;
}

/** Finds the first value of a request body JSON cannot carry faithfully. */
function findUnencodable(
	value: unknown,
	path: string,
	depth: number
): { field: string; message: string } | undefined {
	if (depth > 32) return undefined;
	switch (typeof value) {
		case 'string':
			return isWellFormed(value)
				? undefined
				: { field: path, message: 'must be valid UTF-8' };
		case 'number':
			return Number.isFinite(value)
				? undefined
				: { field: path, message: 'must be a finite number' };
		case 'bigint':
			return { field: path, message: 'cannot be a bigint' };
		case 'object': {
			if (value === null) return undefined;
			if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					const bad = findUnencodable(value[i], `${path}[${i}]`, depth + 1);
					if (bad) return bad;
				}
				return undefined;
			}
			for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
				if (!isWellFormed(key))
					return { field: path, message: 'must have valid UTF-8 keys' };
				const bad = findUnencodable(item, joinPath(path, key), depth + 1);
				if (bad) return bad;
			}
			return undefined;
		}
		default:
			return undefined;
	}
}
