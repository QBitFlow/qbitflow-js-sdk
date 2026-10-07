/**
 * Common types and interfaces used across the SDK.
 *
 * Every response type describes exactly what the SDK's decoder guarantees: a field without
 * `| null` is always present with a value of its type (its zero value — `0`, `''`, `false`,
 * `[]` — when the API left it out), and a field typed `T | null` is always present, as a
 * value or `null`. Timestamps are RFC3339 strings; a non-nullable timestamp the API did not
 * set is Go's zero time, `0001-01-01T00:00:00Z`.
 */

/**
 * Duration unit for subscriptions and trial periods
 */
export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

/**
 * Represents a duration of time
 */
export interface Duration {
	/** The numeric value of the duration (an integer) */
	value: number;
	/** The unit of time */
	unit: DurationUnit;
}

/**
 * One page of a cursor-paginated list.
 */
export interface CursorData<T> {
	/** Items in the current page (empty, never null, when there are none) */
	items: T[];
	/** Cursor for the next page, `null` when there are no more pages */
	nextCursor: string | null;
	/** Whether there are more pages */
	hasMore: () => boolean;
}

/**
 * The wire envelope of a cursor-paginated list.
 */
export interface CursorDataResponse<T> {
	/** Items in the current page */
	items: T[];
	/** Cursor for the next page, `null` when there are no more pages */
	nextCursor: string | null;
}

/**
 * Wrap a page envelope with a `hasMore()` helper. A missing `items` list becomes `[]` and a
 * missing cursor `null`.
 */
export const getCursorData = <T>(response: CursorDataResponse<T>): CursorData<T> => {
	const items = response?.items ?? [];
	const nextCursor = response?.nextCursor ?? null;
	return {
		items,
		nextCursor,
		hasMore: () => !!nextCursor,
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
 * Generic API success response (`{ "message": string }`)
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
 * A fee paid to a referrer.
 */
export interface ReferralFee {
	/** ID of the referral */
	referralId: number;
	/** Address receiving the fee */
	referrer: string;
	/** Referral fee in basis points (1% = 100 bps) */
	feeBps: number;
	/** RFC3339 deadline after which the referral fee no longer applies */
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
	 * Native-currency USD price at transaction time, used for accounting on refunds or when
	 * the merchant pays the network fees; `0` when not applicable.
	 */
	mainCurrencyPriceUSD: number;
}

/**
 * Per-party amounts in USD.
 */
export interface TxAmountsUSD {
	/** Platform (QBitFlow) fee share in USD */
	platform: number;
	/** Organization fee share in USD (`0` when there is no organization fee) */
	organization: number;
	/** Referral fee share in USD (`0` when there is no referral fee) */
	referral: number;
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
	/** Additional fee kept by the organization, `null` when there is none */
	organizationFee: OrganizationFee | null;
	/** Fee paid to a referrer, `null` when there is none */
	referralFee: ReferralFee | null;
	/** On-chain metadata (populated after confirmation) */
	txMetadata: TxMetadata;
	/** Computed fee/merchant amounts */
	txAmounts: TxAmountsFull;
}

/**
 * Configuration options for the SDK
 */
export interface QBitFlowConfig {
	/** API key for authentication (a blank key is rejected) */
	apiKey: string;
	/**
	 * Base URL for the API (defaults to `https://api.qbitflow.app/v1`). Must be an absolute
	 * `http://` or `https://` URL; a trailing slash is removed. Point it at a local server for
	 * integration testing.
	 */
	baseUrl?: string;
	/** Request timeout in milliseconds (defaults to 30000; `0` disables the timeout) */
	timeout?: number;
	/**
	 * Retry budget for idempotent (GET) requests that fail with a network error or a 5xx
	 * (defaults to 3; `0` disables retries). POST, PUT and DELETE are never retried.
	 */
	maxRetries?: number;
}
