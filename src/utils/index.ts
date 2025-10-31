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
		if (obj.hasOwnProperty(key)) {
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
		if (obj.hasOwnProperty(key)) {
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
	if (!dto.productId && (!dto.productName || !dto.description || dto.price === undefined)) {
		throw new ValidationException(
			'Either productId or productName, description, and price must be provided'
		);
	}

	if (dto.price !== undefined && dto.price < 0) {
		throw new ValidationException('Price must be a non-negative value');
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
