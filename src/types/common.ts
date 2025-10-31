/**
 * Common types and interfaces used across the SDK
 */

/**
 * Duration unit for subscriptions and trial periods
 */
export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

/**
 * Represents a duration of time
 */
export interface Duration {
	/** The numeric value of the duration */
	value: number;
	/** The unit of time */
	unit: DurationUnit;
}

/**
 * Pagination cursor data for list operations
 */
export interface CursorData<T> {
	/** Array of items in the current page */
	items: T[];
	/** Cursor for the next page, null if no more pages */
	nextCursor: string | null;
	/** Whether there are more pages */
	hasMore: () => boolean;
}

export interface CursorDataResponse<T> {
	/** Array of items in the current page */
	items: T[];
	/** Cursor for the next page, null if no more pages */
	nextCursor: string | null;
}

export const getCursorData = <T>(response: CursorDataResponse<T>): CursorData<T> => {
	return {
		items: response.items,
		nextCursor: response.nextCursor,
		hasMore: () => !!response.nextCursor,
	};
};

/**
 * Generic API error response
 */
export interface ErrorResponse {
	/** Error message */
	error: string;
	/** HTTP status code */
	status?: number;
	/** Additional error message */
	message?: string;
}

/**
 * Generic API success response
 */
export interface SuccessResponse {
	/** Success message */
	message: string;
}

/**
 * Configuration options for the SDK
 */
export interface QBitFlowConfig {
	/** API key for authentication */
	apiKey: string;
	/** Base URL for the API (optional, shouldn't be modified in most cases) */
	baseUrl?: string;
	/** Request timeout in milliseconds (optional, defaults to 30000) */
	timeout?: number;
	/** Number of retry attempts for failed requests (optional, defaults to 3) */
	maxRetries?: number;
}
