/**
 * Models shared by several resources.
 *
 * Typing rule: a field the API always sends is required (absent or `null` on the wire decodes to
 * its zero value: `''`, `0`, `false`, `[]`, a zero object, or the zero time
 * `0001-01-01T00:00:00Z`); an optional field is `field?: T` (absent when the API leaves it out);
 * a field the API sends as `null` when unset is `field: T | null`. Money in a token's min units,
 * and some USD prices, are decimal **strings**, never parsed. Timestamps are RFC 3339 strings,
 * kept exactly as sent (the API may use local offsets and microseconds).
 *
 * @module
 */

import type { AttemptStatus, DurationUnit, RefundInitiator, RefundStatus } from '../enums.js';

/**
 * A length of time as the API writes it: a value in the largest exact unit (`{value: 1, unit:
 * 'months'}` = 30 days). `value` 0 means none (`unit` is then optional).
 */
export interface Duration {
	/** The number of units, 0 to 4294967295; 0 means no duration. */
	value: number;
	/** Required when `value` > 0: seconds, minutes, hours, days, weeks, months (30 days) or years (365 days). */
	unit?: DurationUnit;
}

/** A currency (token or native coin) of the catalog. */
export interface Currency {
	/** The currency's id (`currencies.get(id)`). */
	id: number;
	/** Its full name (e.g. `USD Coin`). */
	name: string;
	/** Its symbol (e.g. `USDC`). */
	symbol: string;
	/** Its number of decimals (6 for USDC). */
	decimals: number;
	/** The token's contract address (or mint); `''` for a chain's native coin. */
	address: string;
	/** The chain's native coin, for a token; absent for a native coin. */
	mainCurrencyId?: number;
	/** That native coin; `null` for a native coin. */
	mainCurrency: Currency | null;
	/** True for a testnet currency. */
	test: boolean;
}

/** A customer as a payment, bill or refund names it (API reads only; absent from webhooks). */
export interface CustomerSummary {
	/** The customer (`customers.get`). */
	uuid: string;
	/** The first name. */
	name: string;
	/** The last name, when given. */
	lastName?: string;
	/** The email, lowercase. */
	email: string;
	/** The merchant's reference of the customer, when it has one. */
	reference?: string;
	/** True when the merchant deleted the customer (it still names its rows). */
	deleted?: boolean;
}

/** A transaction's refund, as its payment or bill shows it. */
export interface RefundSummary {
	/** The refund (`refund@…`). */
	uuid: string;
	/** `pending`, `approved` or `rejected`. */
	status: RefundStatus;
	/** `customer` (a request) or `merchant`. */
	initiatedBy: RefundInitiator;
	/** The share of what the customer paid it sends back, in percent. */
	refundPercent: number;
	/** What it sends back, in the currency's min units (a decimal string). */
	amountMinUnits: string;
	/** The same in USD, at the payment's time. */
	amountUsd: number;
	/** When it was requested or started. */
	createdAt: string;
	/** When it was approved (confirmed) or denied; `null` while pending. */
	respondedAt: string | null;
}

/** A failed attempt to pay (or to send a refund): never final. */
export interface Attempt {
	/** `failed`. */
	status: AttemptStatus;
	/** The error code (e.g. `insufficient_funds`, `token_not_approved`): what to do about it. */
	code?: string;
	/** The reason, for the customer. */
	message?: string;
	/** The attempt's transaction, if it was sent. */
	txHash?: string;
	/** When it failed. */
	at: string;
}

/** A payment's (or bill's) fees and split. */
export interface PaymentMetadata {
	/** QBitFlow's fee on the payment, in percent (1.5 = 1.5 %). */
	feePercent: number;
	/** The organization's fee on its member's payment; absent when none. */
	organizationFee?: OrganizationFee;
	/** The referrer's share of QBitFlow's fee; absent when none. */
	referralFee?: ReferralFee;
	/** The transaction's network fees and block. */
	txMetadata: TxMetadata;
	/** How the payment was split (QBitFlow, referrer, organization, merchant). */
	txAmounts: TxAmounts;
}

/** The organization's fee on a member's payment (a marketplace commission). */
export interface OrganizationFee {
	/** The address receiving the fee. */
	organization: string;
	/** The fee, in percent, taken from what remains after QBitFlow's fee. */
	feePercent: number;
}

/** A referrer's share of QBitFlow's fee. */
export interface ReferralFee {
	/** The address receiving the fee. */
	referrer: string;
	/** The referrer's share of the platform fee, in percent (20 = 20 % of it). */
	feePercent: number;
	/** When the referral stops being paid. */
	deadline: string;
}

/** A transaction's network fees and block. */
export interface TxMetadata {
	/** The fees the transaction's sender paid, in the native coin's min units. */
	networkFees: NetworkFees;
	/** The block that included the transaction. */
	blockData: BlockData;
	/** The native coin's USD price at the transaction's time, when recorded. */
	mainCurrencyPriceUsd?: number;
}

/** The block that included a transaction. */
export interface BlockData {
	/** The block number (or slot), as a decimal string. */
	number: string;
	/** The block's time, in unix seconds. */
	timestamp: number;
}

/** A transaction's network fees, in the native coin's min units. */
export interface NetworkFees {
	/** What the sender paid: its gas and, on Base, its L1 data fee (a decimal string). */
	amount: string;
	/** The gas used. */
	unitsConsumed: number;
	/** The part of `amount` that paid Base's L1 data fee; absent on other networks. */
	l1Fee?: string;
}

/** How a payment was split, in USD and in the token's min units. */
export interface TxAmounts {
	/** The split in USD at the transaction's time. */
	usd: TxAmountsUsd;
	/** The split in the token's min units, exactly as paid. */
	minUnits: TxAmountsMinUnits;
}

/** A payment's split in the token's min units (decimal strings). */
export interface TxAmountsMinUnits {
	/** QBitFlow's fee (the referrer's share included). */
	platform: string;
	/** The organization's fee. */
	organization: string;
	/** The referrer's share. */
	referral: string;
	/** What the merchant received. */
	merchant: string;
	/** The network fee the payer paid on top; absent when not recorded. */
	networkFee?: string;
}

/** A payment's split in USD. */
export interface TxAmountsUsd {
	/** QBitFlow's fee. */
	platform: number;
	/** The organization's fee; absent when none. */
	organization?: number;
	/** The referrer's share; absent when none. */
	referral?: number;
	/** What the merchant received. */
	merchant: number;
	/** The network fee the payer paid on top; absent when not recorded. */
	networkFee?: number;
}

/** One page of a cursor-paginated list. */
export interface Page<T> {
	/** The page's rows. */
	items: T[];
	/** The next page's cursor (pass it back as the params' `cursor`, verbatim); `null` on the last page. */
	nextCursor: string | null;
	/** Whether another page follows (`nextCursor !== null`). */
	hasMore: boolean;
}

/**
 * The options of the reads by id that can reach a member's row (`payments.get`,
 * `subscriptions.get`, `subscriptions.getBill`).
 */
export interface ReadParams {
	/** Read a member's row from the organization's space (organization key without `onBehalfOf`). */
	includeMembers?: boolean;
}

/** The filters every transaction list shares. */
export interface TransactionListFilters {
	/** The page size (0 or absent = the server's default). */
	limit?: number;
	/** The previous page's `nextCursor`; absent for the first page. */
	cursor?: string;
	/** Only this customer's. */
	customerUuid?: string;
	/** Only this product's. */
	productUuid?: string;
	/** Only those created after this instant (excluded): a `Date`, or an RFC 3339 string sent as is. */
	createdAfter?: Date | string;
	/** Only those created before this instant (excluded): a `Date`, or an RFC 3339 string sent as is. */
	createdBefore?: Date | string;
	/** Add the members' rows (organization space only); not with `userUuid`. */
	includeMembers?: boolean;
	/** Read one member's rows (organization space only); not with `includeMembers`. */
	userUuid?: string;
}
