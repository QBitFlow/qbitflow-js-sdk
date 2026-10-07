/**
 * Client-side validation shared by every request class.
 *
 * These mirror the API's `binding` rules so invalid input fails fast, before the round-trip,
 * with the same {@link ValidationException} the API's own 400 produces. The rule set is the
 * one all four QBitFlow SDKs share; where it is stricter than the server (a malformed
 * `customerUUID` is rejected here instead of by the server's JSON decoder, `from` must not be
 * after `to` on the accounting export) the server would reject the request too.
 *
 * The `prepare*Body` helpers validate a DTO and return the request body to send, with empty
 * optional strings left out (the API's `omitempty` treats them as "not provided").
 */

import { ValidationException } from '../exceptions/index.js';
import type { CreateCustomerDto, UpdateCustomerDto } from '../types/customer.js';
import type { CreateProductDto, UpdateProductDto } from '../types/product.js';
import type { CreatePaymentSessionDto, CreateSubscriptionSessionDto } from '../types/session.js';
import type { CreateUserDto, UpdateUserDto } from '../types/user.js';
import type { Duration, DurationUnit } from '../types/common.js';

/** Largest value of a Go `uint32` (durations, `minPeriods`). */
export const MAX_UINT32 = 4294967295;

/** Sleep for a specified number of milliseconds. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Identifier guards ────────────────────────────────────────────────────────

/**
 * Require a non-empty string identifier (uuid, reference, email …).
 *
 * An empty segment silently changes the request: `Customers.get('')` would hit
 * `/customer/uuid/`, a different route.
 *
 * @throws {ValidationException} When the value is not a non-empty string
 */
export function requireNonEmpty(field: string, value: unknown): asserts value is string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ValidationException(`${field} is required`);
	}
}

/**
 * Require a positive integer identifier (`id`, `userId`, …).
 *
 * @throws {ValidationException} When the value is not a safe integer greater than zero
 */
export function requirePositiveInt(field: string, value: unknown): asserts value is number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new ValidationException(`${field} must be a positive integer`);
	}
}

/**
 * Require an integer within `[min, max]`.
 *
 * @throws {ValidationException} When the value is not an integer in range
 */
export function requireIntInRange(field: string, value: unknown, min: number, max: number): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		throw new ValidationException(`${field} must be an integer between ${min} and ${max}`);
	}
}

/** Require an optional string field to be a string when present. */
function requireOptionalString(field: string, value: unknown): void {
	if (value !== undefined && value !== null && typeof value !== 'string') {
		throw new ValidationException(`${field} must be a string`);
	}
}

// ── Field rules (mirror the API's custom validators) ─────────────────────────

/**
 * Mirror the API's `alphanumspace` rule: non-empty; every character is a Unicode letter, a
 * Unicode decimal digit (`Nd` only — not `²`, `½` or `Ⅻ`), a space, or one of `-` `_` `'` `.`.
 * A string of spaces is accepted, as it is by the server.
 */
export function isAlphanumSpace(value: string): boolean {
	return value !== '' && /^[\p{L}\p{Nd} \-_'.]+$/u.test(value);
}

/**
 * Validate a name-like field against the API's `alphanumspace` rule and length bounds
 * (counted in code points).
 *
 * @throws {ValidationException} When the value is empty, out of range, or contains a
 *   character outside letters, decimal digits, space, `-`, `_`, `'`, `.`
 */
export function validateAlphanumSpace(
	field: string,
	value: unknown,
	min: number,
	max: number
): void {
	if (typeof value !== 'string' || value === '') {
		throw new ValidationException(`${field} is required`);
	}

	const length = [...value].length;
	if (length < min || length > max) {
		throw new ValidationException(`${field} must be between ${min} and ${max} characters`);
	}

	if (!isAlphanumSpace(value)) {
		throw new ValidationException(
			`${field} may only contain letters, digits, spaces and - _ ' .`
		);
	}
}

/** Characters the API's `producttext` rule rejects (common XSS / injection payloads). */
const PRODUCT_TEXT_DISALLOWED = '<>{}[]`\\|;"~^';

/** Go's `unicode.IsSpace`: the Unicode White_Space property. */
function isGoSpace(codePoint: number): boolean {
	return (
		(codePoint >= 0x09 && codePoint <= 0x0d) ||
		codePoint === 0x20 ||
		codePoint === 0x85 ||
		codePoint === 0xa0 ||
		codePoint === 0x1680 ||
		(codePoint >= 0x2000 && codePoint <= 0x200a) ||
		codePoint === 0x2028 ||
		codePoint === 0x2029 ||
		codePoint === 0x202f ||
		codePoint === 0x205f ||
		codePoint === 0x3000
	);
}

/** Whether a string is empty after trimming Unicode whitespace (Go's `strings.TrimSpace`). */
export function isBlank(value: string): boolean {
	for (const char of value) {
		if (!isGoSpace(char.codePointAt(0) as number)) {
			return false;
		}
	}
	return true;
}

/**
 * Mirror the API's `producttext` binding rule.
 *
 * Accepts letters (including accented and non-Latin), digits, spaces and ordinary
 * punctuation; rejects a value that is blank after Unicode whitespace trimming, the markup
 * characters ``<>{}[]`\|;"~^``, and control characters (U+0000–U+001F, U+007F–U+009F) other
 * than `\n`, `\r`, `\t`. Length is counted in code points, as the server does. Text that
 * merely looks script-like (for example the literal `javascript:alert(1)`) is allowed — the
 * server renders these fields as escaped text.
 *
 * @param field - Field name, used in the error message
 * @param value - Value to check
 * @param min - Minimum length, in characters
 * @param max - Maximum length, in characters
 * @throws {ValidationException} When the value is blank, out of range, or contains markup
 */
export function validateProductText(field: string, value: unknown, min: number, max: number): void {
	if (typeof value !== 'string' || isBlank(value)) {
		throw new ValidationException(`${field} must not be blank`);
	}

	// Count by code point so multi-byte characters are measured the way the server does.
	const length = [...value].length;
	if (length < min || length > max) {
		throw new ValidationException(`${field} must be between ${min} and ${max} characters`);
	}

	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
		if (isControl && char !== '\n' && char !== '\r' && char !== '\t') {
			throw new ValidationException(`${field} must not contain control characters`);
		}
		if (PRODUCT_TEXT_DISALLOWED.includes(char)) {
			throw new ValidationException(`${field} must not contain the character "${char}"`);
		}
	}
}

/**
 * Structural e-mail check: exactly one `@`, non-empty local and domain parts, a dot in the
 * domain that neither starts nor ends it, no whitespace. No normalisation (the server keeps
 * the case as given). The API applies the authoritative rule.
 */
export function isValidEmail(value: string): boolean {
	if (/\s/.test(value)) {
		return false;
	}
	const at = value.indexOf('@');
	if (at <= 0 || at !== value.lastIndexOf('@')) {
		return false;
	}
	const domain = value.slice(at + 1);
	return (
		domain.length > 0 &&
		domain.includes('.') &&
		!domain.startsWith('.') &&
		!domain.endsWith('.')
	);
}

/**
 * Validate an e-mail address.
 *
 * @throws {ValidationException} When the value is not a plausible e-mail address
 */
export function validateEmail(field: string, value: unknown): void {
	if (typeof value !== 'string' || !isValidEmail(value)) {
		throw new ValidationException(`${field} must be a valid email address`);
	}
}

/**
 * Check that a success/cancel redirect target is an absolute HTTP(S) URL with a host (the
 * scheme is case-insensitive).
 *
 * A redirect target is attacker-visible, so the SDK refuses relative paths and non-web
 * schemes such as `javascript:` before the round-trip.
 *
 * @throws {ValidationException} When the value is not an absolute http(s) URL
 */
export function validateRedirectUrl(field: string, value: string): void {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new ValidationException(`${field} must be an absolute http:// or https:// URL`);
	}

	// The WHATWG parser lower-cases the scheme, so `HTTPS://…` lands here as `https:`.
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new ValidationException(`${field} must be an absolute http:// or https:// URL`);
	}

	// The WHATWG parser also "repairs" what the API rejects — an empty authority (`http:///x`
	// parses as host `x`) and surrounding whitespace — so the host must be present in the text
	// exactly as written.
	if (!parsed.host || !/^https?:\/\/[^/?#\\\s]/i.test(value)) {
		throw new ValidationException(`${field} must include a host`);
	}
}

/** A bare UUID (8-4-4-4-12 hex digits, any case), as `customerUUID` must be. */
const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string is a bare UUID (no `pay@`-style prefix). */
export function isBareUuid(value: string): boolean {
	return BARE_UUID.test(value);
}

/** Every unit the API's `Duration` accepts. */
export const DURATION_UNITS: readonly DurationUnit[] = [
	'seconds',
	'minutes',
	'hours',
	'days',
	'weeks',
	'months',
	'years',
];

/**
 * Validate a `Duration`: an integer value in `[minValue, 4294967295]` (a Go `uint32`) and a
 * known unit.
 *
 * @param minValue - Smallest accepted value: `1` for a billing frequency, `0` for a trial
 * @throws {ValidationException} When the value is out of range or the unit is unknown
 */
export function validateDuration(
	field: string,
	duration: unknown,
	minValue = 1
): asserts duration is Duration {
	if (duration === null || typeof duration !== 'object') {
		throw new ValidationException(`${field} must be a duration ({ value, unit })`);
	}
	const { value, unit } = duration as Partial<Duration>;
	if (
		typeof value !== 'number' ||
		!Number.isInteger(value) ||
		value < minValue ||
		value > MAX_UINT32
	) {
		throw new ValidationException(
			`${field}.value must be an integer between ${minValue} and ${MAX_UINT32}`
		);
	}
	if (typeof unit !== 'string' || !DURATION_UNITS.includes(unit)) {
		throw new ValidationException(`${field}.unit must be one of ${DURATION_UNITS.join(', ')}`);
	}
}

/**
 * Validate an organization fee, in basis points (an integer 0–5000, i.e. at most 50%).
 *
 * @throws {ValidationException} When the value is not an integer in range
 */
export function validateOrganizationFeeBps(value: unknown): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5000) {
		throw new ValidationException('organizationFeeBps must be an integer between 0 and 5000');
	}
}

/**
 * Validate a price in USD: a finite number greater than zero.
 *
 * @throws {ValidationException} When the value is not a finite number above zero
 */
export function validatePrice(field: string, value: unknown): void {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		throw new ValidationException(`${field} must be greater than 0`);
	}
}

/** Copy a DTO without the listed keys whose value is an empty string (or undefined). */
function withoutEmpty(dto: object, keys: readonly string[]): Record<string, unknown> {
	const body: Record<string, unknown> = { ...(dto as Record<string, unknown>) };
	for (const key of keys) {
		if (body[key] === '' || body[key] === undefined) {
			delete body[key];
		}
	}
	return body;
}

/** Require a DTO argument to be an object. */
function requireObject(field: string, value: unknown): asserts value is object {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new ValidationException(`${field} must be an object`);
	}
}

// ── DTO validators ───────────────────────────────────────────────────────────

/**
 * Validate a customer creation payload: `name`/`lastName` alphanumspace 2–100 characters,
 * a valid `email`.
 *
 * @throws {ValidationException} When a field breaks the API's rules
 */
export function validateCreateCustomer(dto: CreateCustomerDto): void {
	requireObject('customer', dto);
	validateAlphanumSpace('name', dto.name, 2, 100);
	validateAlphanumSpace('lastName', dto.lastName, 2, 100);
	validateEmail('email', dto.email);
	requireOptionalString('phoneNumber', dto.phoneNumber);
	requireOptionalString('address', dto.address);
	requireOptionalString('reference', dto.reference);
}

/** Validate a customer creation payload and build its body (empty optional strings omitted). */
export function prepareCreateCustomerBody(dto: CreateCustomerDto): Record<string, unknown> {
	validateCreateCustomer(dto);
	return withoutEmpty(dto, ['phoneNumber', 'address', 'reference']);
}

/**
 * Validate a partial customer update: the same rules as creation, applied only to the
 * fields that are present and non-empty (the API treats an empty string as "not provided").
 *
 * @throws {ValidationException} When a provided field breaks the API's rules
 */
export function validateUpdateCustomer(dto: UpdateCustomerDto): void {
	requireObject('customer update', dto);
	if (dto.name !== undefined && dto.name !== '') validateAlphanumSpace('name', dto.name, 2, 100);
	if (dto.lastName !== undefined && dto.lastName !== '')
		validateAlphanumSpace('lastName', dto.lastName, 2, 100);
	if (dto.email !== undefined && dto.email !== '') validateEmail('email', dto.email);
	requireOptionalString('phoneNumber', dto.phoneNumber);
	requireOptionalString('address', dto.address);
}

/** Validate a customer update and build its body (empty strings omitted). */
export function prepareUpdateCustomerBody(dto: UpdateCustomerDto): Record<string, unknown> {
	validateUpdateCustomer(dto);
	return withoutEmpty(dto, ['name', 'lastName', 'email', 'phoneNumber', 'address']);
}

/**
 * Validate a user creation payload: `name`/`lastName` alphanumspace 2–100, a valid `email`,
 * `role` in `admin | user`, optional `organizationFeeBps` an integer 0–5000.
 *
 * @throws {ValidationException} When a field breaks the API's rules
 */
export function validateCreateUser(dto: CreateUserDto): void {
	requireObject('user', dto);
	validateAlphanumSpace('name', dto.name, 2, 100);
	validateAlphanumSpace('lastName', dto.lastName, 2, 100);
	validateEmail('email', dto.email);
	if (dto.role !== 'admin' && dto.role !== 'user') {
		throw new ValidationException('role must be either "admin" or "user"');
	}
	if (dto.organizationFeeBps !== undefined) {
		validateOrganizationFeeBps(dto.organizationFeeBps);
	}
}

/** Validate a user creation payload and build its body. */
export function prepareCreateUserBody(dto: CreateUserDto): Record<string, unknown> {
	validateCreateUser(dto);
	return { ...dto };
}

/**
 * Validate a partial user update: creation rules applied to the provided, non-empty fields.
 *
 * @throws {ValidationException} When a provided field breaks the API's rules
 */
export function validateUpdateUser(dto: UpdateUserDto): void {
	requireObject('user update', dto);
	if (dto.name !== undefined && dto.name !== '') validateAlphanumSpace('name', dto.name, 2, 100);
	if (dto.lastName !== undefined && dto.lastName !== '')
		validateAlphanumSpace('lastName', dto.lastName, 2, 100);
	if (dto.email !== undefined && dto.email !== '') validateEmail('email', dto.email);
	if (dto.organizationFeeBps !== undefined) {
		validateOrganizationFeeBps(dto.organizationFeeBps);
	}
}

/** Validate a user update and build its body (empty `name` / `lastName` / `email` omitted). */
export function prepareUpdateUserBody(dto: UpdateUserDto): Record<string, unknown> {
	validateUpdateUser(dto);
	return withoutEmpty(dto, ['name', 'lastName', 'email']);
}

/**
 * Validate a product creation payload: `name` producttext 2–100, `description` producttext
 * 2–500, `price` a finite number greater than zero.
 *
 * @throws {ValidationException} When a field breaks the API's rules
 */
export function validateCreateProduct(dto: CreateProductDto): void {
	requireObject('product', dto);
	validateProductText('name', dto.name, 2, 100);
	validateProductText('description', dto.description, 2, 500);
	validatePrice('price', dto.price);
	requireOptionalString('reference', dto.reference);
}

/** Validate a product creation payload and build its body (an empty `reference` omitted). */
export function prepareCreateProductBody(dto: CreateProductDto): Record<string, unknown> {
	validateCreateProduct(dto);
	return withoutEmpty(dto, ['reference']);
}

/**
 * Validate a partial product update: creation rules applied to the provided fields only. An
 * empty `name` or `description` is rejected (the server rejects it too).
 *
 * @throws {ValidationException} When a provided field breaks the API's rules
 */
export function validateUpdateProduct(dto: UpdateProductDto): void {
	requireObject('product update', dto);
	if (dto.name !== undefined) validateProductText('name', dto.name, 2, 100);
	if (dto.description !== undefined) validateProductText('description', dto.description, 2, 500);
	if (dto.price !== undefined) validatePrice('price', dto.price);
}

/** Validate a product update and build its body. */
export function prepareUpdateProductBody(dto: UpdateProductDto): Record<string, unknown> {
	validateUpdateProduct(dto);
	return { ...dto };
}

/** Optional string fields of a session that count as "not provided" when empty. */
const SESSION_OPTIONAL_STRINGS = [
	'reference',
	'productReference',
	'productName',
	'description',
	'successUrl',
	'cancelUrl',
	'customerUUID',
	'customerReference',
] as const;

/**
 * Validate a session-checkout payload (payment or subscription).
 *
 * - The product must be identified by `productId` (a positive integer), a non-empty
 *   `productReference`, or an inline ghost product (`productName` + `description` + `price`).
 * - `price`, when given, must be a finite number greater than zero; inline fields follow the
 *   API's `producttext` rule (2–100 / 2–500).
 * - `successUrl` / `cancelUrl` must be absolute http(s) URLs.
 * - `customerUUID`, when non-empty, must be a bare UUID (`8-4-4-4-12` hex digits).
 * - Empty optional strings count as "not provided", exactly as the API's `omitempty` does.
 * - For a subscription (`kind: 'subscription'`), `frequency` is required, with an integer
 *   value 1–4294967295 and a known unit; `trialPeriod` (optional) accepts a value of 0–4294967295;
 *   `minPeriods` (optional) is an integer 0–4294967295.
 *
 * @param kind - `'subscription'` requires `frequency`; defaults to checking it only when present
 * @throws {ValidationException} When the payload breaks the API's rules
 */
export function validateCreateSession(
	dto: CreatePaymentSessionDto | CreateSubscriptionSessionDto,
	kind?: 'payment' | 'subscription'
): void {
	requireObject('session options', dto);

	for (const key of SESSION_OPTIONAL_STRINGS) {
		requireOptionalString(key, (dto as unknown as Record<string, unknown>)[key]);
	}

	if (dto.productId !== undefined && dto.productId !== null) {
		requirePositiveInt('productId', dto.productId);
	}

	const hasInline =
		Boolean(dto.productName) && Boolean(dto.description) && dto.price !== undefined;
	if (!dto.productId && !dto.productReference && !hasInline) {
		throw new ValidationException(
			'Either productId, productReference, or productName, description and price must be provided'
		);
	}

	if (dto.price !== undefined) {
		validatePrice('price', dto.price);
	}

	if (dto.productName) {
		validateProductText('productName', dto.productName, 2, 100);
	}
	if (dto.description) {
		validateProductText('description', dto.description, 2, 500);
	}
	if (dto.successUrl) {
		validateRedirectUrl('successUrl', dto.successUrl);
	}
	if (dto.cancelUrl) {
		validateRedirectUrl('cancelUrl', dto.cancelUrl);
	}
	if (dto.customerUUID && !isBareUuid(dto.customerUUID)) {
		throw new ValidationException(
			'customerUUID must be a bare UUID (8-4-4-4-12 hex digits, no prefix)'
		);
	}

	const subscription = dto as Partial<CreateSubscriptionSessionDto>;
	const isSubscription = kind === 'subscription' || (kind === undefined && 'frequency' in dto);
	if (isSubscription) {
		if (subscription.frequency === undefined || subscription.frequency === null) {
			throw new ValidationException('frequency is required for a subscription session');
		}
		validateDuration('frequency', subscription.frequency, 1);
		if (subscription.trialPeriod !== undefined && subscription.trialPeriod !== null) {
			validateDuration('trialPeriod', subscription.trialPeriod, 0);
		}
		if (subscription.minPeriods !== undefined && subscription.minPeriods !== null) {
			requireIntInRange('minPeriods', subscription.minPeriods, 0, MAX_UINT32);
		}
	}
}

/**
 * Validate a session-checkout payload and build its body: empty optional strings are left
 * out, and so is a `minPeriods` of 0.
 *
 * @throws {ValidationException} When the payload breaks the API's rules (see
 *   {@link validateCreateSession})
 */
export function prepareSessionBody(
	dto: CreatePaymentSessionDto | CreateSubscriptionSessionDto,
	kind: 'payment' | 'subscription'
): Record<string, unknown> {
	validateCreateSession(dto, kind);
	const body = withoutEmpty(dto, SESSION_OPTIONAL_STRINGS);
	if (body.minPeriods === 0 || body.minPeriods === null) {
		delete body.minPeriods;
	}
	if (body.productId === null) {
		delete body.productId;
	}
	if (body.trialPeriod === null) {
		delete body.trialPeriod;
	}
	return body;
}

/**
 * Validate an accounting export request: `from`/`to` as real `YYYY-MM-DD` calendar dates,
 * `from <= to`, `format` in `json | csv`. How wide a window the API accepts is left to the
 * API.
 *
 * @throws {ValidationException} When the parameters break the API's rules
 */
export function validateAccountingExport(from: unknown, to: unknown, format: unknown): void {
	const start = parseIsoDate('from', from);
	const end = parseIsoDate('to', to);

	if (start.getTime() > end.getTime()) {
		throw new ValidationException("'from' must not be after 'to'");
	}

	if (format !== 'json' && format !== 'csv') {
		throw new ValidationException('format must be either "json" or "csv"');
	}
}

/** Parse a `YYYY-MM-DD` string into a UTC `Date`, rejecting impossible calendar dates. */
function parseIsoDate(field: string, value: unknown): Date {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw new ValidationException(`${field} must be a date in YYYY-MM-DD format`);
	}
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCFullYear(year); // Date.UTC maps years 0–99 onto 1900–1999
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw new ValidationException(`${field} is not a valid calendar date`);
	}
	return date;
}

// ── Pagination ───────────────────────────────────────────────────────────────

/**
 * Build the query parameters for a cursor-paginated list.
 *
 * @param limit - Page size; must be a positive integer when given
 * @param cursor - Opaque cursor from the previous page, or null/undefined for the first page
 * @throws {ValidationException} When `limit` is not a positive integer
 */
export function cursorQueryBuilder(
	limit?: number,
	cursor?: string | null
): {
	limit?: number;
	cursor?: string;
} {
	if (limit !== undefined) {
		requirePositiveInt('limit', limit);
	}

	return {
		limit: limit,
		cursor: cursor || undefined,
	};
}
