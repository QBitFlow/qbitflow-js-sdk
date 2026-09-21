/**
 * Utility functions for the QBitFlow SDK
 */

import { ValidationException } from '../exceptions';

/**
 * Convert object keys from camelCase to snake_case
 * @param obj - Object with camelCase keys
 * @returns Object with snake_case keys
 */
export function convertKeysToSnakeCase(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(convertKeysToSnakeCase);
	}

	const snakeCaseObj: any = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
			snakeCaseObj[snakeKey] = convertKeysToSnakeCase(obj[key]);
		}
	}
	return snakeCaseObj;
}

/**
 * Convert object keys from snake_case to camelCase
 * @param obj - Object with snake_case keys
 * @returns Object with camelCase keys
 */
export function convertKeysToCamelCase(obj: any): any {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(convertKeysToCamelCase);
	}

	const camelCaseObj: any = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
			camelCaseObj[camelKey] = convertKeysToCamelCase(obj[key]);
		}
	}
	return camelCaseObj;
}

/**
 * Validate that required fields are present in an object
 * @param obj - Object to validate
 * @param requiredFields - Array of required field names
 * @throws ValidationException if any required field is missing
 */
export function validateRequiredFields(obj: any, requiredFields: string[]): void {
	const missingFields = requiredFields.filter(
		(field) => !(field in obj) || obj[field] === undefined
	);

	if (missingFields.length > 0) {
		throw new ValidationException(`Missing required fields: ${missingFields.join(', ')}`);
	}
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms - Number of milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate CreateSessionDto to ensure either productId or product details are provided
 * @param dto - Session creation data
 * @throws ValidationException if validation fails
 */
export function validateCreateSession(dto: any): void {
	if (
		!dto.productId &&
		!dto.productReference &&
		(!dto.productName || !dto.description || dto.price === undefined)
	) {
		throw new ValidationException(
			'Either productId, productReference, or productName, description and price must be provided'
		);
	}

	if (dto.price !== undefined && dto.price < 0) {
		throw new ValidationException('Price must be a non-negative value');
	}

	// Mirror the API's binding rules for an inline ("ghost") product, so invalid input is
	// caught before the round-trip.
	// These fields are optional on the API (`binding:"omitempty,..."`), and the server
	// treats an empty string exactly like an absent field. Match that, so
	// `successUrl: process.env.SUCCESS_URL ?? ''` behaves the same here as against the API.
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
}

/** Characters the API's `producttext` rule rejects (common XSS / injection payloads). */
const PRODUCT_TEXT_DISALLOWED = '<>{}[]`\\|;"~^';

/**
 * Mirror the API's `producttext` binding rule.
 *
 * Accepts letters (including accented and non-Latin), digits, spaces and ordinary
 * punctuation; rejects angle brackets and other markup characters. Text that merely looks
 * script-like (for example the literal `javascript:alert(1)`) is allowed — the server
 * renders these fields as escaped text.
 *
 * @param field - Field name, used in the error message
 * @param value - Value to check
 * @param min - Minimum length, in characters
 * @param max - Maximum length, in characters
 * @throws {ValidationException} When the value is blank, out of range, or contains markup
 */
export function validateProductText(field: string, value: string, min: number, max: number): void {
	if (typeof value !== 'string' || value.trim() === '') {
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
 * Check that a success/cancel redirect target is an absolute HTTP(S) URL.
 *
 * A redirect target is attacker-visible, so the SDK refuses relative paths and non-web
 * schemes such as `javascript:` before the round-trip.
 *
 * @param field - Field name, used in the error message
 * @param value - URL to check
 * @throws {ValidationException} When the value is not an absolute http(s) URL
 */
export function validateRedirectUrl(field: string, value: string): void {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new ValidationException(`${field} must be an absolute http:// or https:// URL`);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new ValidationException(`${field} must be an absolute http:// or https:// URL`);
	}

	if (!parsed.host) {
		throw new ValidationException(`${field} must include a host`);
	}
}

/**
 * Build a cursor-based query string for pagination
 * @param baseEndpoint Base endpoint URL
 * @param limit Maximum number of items to return
 * @param cursor Cursor for pagination
 * @returns Query string for cursor-based pagination
 */
export function cursorQueryBuilder(
	limit?: number,
	cursor?: string | null
): {
	limit?: number;
	cursor?: string;
} {
	if (limit !== undefined && limit <= 0) {
		throw new ValidationException('Limit must be greater than 0');
	}

	return {
		limit: limit,
		cursor: cursor || undefined,
	};
}
