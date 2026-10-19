/**
 * Models shared by several resources.
 *
 * Typing rule (types.md §1): a field the API always sends is required (absent or `null` on the
 * wire decodes to its zero value: `''`, `0`, `false`, `[]`, `{}`, a zero object, or the zero time
 * `0001-01-01T00:00:00Z`); an optional field is `field?: T`, absent when the API leaves it out
 * (the API never sends `null`: an optional field without a value is absent). Lists are arrays
 * and merchant `metadata` a `Record<string, string>`, both always present. Money, token amounts
 * and fee rates are decimal **strings** (`"12.5"`, `"10004200"`, `"0.99"`), never parsed into
 * floats: convert token amounts with `formatAmount` and `parseAmount`. Timestamps are RFC 3339
 * strings, kept exactly as sent.
 *
 * @module
 */

import type {
	AttemptStatus,
	Chain,
	DurationUnit,
	FeeLineType,
	RefundInitiator,
	RefundStatus,
} from '../enums.js';

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

/**
 * A currency of the catalog: a chain's native coin (ETH, SOL; its chain is itself) or a token on
 * a chain (USDC on Base). It is the one currency object of every response (`currencies.list`,
 * `Payment.currency`, `Member.acceptedCurrencies`, …).
 */
export interface Currency {
	/** The currency's id (`currencies.get(id)`): a public catalog, unique across test and live. */
	id: number;
	/**
	 * What requests name it by: `CHAIN:TOKEN` for a token (`BASE:USDC`), the chain's symbol for
	 * its native coin (`ETH`).
	 */
	code: string;
	/** Its symbol (`USDC`, `ETH`). */
	symbol: string;
	/** Its full name (`USD Coin`, `Ethereum`). */
	name: string;
	/** The chain it is on, by its native coin's symbol: `ETH`, `BASE` or `SOL`. */
	chain: Chain;
	/**
	 * The decimals of its on-chain amounts: min units = amount × 10^decimals (6 for USDC).
	 * `formatAmount(minUnits, currency.decimals)` converts with it.
	 */
	decimals: number;
	/** A token's contract address (EVM) or mint (Solana); absent on a native coin. */
	address?: string;
	/** A token's chain, by its native coin's id (`currencies.get`); absent on a native coin. */
	mainCurrencyId?: number;
	/** True for a test network's currency, false for a live one. */
	test: boolean;
}

/**
 * An amount of a token (or of a chain's native coin, when its field says so) as responses write
 * it: the exact amount in the token's units and its on-chain integer, always together, and its
 * USD value when a price is known. Its currency is the resource's.
 *
 * ```json
 * {"amount": "12.5", "amountMinUnits": "12500000", "amountUsd": "12.5"}
 * ```
 */
export interface TokenAmount {
	/** The amount in the token's units, exact: `amountMinUnits / 10^decimals`, a decimal string (`"12.5"`). */
	amount: string;
	/** The on-chain integer, in the token's smallest unit, a string of digits (`"12500000"`). */
	amountMinUnits: string;
	/** Its value in USD, a decimal string; absent when no price was known. */
	amountUsd?: string;
}

/**
 * A customer as a transaction row names it (a payment, a bill, a subscription, a refund): who
 * paid, even once the merchant deleted the customer. Merchant API reads only: absent from
 * webhooks.
 */
export interface CustomerSummary {
	/** The customer (`customers.get`). */
	uuid: string;
	/** The first name. */
	firstName: string;
	/** The last name; absent when not given. */
	lastName?: string;
	/** The email, lowercase. */
	email: string;
	/** The merchant's reference of the customer; absent without one. */
	reference?: string;
	/** True when the merchant deleted the customer: it still names its rows, but `customers.get` answers 404. */
	deleted: boolean;
}

/**
 * A payment's or bill's refund, as the payment shows it (`refunds.get` has the rest of the refund
 * with the same id).
 */
export interface RefundSummary {
	/** The refund (`refund@…`). */
	uuid: string;
	/** `pending`, `approved` or `rejected`. */
	status: RefundStatus;
	/** `customer` (a request) or `merchant`. */
	initiatedBy: RefundInitiator;
	/** The share of what the customer paid it sends back, a percent string (`"100"`: all of it). */
	refundPercent: string;
	/**
	 * What it sends back, in the currency's units (a decimal string); absent when its currency
	 * isn't known (a refund requested before refunds named it).
	 */
	amount?: string;
	/** The same in the currency's smallest unit (a string of digits). */
	amountMinUnits: string;
	/** The same in USD, at the payment's time (a decimal string); absent when unknown. */
	amountUsd?: string;
	/** When it was requested or prepared. */
	createdAt: string;
	/** When it was approved (confirmed) or rejected; absent while pending. */
	respondedAt?: string;
}

/**
 * How a session's (or a refund approval's) last attempt failed, while it waits for another:
 * never final.
 */
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

/**
 * QBitFlow's record of how a payment or a bill settled, made once at confirmation: its fee terms,
 * how the contracts split what the payer paid, and the transaction that paid it. Every fee
 * record, export, held-funds total and refund reads it. Merchant only (API reads and webhooks).
 */
export interface Settlement {
	/** QBitFlow's fee on the payment, a percent string (`"0.99"` = 0.99 %), deducted from the amount paid. */
	feePercent: string;
	/**
	 * The organization's fee on its member's payment (a marketplace's commission), taken from
	 * what remains after QBitFlow's fee; absent when none.
	 */
	organizationFee?: OrganizationFee;
	/** The referrer's share of QBitFlow's fee; absent when none. */
	referralFee?: ReferralFee;
	/**
	 * How the contracts split what the payer paid; absent on records made before the split was
	 * recorded. For a payment the organization held for its member, it is the split a direct
	 * payment would have had (the organization's fee withheld, not paid on-chain).
	 */
	split?: Split;
	/** The transaction that paid it; absent before its confirmation. */
	transaction?: SettlementTransaction;
}

/** The organization's fee on its member's payment or bill (a marketplace's commission). */
export interface OrganizationFee {
	/** The organization's wallet that receives the fee. */
	address: string;
	/** The fee, a percent string, taken from what remains after QBitFlow's fee. */
	feePercent: string;
}

/** The referrer's share of QBitFlow's fee on a payment or bill. */
export interface ReferralFee {
	/** The referrer's wallet that receives the fee. */
	address: string;
	/** The referrer's share of the platform fee, a percent string (`"20"` = 20 % of it). */
	feePercent: string;
	/** Until when the referrer earns its share. */
	deadline: string;
}

/**
 * How a payment or a bill was split, as the contracts paid it. Each part is an amount of the
 * payment's currency (USD values in proportion to the payment's, to 6 decimals):
 * `platform + organization + referral + merchant` = the payment's amount, exactly, in each unit.
 */
export interface Split {
	/** QBitFlow's fee (the referrer's share not included). */
	platform: TokenAmount;
	/** The organization's fee; absent without one. */
	organization?: TokenAmount;
	/** The referrer's share of QBitFlow's fee; absent without one. */
	referral?: TokenAmount;
	/** What the merchant (the member, for a member's payment) received, net of every fee. */
	merchant: TokenAmount;
	/**
	 * The network fee the payer paid on top of the amount, in the payment's currency; absent on
	 * records made before it was recorded (`"0"` once recorded as none).
	 */
	networkFee?: TokenAmount;
}

/**
 * The transaction that paid (or refunded, or released): where and when it landed, and what it
 * cost its sender in the chain's native coin.
 */
export interface SettlementTransaction {
	/** The block (Ethereum, Base) or slot (Solana) it landed in, a string of digits. */
	blockNumber: string;
	/** When its block was produced (UTC); absent only on records made before it was recorded. */
	blockTime?: string;
	/** The gas it consumed (Ethereum, Base); absent on Solana. */
	gasUsed?: number;
	/**
	 * What the transaction cost its sender, in the chain's native coin (ETH, SOL): its gas and,
	 * on Base, its L1 data fee; its `amountUsd` at `nativePriceUsd`.
	 */
	fee: TokenAmount;
	/** The part of `fee` that paid Base's L1 data fee, in the native coin; absent off Base. */
	l1Fee?: TokenAmount;
	/**
	 * The USD price of the chain's native coin when the transaction was recorded (a decimal
	 * string); absent when no price was available.
	 */
	nativePriceUsd?: string;
}

/**
 * What a refund or a held-funds release records of its transfer: the transaction only (a
 * transfer pays no fee and has no split).
 */
export interface TransferSettlement {
	/** The transfer's transaction; absent before it was confirmed. */
	transaction?: SettlementTransaction;
}

/**
 * An amount a checkout adds to its product's price, shown to the customer and paid with it, a
 * subscription's with every bill (`Payment.fees`, `Subscription.fees`, `Transaction.fees`,
 * `PaymentSessionData.fees`).
 */
export interface FeeLine {
	/**
	 * `custom` (the merchant's line) or `processingFee` (QBitFlow's fee, which the merchant has
	 * the customer pay).
	 */
	type: FeeLineType;
	/** The line's name, as the checkout shows it (`Processing fee` for the processing fee). */
	label: string;
	/** More about the line, as the merchant wrote it; absent without one. */
	description?: string;
	/** The line's amount in USD, a decimal string with at most 2 decimals (`"4.99"`). */
	amountUsd: string;
}

/**
 * One page of a cursor-paginated list, newest first (members by when they joined). Bounded lists
 * (currencies, wallets, members' held funds, the accounting export) answer the same envelope in
 * one page; their methods return its `items`.
 */
export interface Page<T> {
	/** The page's rows; `[]` when there are none. */
	items: T[];
	/**
	 * Whether another page follows: pass `nextCursor` as the params' `cursor` to read it. A full
	 * last page answers `false`: there is never an extra empty page.
	 */
	hasMore: boolean;
	/**
	 * The next page's cursor, opaque: pass it back verbatim, never build or parse it. Absent when
	 * `hasMore` is `false`.
	 */
	nextCursor?: string;
}

/** The page size and cursor of every paginated list. */
export interface PageParams {
	/** The page size: the server's default (20) when absent or 0 or less, at most 100 (clamped). */
	limit?: number;
	/** The previous page's `nextCursor`, verbatim (at most 200 characters); absent for the first page. */
	cursor?: string;
}

/**
 * The options of the reads by id that can reach a member's row (`payments.get`,
 * `subscriptions.get`, `subscriptions.getBill`).
 */
export interface ReadParams {
	/**
	 * Read a member's row from the organization's space (organization key without `onBehalfOf`;
	 * 400 from a member's space).
	 */
	includeMembers?: boolean;
}

/** The filters every transaction list shares (payments, transactions, failures, subscriptions). */
export interface TransactionListFilters extends PageParams {
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
