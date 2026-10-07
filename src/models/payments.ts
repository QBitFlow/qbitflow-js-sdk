/**
 * Payments, bills, the combined feed and failures.
 *
 * @module
 */

import type {
	Chain,
	CombinedPaymentSource,
	FailureCategory,
	FailureKind,
	NotRefundableReason,
} from '../enums.js';
import type {
	Currency,
	CustomerSummary,
	PaymentMetadata,
	RefundSummary,
	TransactionListFilters,
} from './common.js';

/** A confirmed one-time payment. */
export interface Payment {
	/** The payment's id (`pay@…`), also its checkout session's. */
	uuid: string;
	/** When it was recorded, once confirmed on-chain. */
	createdAt: string;
	/** The customer's wallet. */
	from: string;
	/** The wallet that received it (the merchant's, or the organization's while it holds the member's funds). */
	to: string;
	/** What the customer paid, in USD (the network fee paid on top excluded). */
	amount: number;
	/** The amount in the token's min units (a decimal string). */
	amountMinUnits: string;
	/** The currency paid in. */
	currencyId: number;
	/** That currency, as `currencies.get` returns it; `null` when the API sends none. */
	currency: Currency | null;
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
	/** The merchant's reference for the payment, set when creating its checkout. */
	reference?: string;
	/** What was paid for: the checkout's product name when the checkout was created. */
	name: string;
	/** The same, for the product's description. */
	description: string;
	/** The product paid for; absent for an inline product. */
	productUuid?: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** The merchant's reference of the customer, as the checkout was given it. */
	customerReference?: string;
	/** A qbf.cash tipper's message to the handle's owner. */
	note?: string;
	/** Names the customer (API reads only, never in webhooks). */
	customer?: CustomerSummary;
	/** The payment's fees and split. */
	metadata: PaymentMetadata;
	/** When the chain confirmed it (its block's time), when known. */
	confirmedAt?: string;
	/** Everything the customer's wallet sent (amount plus the network fee paid on top), in min units: a refund's base. */
	paidMinUnits?: string;
	/** The same in USD. */
	paidUsd?: number;
	/** Its refund, if any (API reads only). */
	refund?: RefundSummary;
	/** Whether it can be refunded now (API reads only). */
	refundable?: boolean;
	/** Why not (`refundExists`, `heldFundsReleased`). */
	notRefundableReason?: NotRefundableReason;
	/** When its checkout session was created. */
	checkoutOpenedAt?: string;
}

/**
 * A subscription's paid bill (a subscription history entry, `sub-hist@…`).
 *
 * On `subscriptions.getPublicHistory` the fields the API only returns to the merchant
 * (`customerUuid`, `customerReference`, `customer`, `metadata`, `userUuid`, `paidMinUnits`,
 * `paidUsd`, `refund`…) are empty.
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
	/** What the customer paid, in USD. */
	amount: number;
	/** The amount in the token's min units (a decimal string). */
	amountMinUnits: string;
	/** The currency paid in. */
	currencyId: number;
	/** That currency. */
	currency: Currency | null;
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
	/** The subscription's product name when the bill was paid. */
	name: string;
	/** The same, for the product's description. */
	description: string;
	/** The subscription's product. */
	productUuid?: string;
	/** The bill's subscription (`sub@…`). */
	subscriptionUuid: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** The merchant's reference of the customer. */
	customerReference?: string;
	/** Names the customer (API reads only). */
	customer?: CustomerSummary;
	/** The bill's fees and split. */
	metadata: PaymentMetadata;
	/** The start of the period the bill paid (its due date). */
	periodStart?: string;
	/** The end of the period the bill paid: paid until then. */
	periodEnd?: string;
	/** When the chain confirmed it, when known. */
	confirmedAt?: string;
	/** Everything the customer's wallet sent, in min units. */
	paidMinUnits?: string;
	/** The same in USD. */
	paidUsd?: number;
	/** Its refund, if any (API reads only). */
	refund?: RefundSummary;
	/** Whether it can be refunded now (API reads only). */
	refundable?: boolean;
	/** Why not. */
	notRefundableReason?: NotRefundableReason;
}

/** A row of the combined feed: a one-time payment or a subscription's bill. */
export interface CombinedPayment {
	/** `payment` or `subscriptionHistory`. */
	source: CombinedPaymentSource;
	/** The payment's (`pay@…`) or the bill's (`sub-hist@…`) id. */
	uuid: string;
	/** When it was recorded, once confirmed on-chain. */
	createdAt: string;
	/** The customer's wallet. */
	from: string;
	/** The wallet that received it. */
	to: string;
	/** What was paid for. */
	name: string;
	/** The same, for the description. */
	description: string;
	/** What the customer paid, in USD. */
	amount: number;
	/** The amount in the currency's min units (a decimal string). */
	amountMinUnits: string;
	/** The currency paid in. */
	currencyId: number;
	/** That currency. */
	currency: Currency | null;
	/** The product paid for; absent for an inline product. */
	productUuid?: string;
	/** The transaction's hash. */
	txHash: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** Names the customer (API reads only). */
	customer?: CustomerSummary;
	/** The merchant's reference of the customer. */
	customerReference?: string;
	/** The bill's subscription (`sub@…`); absent on a payment. */
	subscriptionUuid?: string;
	/** The payment's own reference (payment rows). */
	reference?: string;
	/** The reference of the bill's subscription (bill rows). */
	subscriptionReference?: string;
	/** The chain it was paid on. */
	chain?: Chain;
	/** The transaction on the chain's block explorer. */
	explorerUrl?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space the row is in; absent for the organization's own. */
	userUuid?: string;
	/** Its refund, if any. */
	refund?: RefundSummary;
	/** Whether it can be refunded now. */
	refundable?: boolean;
	/** Why not. */
	notRefundableReason?: NotRefundableReason;
	/** Its fees and split; `null` only on payments recorded before fees were split (v1). */
	metadata: PaymentMetadata | null;
}

/** A failed attempt to pay a checkout or a bill (the failures log). */
export interface Failure {
	/** The failure's id. */
	uuid: string;
	/** `payment`, `subscriptionCheckout` or `bill`. */
	kind: FailureKind;
	/** What failed: the checkout (`pay@…`, `sub@…`) or the bill (`sub-hist@…`). */
	txUuid: string;
	/** Its number among its transaction's failed attempts, from 1. */
	attempt: number;
	/** A bill's subscription (`sub@…`). */
	subscriptionUuid?: string;
	/** The error code (e.g. `insufficient_funds`). */
	code: string;
	/** What it means, from the code. */
	category: FailureCategory;
	/** What the customer was told. */
	message?: string;
	/** What the customer tried to pay, in USD: never received. */
	attemptedUsd: number;
	/** The same in the currency's min units (a decimal string). */
	attemptedMinUnits: string;
	/** The currency it was tried in. */
	currencyId: number;
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
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
}

/** Filters `payments.list` (page size: server default 10, max 50). */
export interface PaymentListParams extends TransactionListFilters {
	/** Only the payments with (`true`) or without (`false`) an approved refund. */
	refunded?: boolean;
}

/** Filters `payments.listCombined` (page size: server default 10, max 50). */
export interface CombinedPaymentListParams extends TransactionListFilters {
	/** Only the payments (`payment`) or only the bills (`subscriptionHistory`). */
	source?: CombinedPaymentSource;
	/** Only this subscription's bills (`sub@…`). */
	subscriptionUuid?: string;
	/** Only the rows with (`true`) or without (`false`) an approved refund. */
	refunded?: boolean;
}

/** Filters `failures.list` (page size: server default 10, max 50). */
export interface FailureListParams extends TransactionListFilters {
	/** Only one kind: `payment`, `subscriptionCheckout` or `bill`. */
	kind?: FailureKind;
	/** Only one category. */
	category?: FailureCategory;
	/** Only this subscription's bills (`sub@…`). */
	subscriptionUuid?: string;
}
