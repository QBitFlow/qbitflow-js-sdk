/**
 * Common types and interfaces used across the SDK
 */

/**
 * Duration unit for subscriptions and trial periods
 */
export type DurationUnit =
	| 'seconds'
	| 'minutes'
	| 'hours'
	| 'days'
	| 'weeks'
	| 'months'
	| 'years';

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
 * An additional fee kept by the organization, on top of the platform fee.
 */
export interface OrganizationFee {
	/** ID of the organization receiving the fee */
	organizationId: number;
	/** Address receiving the fee */
	organization: string;
	/** Organization fee in basis points (1% = 100 bps) */
	feeBps: number;
}

/**
 * An optional fee paid to a referrer.
 */
export interface ReferralFee {
	/** ID of the referral */
	referralId: number;
	/** Address receiving the fee */
	referrer: string;
	/** Referral fee in basis points (1% = 100 bps) */
	feeBps: number;
	/** Deadline (ISO-8601 timestamp) after which the referral fee no longer applies */
	deadline: string;
}

/**
 * The on-chain network fees, in the smallest native-currency units.
 */
export interface NetworkFees {
	/** Network fee amount as a decimal string, in the smallest native-currency units */
	amount: string;
	/** Number of native units consumed (e.g. gas used) */
	unitsConsumed: number;
}

/**
 * Identifies the block a transaction was included in.
 */
export interface BlockData {
	/** Block number (or slot), as a string */
	number: string;
	/** Block timestamp (Unix seconds) */
	timestamp: number;
}

/**
 * On-chain metadata parsed from a settled transaction.
 */
export interface TxMetadata {
	/** On-chain network fees */
	networkFees: NetworkFees;
	/** Block the transaction was included in */
	blockData: BlockData;
	/**
	 * Native-currency USD price at transaction time, used for accounting on refunds
	 * or when the merchant pays the network fees.
	 */
	mainCurrencyPriceUSD?: number;
}

/**
 * Per-party amounts in USD.
 */
export interface TxAmountsUSD {
	/** Platform (QBitFlow) fee share in USD */
	platform: number;
	/** Organization fee share in USD (omitted when there is no organization fee) */
	organization?: number;
	/** Referral fee share in USD (omitted when there is no referral fee) */
	referral?: number;
	/** Amount received by the merchant in USD */
	merchant: number;
}

/**
 * Per-party amounts in the smallest currency units (decimal strings).
 */
export interface TxAmountsMinUnits {
	/** Platform (QBitFlow) fee share, in min units */
	platform: string;
	/** Organization fee share, in min units */
	organization: string;
	/** Referral fee share, in min units */
	referral: string;
	/** Amount received by the merchant, in min units */
	merchant: string;
}

/**
 * Computed per-party amounts, in both USD and the smallest currency units.
 */
export interface TxAmountsFull {
	/** Amounts in USD */
	usd: TxAmountsUSD;
	/** Amounts in the smallest currency units (decimal strings) */
	minUnits: TxAmountsMinUnits;
}

/**
 * Structured metadata attached to a payment or subscription-billing record:
 * the fee breakdown, on-chain transaction metadata, and computed amounts.
 */
export interface PaymentMetadata {
	/**
	 * QBitFlow platform fee in basis points (1% = 100 bps), deducted from the amount paid;
	 * the merchant receives amount - platform fee - organization fee.
	 */
	feeBps: number;
	/** Optional additional fee kept by the organization */
	organizationFee?: OrganizationFee;
	/** Optional fee paid to a referrer */
	referralFee?: ReferralFee;
	/** On-chain metadata (populated after confirmation) */
	txMetadata: TxMetadata;
	/** Computed fee/merchant amounts */
	txAmounts: TxAmountsFull;
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
