/**
 * The SDK's one set of client-side checks (behaviour §8, docs `validators.md`). They mirror the
 * API's binding rules so a bad input fails before the round trip, with a `ValidationError`
 * naming each failing input by its wire name. Lengths count code points. Rules that depend on
 * the key's mode or on server state (the test-mode price cap, https-only URLs in live mode, the
 * frequency minimum, the 95-day export window, uniqueness) are left to the API.
 *
 * @internal Not part of the public API.
 */

/* eslint-disable no-control-regex -- the rules are about control characters */

import { fieldError, type FieldError, validationError, type ValidationError } from './errors.js';

/** The characters names and free text refuse. */
const TEXT_DISALLOWED = /[<>{}[\]`\\|;"~^]/;
/** C0 and C1 control characters (Go's `unicode.IsControl`). */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** C0 and C1 control characters but tab, line feed and carriage return. */
const CONTROL_MULTILINE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
/** Bidirectional controls (U+202A–U+202E, U+2066–U+2069). */
const BIDI = /[‪-‮⁦-⁩]/;
const REFERENCE = /^[A-Za-z0-9._:@-]+$/;
const PHONE = /^\+?[0-9][0-9 ().-]{4,}[0-9]$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const TX_PREFIXES = ['pay', 'sub', 'payg', 'sub-hist', 'refund', 'transfer'];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** An amount in USD sent as a string: digits, then at most 2 decimals. */
const USD_STRING = /^[0-9]+(\.[0-9]{1,2})?$/;
const MAX_UINT32 = 4294967295;

/** Each duration unit's length in seconds (months = 30 days, years = 365 days). */
const UNIT_SECONDS: Record<string, number> = {
	seconds: 1,
	minutes: 60,
	hours: 3600,
	days: 86400,
	weeks: 7 * 86400,
	months: 30 * 86400,
	years: 365 * 86400,
};

/** Unicode White_Space at either end (Go's `strings.TrimSpace`: NBSP included, U+FEFF not). */
const EDGE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;

/** Trims Unicode White_Space (Go's `strings.TrimSpace`). */
export function trimSpace(value: string): string {
	return value.replace(EDGE_SPACE, '');
}

/** Whether a string is empty or only Unicode White_Space. */
export function isBlank(value: string): boolean {
	return /^\p{White_Space}*$/u.test(value);
}

/** A string's length in code points. */
const codePoints = (value: string): number => Array.from(value).length;

/** The API's text rule: not blank, no control character (line breaks and tabs only when multiline), none of the 13 characters. */
export function isText(value: string, multiline: boolean): boolean {
	if (isBlank(value)) return false;
	if ((multiline ? CONTROL_MULTILINE : CONTROL).test(value)) return false;
	return !TEXT_DISALLOWED.test(value);
}

/** The API's name rule: the text rule on one line, without bidirectional controls. */
export function isName(value: string): boolean {
	return isText(value, false) && !BIDI.test(value);
}

/** A UUID in its 8-4-4-4-12 hex form (any case). */
export function isUUID(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

/** The nil UUID. */
export function isNilUUID(value: string): boolean {
	return value === NIL_UUID;
}

/** A transaction id: `<pay|sub|payg|sub-hist|refund|transfer>@<uuid>`, or a bare UUID. */
export function isTxId(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const at = value.indexOf('@');
	if (at < 0) return isUUID(value);
	return TX_PREFIXES.includes(value.slice(0, at)) && isUUID(value.slice(at + 1));
}

/** The structural email check: one `@`, a non-empty local part, a dotted domain that neither starts nor ends with a dot, no whitespace. */
export function isEmail(value: string): boolean {
	if (value.split('@').length !== 2 || /\p{White_Space}/u.test(value)) return false;
	const [local, domain] = value.split('@');
	return local !== '' && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/** An absolute http(s) URL with a host. */
export function isHttpUrl(value: string): boolean {
	if (/[\u0000- \u007f]/.test(value)) return false;
	const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)/.exec(value);
	if (!match) return false;
	const scheme = match[1].toLowerCase();
	if (scheme !== 'http' && scheme !== 'https') return false;
	const authority = match[2];
	const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
	const host = hostPort.startsWith('[')
		? hostPort.slice(0, hostPort.indexOf(']') + 1)
		: hostPort.replace(/:\d*$/, '');
	if (host === '' || host === '[]') return false;
	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}

/** Whether `value`'s shortest decimal form has at most 2 decimals (the form `JSON.stringify` sends). */
export function hasAtMostTwoDecimals(value: number): boolean {
	if (Number.isInteger(value)) return true;
	const s = String(Math.abs(value));
	const [mantissa, exponent] = s.split('e');
	const decimals = (mantissa.split('.')[1]?.length ?? 0) - Number(exponent ?? 0);
	return decimals <= 2;
}

/** A valid `Idempotency-Key`: 1 to 255 printable ASCII characters without spaces (0x21–0x7E). */
export function isIdempotencyKey(key: string): boolean {
	return /^[\x21-\x7e]{1,255}$/.test(key);
}

/** A valid `X-Request-Id`: 1 to 128 of `A-Z a-z 0-9 - _ . :`. */
export function isRequestId(id: string): boolean {
	return /^[A-Za-z0-9\-_.:]{1,128}$/.test(id);
}

/** A `YYYY-MM-DD` calendar date, as a UTC timestamp; `undefined` when not one. */
function parseDate(value: string): number | undefined {
	const m = DATE.exec(value);
	if (!m) return undefined;
	const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const t = Date.UTC(year, month - 1, day);
	const d = new Date(t);
	if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
		return undefined;
	}
	return t;
}

/** Collects the field errors of one params value. */
export class Validator {
	readonly fields: FieldError[] = [];

	/** Records a failing input; the message follows the field's name. */
	add(field: string, message: string): void {
		this.fields.push({ field, message: `${field} ${message}` });
	}

	/** The collected failures as a `ValidationError`, or `undefined`. */
	error(): ValidationError | undefined {
		return this.fields.length === 0
			? undefined
			: validationError('validation failed', this.fields);
	}

	/** Throws the collected failures, if any. */
	check(): void {
		const err = this.error();
		if (err) throw err;
	}

	/**
	 * Reads an optional string input: `undefined` when absent (`undefined`, `null`) or not a
	 * string (then recorded as a failure).
	 */
	str(field: string, value: unknown): string | undefined {
		if (value === undefined || value === null) return undefined;
		if (typeof value !== 'string') {
			this.add(field, 'must be a string');
			return undefined;
		}
		return value;
	}

	/** Checks that a required string is set (not blank). Reports whether it is. */
	required(field: string, value: unknown): value is string {
		if (value !== undefined && value !== null && typeof value !== 'string') {
			this.add(field, 'must be a string');
			return false;
		}
		if (typeof value !== 'string' || isBlank(value)) {
			this.add(field, 'is required');
			return false;
		}
		return true;
	}

	/** Checks a code-point length (`max` 0 = no maximum). Reports whether it passed. */
	length(field: string, value: string, min: number, max: number): boolean {
		const n = codePoints(value);
		if (max > 0 && min > 0 && (n < min || n > max)) {
			this.add(field, `must be ${min} to ${max} characters`);
		} else if (min > 0 && n < min) {
			this.add(field, `must be at least ${min} characters`);
		} else if (max > 0 && n > max) {
			this.add(field, `must be at most ${max} characters`);
		} else {
			return true;
		}
		return false;
	}

	/** Checks a name (product, customer) when set: the name rule and `min..max`. */
	name(field: string, input: unknown, min: number, max: number): void {
		const value = this.str(field, input);
		if (!value || !this.length(field, value, min, max)) return;
		if (!isName(value)) {
			this.add(field, 'must be one line, not blank, without < > { } [ ] ` \\ | ; " ~ ^');
		}
	}

	/** Checks free text (descriptions, addresses, messages) when set: the text rule and `min..max`. */
	text(field: string, input: unknown, min: number, max: number): void {
		const value = this.str(field, input);
		if (!value || !this.length(field, value, min, max)) return;
		if (!isText(value, true)) {
			this.add(
				field,
				'must not be blank nor contain control characters or < > { } [ ] ` \\ | ; " ~ ^'
			);
		}
	}

	/** Checks a merchant reference when set: 1 to 100 of `A-Z a-z 0-9 . _ : @ -`. */
	reference(field: string, input: unknown): void {
		const value = this.str(field, input);
		if (!value || !this.length(field, value, 1, 100)) return;
		if (!REFERENCE.test(value))
			this.add(field, 'must contain only letters, digits and . _ : @ -');
	}

	/** Checks a phone number when set: at most 32 characters, an optional `+`, digits and `space . - ( )`. */
	phone(field: string, input: unknown): void {
		const value = this.str(field, input);
		if (!value || !this.length(field, value, 0, 32)) return;
		if (!PHONE.test(value)) this.add(field, 'must be a valid phone number');
	}

	/** Checks an email address when set: at most 254 characters, structurally valid. */
	email(field: string, input: unknown): void {
		const value = this.str(field, input);
		if (!value || !this.length(field, value, 0, 254)) return;
		if (!isEmail(value)) this.add(field, 'must be a valid email address');
	}

	/** Checks a URL when set: at most 2048 characters, absolute http or https with a host. */
	url(field: string, input: unknown): void {
		const value = this.str(field, input);
		if (!value || !this.length(field, value, 0, 2048)) return;
		if (!isHttpUrl(value)) this.add(field, 'must be an absolute http or https URL');
	}

	/** Checks a price in USD: finite and above 0. */
	price(field: string, value: unknown): void {
		if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
			this.add(field, 'must be a number above 0');
		}
	}

	/**
	 * Checks a required amount in USD (the API's `usd=<max>`): a finite number, or a string of
	 * digits with an optional decimal point (no sign, no exponent), above 0, at most `max`, with
	 * at most 2 decimals (a number's shortest decimal form).
	 */
	usd(field: string, value: unknown, max: number): void {
		if (value === undefined || value === null) {
			this.add(field, 'is required');
			return;
		}
		let amount: number;
		if (typeof value === 'number') {
			amount = Number.isFinite(value) && hasAtMostTwoDecimals(value) ? value : Number.NaN;
		} else if (typeof value === 'string') {
			amount = USD_STRING.test(value) ? Number(value) : Number.NaN;
		} else {
			amount = Number.NaN;
		}
		if (!(amount > 0 && amount <= max)) {
			this.add(
				field,
				`must be an amount in USD above 0 and at most ${max}, with at most 2 decimals`
			);
		}
	}

	/** Checks a rate in percent: finite, from 0 (above 0 when `positive`) to `max`, at most 2 decimals. */
	percent(field: string, value: unknown, max: number, positive: boolean): void {
		if (
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			value < 0 ||
			(positive && value === 0) ||
			value > max ||
			!hasAtMostTwoDecimals(value)
		) {
			const low = positive ? 'above 0' : '0';
			this.add(field, `must be a percentage from ${low} to ${max}, with at most 2 decimals`);
		}
	}

	/**
	 * Checks a duration: an integer `value` 0..4294967295, a `unit` (one of the 7) required when
	 * `value` > 0, and a unit given with 0 must be one of them too. A frequency must be at least
	 * 1 unit and at most 1 year.
	 */
	duration(field: string, input: unknown, frequency: boolean): void {
		if (input === null || typeof input !== 'object' || Array.isArray(input)) {
			this.add(field, 'must be an object {value, unit}');
			return;
		}
		const { value, unit } = input as { value?: unknown; unit?: unknown };
		if (
			typeof value !== 'number' ||
			!Number.isInteger(value) ||
			value < 0 ||
			value > MAX_UINT32
		) {
			this.add(`${field}.value`, `must be an integer from 0 to ${MAX_UINT32}`);
			return;
		}
		const unitName = unit === undefined || unit === null ? '' : unit;
		if (value > 0 && unitName === '') {
			this.add(`${field}.unit`, 'is required when value is above 0');
			return;
		}
		if (
			unitName !== '' &&
			(typeof unitName !== 'string' ||
				!Object.prototype.hasOwnProperty.call(UNIT_SECONDS, unitName))
		) {
			this.add(
				`${field}.unit`,
				'must be one of seconds, minutes, hours, days, weeks, months, years'
			);
			return;
		}
		if (!frequency) return;
		if (value < 1) {
			this.add(`${field}.value`, 'must be at least 1');
		} else if (value * UNIT_SECONDS[unitName as string] > 365 * 86400) {
			this.add(field, 'must be at most 1 year');
		}
	}

	/** Checks an integer bound. */
	intRange(field: string, value: unknown, min: number, max: number): void {
		if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
			this.add(field, `must be from ${min} to ${max}`);
		}
	}

	/** Checks a page size when set: an integer (the server clamps it). */
	limit(field: string, value: unknown): void {
		if (value === undefined || value === null) return;
		if (typeof value !== 'number' || !Number.isInteger(value))
			this.add(field, 'must be an integer');
	}

	/** Checks a boolean filter when set. */
	bool(field: string, value: unknown): void {
		if (value !== undefined && value !== null && typeof value !== 'boolean') {
			this.add(field, 'must be a boolean');
		}
	}

	/** Checks a UUID when set. */
	uuid(field: string, input: unknown): void {
		const value = this.str(field, input);
		if (value && !isUUID(value)) this.add(field, 'must be a UUID');
	}

	/** Checks a transaction id (`pay@…`, `sub@…`, `sub-hist@…`, `refund@…`, or a bare UUID) when set. */
	txId(field: string, input: unknown): void {
		const value = this.str(field, input);
		if (value && !isTxId(value)) {
			this.add(field, 'must be a transaction id (pay@…, sub@…, sub-hist@… or a UUID)');
		}
	}

	/** Checks a `YYYY-MM-DD` calendar date; returns its UTC timestamp when valid. */
	date(field: string, value: unknown): number | undefined {
		if (!this.required(field, value)) return undefined;
		const t = parseDate(value);
		if (t === undefined) this.add(field, 'must be a date (YYYY-MM-DD)');
		return t;
	}

	/** Checks an export window: two `YYYY-MM-DD` dates, from <= to (the API enforces the 95-day maximum). */
	dateRange(fromField: string, from: unknown, toField: string, to: unknown): void {
		const f = this.date(fromField, from);
		const t = this.date(toField, to);
		if (f !== undefined && t !== undefined && f > t)
			this.add(toField, `must not be before ${fromField}`);
	}

	/** Checks that two filters are not both set. */
	exclusive(fieldA: string, a: boolean, fieldB: string, b: boolean): void {
		if (a && b) this.add(fieldB, `cannot be combined with ${fieldA}`);
	}

	/** Checks an enum value when set. */
	oneOf(field: string, input: unknown, allowed: readonly string[]): void {
		const value = this.str(field, input);
		if (value && !allowed.includes(value))
			this.add(field, `must be one of ${allowed.join(', ')}`);
	}

	/** Checks a webhook endpoint's event list when set: at most 20, never `webhook.test`. */
	endpointEvents(field: string, events: unknown): void {
		if (events === undefined || events === null) return;
		if (!Array.isArray(events)) {
			this.add(field, 'must be a list of event types');
			return;
		}
		if (events.length > 20) this.add(field, 'must list at most 20 event types');
		events.forEach((e, i) => {
			if (typeof e !== 'string' || e === '') this.add(`${field}[${i}]`, 'is required');
			else if (e === 'webhook.test') {
				this.add(
					`${field}[${i}]`,
					'cannot be webhook.test (sent by the endpoint test only)'
				);
			}
		});
	}
}

/** Checks that required params were given (an object). */
export function requireParams(params: unknown): void {
	if (params === null || typeof params !== 'object' || Array.isArray(params)) {
		throw validationError('params are required');
	}
}

/** Checks that optional params, when given, are an object. */
export function optionalParams(params: unknown): void {
	if (
		params !== undefined &&
		params !== null &&
		(typeof params !== 'object' || Array.isArray(params))
	) {
		throw validationError('params must be an object');
	}
}

/**
 * Validates a UUID path parameter (members, invitations, endpoints, customers, products): an
 * empty one would address another route.
 */
export function checkPathUUID(field: string, value: unknown): asserts value is string {
	if (typeof value !== 'string' || value === '') throw fieldError(field, 'is required');
	if (!isUUID(value)) throw fieldError(field, 'must be a UUID');
}

/** Validates a transaction id path parameter (payments, subscriptions, bills, sessions). */
export function checkPathTxId(field: string, value: unknown): asserts value is string {
	if (typeof value !== 'string' || value === '') throw fieldError(field, 'is required');
	if (!isTxId(value)) {
		throw fieldError(field, 'must be a transaction id (pay@…, sub@…, sub-hist@… or a UUID)');
	}
}

/** Validates a free-form path parameter (a reference, an email, an event id): only its presence. */
export function checkPathRequired(field: string, value: unknown): asserts value is string {
	if (typeof value !== 'string' || isBlank(value)) throw fieldError(field, 'is required');
}

/** Validates an `onBehalfOf` value: `''` (none) or a non-nil UUID. */
export function checkOnBehalfOf(value: unknown): asserts value is string {
	if (value === '') return;
	if (!isUUID(value) || isNilUUID(value)) {
		throw fieldError('onBehalfOf', "must be a member's userUuid (a UUID, not the nil UUID)");
	}
}
