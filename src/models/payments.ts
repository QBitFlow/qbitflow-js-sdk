/**
 * Payments, bills, the transactions feed and failures.
 *
 * @module
 */

import type {
	Chain,
	FailureCategory,
	FailureKind,
	NotRefundableReason,
	TransactionKind,
} from '../enums.js';
import type {
	Currency,
	CustomerSummary,
	FeeLine,
	RefundSummary,
	Settlement,
	TransactionListFilters,
} from './common.js';

/** A confirmed one-time payment (`pay@…`). */
export interface Payment {
	/** The payment's id (`pay@…`), also its checkout session's. */
	uuid: string;
	/** When it was recorded, once confirmed on-chain. */
	createdAt: string;
	/** The customer's wallet. */
	from: string;
	/**
	 * The wallet that received it (the merchant's, or the organization's while it holds the
	 * member's funds).
	 */
	to: string;
	/**
	 * What the customer paid, in the currency's units, exact (a decimal string: `"10"` for 10
	 * USDC): `amountMinUnits / 10^decimals`. It is what the contracts split; the network fee paid
	 * on top is not in it (`settlement.split.networkFee`).
	 */
	amount: string;
	/** The same in the currency's smallest unit, a string of digits (`"10000000"` for 10 USDC). */
	amountMinUnits: string;
	/** What the customer paid in USD, a decimal string: `priceUsd` plus every line of `fees`. */
	amountUsd: string;
	/** The currency paid in. */
	currency: Currency;
	/** The transaction's hash. */
	txHash: string;
	/** The chain it was paid on (`ETH`, `BASE`, `SOL`; the testnet's in test mode). */
	chain?: Chain;
	/** The transaction on the chain's block explorer. */
	explorerUrl?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;

	/** Your reference for the payment (an order or invoice id), set when creating its checkout. */
	reference?: string;
	/**
	 * The product's price in USD, as the checkout had it, a decimal string: `amountUsd` is the
	 * price plus the fees' lines.
	 */
	priceUsd: string;
	/**
	 * What the checkout added to the price, line by line, as the customer saw them (a tax,
	 * shipping, the processing fee when the customer paid it); `[]` without any.
	 */
	fees: FeeLine[];
	/**
	 * What was paid for: the checkout's product name when the checkout was created (later product
	 * edits don't change it).
	 */
	productName: string;
	/** The same, for the product's description; absent without one. */
	productDescription?: string;
	/**
	 * Your own data, copied (read-only) from the checkout session that created the payment; `{}`
	 * without any.
	 */
	metadata: Record<string, string>;
	/** The product paid for; absent for an inline product. */
	productUuid?: string;
	/**
	 * The customer, when QBitFlow has one (named by the checkout, found by its
	 * `customerReference`, or recorded from the details the customer gave).
	 */
	customerUuid?: string;
	/**
	 * Your reference of the customer, as the checkout was given it, whether or not QBitFlow has a
	 * customer with it.
	 */
	customerReference?: string;
	/** A qbf.cash tipper's message to the handle's owner. */
	note?: string;
	/** Names the customer, even once deleted (API reads only, never in webhooks). */
	customer?: CustomerSummary;
	/** How it settled: its fees, its split and its transaction. */
	settlement: Settlement;

	/** When the chain confirmed it (its block's time); absent only on records made before it was recorded. */
	confirmedAt?: string;
	/**
	 * Everything the customer's wallet sent, in the currency's units: `amount` plus the network
	 * fee paid on top. A refund's base. Absent when the split wasn't recorded.
	 */
	paid?: string;
	/** The same in the currency's smallest unit. */
	paidMinUnits?: string;
	/** The same in USD, at the payment's time. */
	paidUsd?: string;

	/**
	 * Its refund (one per transaction), if any (API reads only). A merchant's refund not sent yet
	 * is shown, and doesn't make it unrefundable: a new refund replaces it.
	 */
	refund?: RefundSummary;
	/** Whether it can be refunded now (API reads only). */
	refundable?: boolean;
	/** Why not (`refundExists`, `heldFundsReleased`); absent when refundable. */
	notRefundableReason?: NotRefundableReason;

	/** When its checkout session was created. */
	checkoutOpenedAt?: string;
}

/**
 * One paid bill of a subscription (`sub-hist@…`): what its customer paid for one period
 * (`periodStart` → `periodEnd`), in the subscription's token, and how it settled. A failed attempt
 * is no bill (`failures.list`, `subscription.billingFailed`). Bills carry no merchant metadata:
 * read the subscription's.
 */
export interface Bill {
	/** The bill's id (`sub-hist@…`). */
	uuid: string;
	/** When it was recorded, once confirmed on-chain. */
	createdAt: string;
	/** The customer's wallet. */
	from: string;
	/** The wallet that received it. */
	to: string;
	/** What the customer paid, in the currency's units, exact (a decimal string). */
	amount: string;
	/** The same in the currency's smallest unit, a string of digits. */
	amountMinUnits: string;
	/**
	 * What the customer paid in USD, a decimal string: the subscription's `priceUsd` plus its
	 * `fees` lines.
	 */
	amountUsd: string;
	/** The currency paid in. */
	currency: Currency;
	/** The transaction's hash. */
	txHash: string;
	/** The chain it was paid on. */
	chain?: Chain;
	/** The transaction on the chain's block explorer. */
	explorerUrl?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;

	/**
	 * The subscription's product name when the bill was paid (later product edits don't change
	 * it).
	 */
	productName: string;
	/** The same, for the product's description; absent without one. */
	productDescription?: string;
	/** The subscription's product. */
	productUuid?: string;
	/** The subscription it bills (`sub@…`). */
	subscriptionUuid: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** Your reference of the customer, as the checkout was given it. */
	customerReference?: string;
	/** Names the customer, even once deleted (API reads only). */
	customer?: CustomerSummary;
	/** How it settled: its fees, its split and its transaction. */
	settlement: Settlement;
	/**
	 * The start of the period the bill paid: its due date (the subscription's start for its first
	 * bill); absent on bills recorded before it was.
	 */
	periodStart?: string;
	/**
	 * The end of the period the bill paid (the subscription's next bill): paid until then; absent
	 * on bills recorded before it was.
	 */
	periodEnd?: string;

	/** When the chain confirmed it (its block's time). */
	confirmedAt?: string;
	/**
	 * Everything the customer's wallet sent, in the currency's units (`amount` plus the network
	 * fee): a refund's base.
	 */
	paid?: string;
	/** The same in the currency's smallest unit. */
	paidMinUnits?: string;
	/** The same in USD. */
	paidUsd?: string;

	/** Its refund, if any (API reads only). */
	refund?: RefundSummary;
	/** Whether it can be refunded now (API reads only). */
	refundable?: boolean;
	/** Why not. */
	notRefundableReason?: NotRefundableReason;
}

/**
 * A row of the transactions feed (`transactions.list`): a one-time payment or a subscription's
 * bill, with the fields of its resource (a {@link Payment} or a {@link Bill}). Open the row's
 * detail by its `type` and `uuid` (`payments.get`, `subscriptions.getBill`).
 */
export interface Transaction {
	/** `payment` (`pay@…`) or `bill` (`sub-hist@…`). */
	type: TransactionKind;
	/** The payment's (`pay@…`) or the bill's (`sub-hist@…`) id. */
	uuid: string;
	/** When it was recorded, once confirmed on-chain. */
	createdAt: string;
	/** The customer's wallet that paid. */
	from: string;
	/** The wallet that received it. */
	to: string;
	/**
	 * What was paid for (a payment: its checkout's product name; a bill: its subscription's
	 * product name when it was billed).
	 */
	productName: string;
	/** The same, for the description; absent without one. */
	productDescription?: string;
	/**
	 * The price in USD, a decimal string: a payment's checkout price, a bill's subscription's
	 * locked price; absent on a bill of a subscription without a locked price.
	 */
	priceUsd?: string;
	/** What was added to the price, line by line; `[]` without any. */
	fees: FeeLine[];
	/** What the customer paid, in the currency's units, exact (a decimal string). */
	amount: string;
	/** The same in the currency's smallest unit, a string of digits. */
	amountMinUnits: string;
	/** What the customer paid in USD: the price and the fees' lines. */
	amountUsd: string;
	/** The currency paid in. */
	currency: Currency;
	/** The product paid for; absent for an inline product. */
	productUuid?: string;
	/** The transaction that paid it. */
	txHash: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** Names the customer, even once deleted (API reads only). */
	customer?: CustomerSummary;
	/** Your reference of the customer, as the checkout was given it. */
	customerReference?: string;
	/** A bill's subscription (`sub@…`); absent on a payment. */
	subscriptionUuid?: string;
	/** A bill's period's start (its due date); absent on a payment. */
	periodStart?: string;
	/** A bill's period's end: paid until then; absent on a payment. */
	periodEnd?: string;
	/** A payment's own reference (a bill has none of its own). */
	reference?: string;
	/** The reference of a bill's subscription. */
	subscriptionReference?: string;
	/**
	 * A payment's merchant data (copied from its checkout session); `{}` for a bill (its
	 * subscription's is on the subscription).
	 */
	metadata: Record<string, string>;
	/** The chain it was paid on. */
	chain?: Chain;
	/** The transaction on the chain's block explorer. */
	explorerUrl?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space the row is in; absent for the organization's own. */
	userUuid?: string;
	/** Its fees, split and transaction, as on the {@link Payment} or the {@link Bill}. */
	settlement: Settlement;

	/** When the chain confirmed it. */
	confirmedAt?: string;
	/** Everything the customer's wallet sent, in the currency's units. */
	paid?: string;
	/** The same in the currency's smallest unit. */
	paidMinUnits?: string;
	/** The same in USD. */
	paidUsd?: string;

	/** Its refund, if any. */
	refund?: RefundSummary;
	/** Whether it can be refunded now. */
	refundable?: boolean;
	/** Why not. */
	notRefundableReason?: NotRefundableReason;
}

/**
 * A failed payment attempt (the failures log): what the customer tried to pay, and why it
 * failed. Recorded once per attempt, never changed; it never moved money.
 */
export interface Failure {
	/** The failure's own id, a plain UUID (a failed attempt is no transaction: no prefix). */
	uuid: string;
	/** `payment`, `subscriptionCheckout` or `bill`. */
	kind: FailureKind;
	/**
	 * What failed: the checkout (`pay@…`, `sub@…`: the id its payment or subscription would have
	 * had) or the bill (`sub-hist@…`: its id once paid).
	 */
	txUuid: string;
	/** Its number among its transaction's failed attempts, from 1. */
	attempt: number;
	/** A bill's subscription (`sub@…`). */
	subscriptionUuid?: string;
	/** The error code (e.g. `insufficient_funds`). */
	code: string;
	/** What it means, from the code. */
	category: FailureCategory;
	/** What the customer was told; absent without a message. */
	message?: string;
	/**
	 * What the customer tried to pay, in the currency's units, exact (a decimal string): never
	 * received.
	 */
	attempted: string;
	/** The same in the currency's smallest unit, a string of digits. */
	attemptedMinUnits: string;
	/** The same in USD, a decimal string. */
	attemptedUsd: string;
	/** The currency it was tried in. */
	currency: Currency;
	/** The customer's wallet. */
	from: string;
	/** The transaction, when one was sent (a revert, a timeout). */
	txHash?: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** The product, when it had one. */
	productUuid?: string;
	/** When it failed. */
	createdAt: string;
	/** Names the customer (API reads only). */
	customer?: CustomerSummary;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it was paid to; absent for the organization's own. */
	userUuid?: string;
}

/** Filters `payments.list`. */
export interface PaymentListParams extends TransactionListFilters {
	/**
	 * Only the payment with this reference (set on its checkout): a page of 0 or 1 payment per
	 * space read (`payments.getByReference` reads it).
	 */
	reference?: string;
	/** Only the payments with (`true`) or without (`false`) an approved refund. */
	refunded?: boolean;
}

/** Filters `transactions.list`. */
export interface TransactionListParams extends TransactionListFilters {
	/** Only the one-time payments (`payment`) or only the subscriptions' bills (`bill`). */
	type?: TransactionKind;
	/** Only this subscription's bills (`sub@…` or the bare UUID). */
	subscriptionUuid?: string;
	/** Only the rows with (`true`) or without (`false`) an approved refund. */
	refunded?: boolean;
}

/** Filters `failures.list`. */
export interface FailureListParams extends TransactionListFilters {
	/** Only one kind: `payment`, `subscriptionCheckout` or `bill`. */
	kind?: FailureKind;
	/** Only one category. */
	category?: FailureCategory;
	/** Only this subscription's bills (`sub@…`). */
	subscriptionUuid?: string;
}
