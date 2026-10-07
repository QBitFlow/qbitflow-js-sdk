/**
 * Refunds.
 *
 * @module
 */

import type { Chain, CheckoutSessionStatusValue, RefundInitiator, RefundStatus } from '../enums.js';
import type { Attempt, CustomerSummary, TxMetadata } from './common.js';

/** A refund of a payment or a bill. */
export interface Refund {
	/** The refund's id (`refund@…`). */
	uuid: string;
	/** The refunded transaction: a payment (`pay@…`) or a bill (`sub-hist@…`). */
	txUuid: string;
	/** The customer's reason, or the merchant's when it started the refund. */
	reason: string;
	/** `pending`, `approved` or `rejected`. */
	status: RefundStatus;
	/** When it was requested or started. */
	createdAt: string;
	/** The merchant's message to the customer (`''` until set). */
	merchantMessage: string;
	/** When the merchant answered; `null` while pending. */
	respondedAt: string | null;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
	/** The refund transfer's hash (`''` until sent). */
	txHash: string;
	/** `customer` (a request the merchant answers) or `merchant`. */
	initiatedBy: RefundInitiator;
	/** True when the refunded transaction's funds are held by the organization. */
	held: boolean;
	/** What the customer paid for the refunded transaction, in min units. */
	paidMinUnits: string;
	/** The same in USD. */
	paidUsd: number;
	/** The share of what the customer paid it sends back, in percent. */
	refundPercent: number;
	/** What it sends back, in min units (a decimal string). */
	amountMinUnits: string;
	/** The same in USD, at the refunded transaction's time. */
	amountUsd: number;
	/** The currency paid, and sent back. */
	currencyId: number;
	/** The refund transfer's network fees and block, once approved; `null` before. */
	metadata: TxMetadata | null;
	/** The currency's chain. */
	chain?: Chain;
	/** The refund transfer on the chain's explorer, once sent. */
	explorerUrl?: string;
	/** The approval being confirmed, or its failed attempt (API reads only). */
	approval?: RefundApproval;
	/** What the refunded transaction paid for (API reads only). */
	productName?: string;
	/** Names the refunded transaction's customer (API reads only). */
	customer?: CustomerSummary;
}

/** A refund's approval in progress. */
export interface RefundApproval {
	/** `waitingConfirmation` (sent, being confirmed) or `created` (its last attempt failed). */
	status: CheckoutSessionStatusValue;
	/** The transfer being confirmed, once known. */
	txHash?: string;
	/** Why the last attempt failed. */
	lastAttempt?: Attempt;
}

/** Starts a refund (`refunds.initiate`): a pending refund the merchant signs in the dashboard. */
export interface InitiateRefundParams {
	/** Required: the payment (`pay@…`) or bill (`sub-hist@…`) to refund. */
	txUuid: string;
	/** The share of what the customer paid to send back: above 0, at most 100, at most 2 decimals (absent = 100). */
	refundPercent?: number;
	/** Why the merchant refunds (optional, at most 500 characters). */
	reason?: string;
	/** A note to the customer (optional, at most 500 characters). */
	merchantMessage?: string;
}

/**
 * Filters `refunds.list` and `refunds.listInactive` (`limit` and `cursor` page the latter;
 * `refunds.list` does not send them).
 */
export interface RefundListParams {
	/** `listInactive`'s page size (server default 10, max 50). */
	limit?: number;
	/** `listInactive`'s previous page's `nextCursor`. */
	cursor?: string;
	/**
	 * Add the members' refunds: the API's default is `true` from the organization's space
	 * (`false` from a member's, where `true` is refused). Not `true` with `userUuid`.
	 */
	includeMembers?: boolean;
	/** Read one member's refunds (organization space only). */
	userUuid?: string;
	/** Only the refunds of held (`true`) or not held (`false`) transactions. */
	held?: boolean;
}
