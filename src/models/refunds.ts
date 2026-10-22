/**
 * Refunds.
 *
 * @module
 */

import type { Chain, CheckoutSessionStatusValue, RefundInitiator, RefundStatus } from '../enums.js';
import type {
	Attempt,
	Currency,
	CustomerSummary,
	PageParams,
	TransferSettlement,
} from './common.js';

/**
 * A refund of a payment (`pay@…`) or a subscription bill (`sub-hist@…`): a customer's request the
 * merchant approves or rejects, or a refund the merchant sent from the dashboard (recorded once its
 * transfer confirmed: `approved`, nothing before). Refunds are read only here. It is also the data
 * of the `refund.requested`, `refund.approved` and `refund.rejected` events.
 */
export interface Refund {
	/** The refund's id (`refund@…`). */
	uuid: string;
	/** The refunded transaction: a payment (`pay@…`) or a bill (`sub-hist@…`). */
	txUuid: string;
	/**
	 * Why the refund: the customer's reason, or the merchant's when it started the refund; absent
	 * when it gave none.
	 */
	reason?: string;
	/**
	 * `pending` (a customer's request not answered yet), `approved` (its transfer confirmed) or
	 * `rejected`. `failed` is declared but never set.
	 */
	status: RefundStatus;
	/** When it was requested (or prepared by the merchant). */
	createdAt: string;
	/**
	 * The merchant's message to the customer (why it rejected the request, or a note on a refund
	 * it started); absent when none.
	 */
	merchantMessage?: string;
	/** When the refund was answered (rejected, or its transfer confirmed); absent while pending. */
	respondedAt?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space the refunded transaction is in; absent for the organization's own. */
	userUuid?: string;
	/** The refund transfer's transaction, once approved; absent before. */
	txHash?: string;
	/**
	 * `customer` (requested by the customer, the merchant answers) or `merchant` (sent by the
	 * merchant without a request, from the dashboard: recorded once confirmed, `approved`).
	 */
	initiatedBy: RefundInitiator;
	/**
	 * True when the refunded payment was paid to the organization's wallet, which holds the
	 * seller's funds: the organization decides the refund and sends it from its wallet. Once
	 * sent, it is a negative line of the seller's held funds.
	 */
	held: boolean;
	/**
	 * What the customer paid for the refunded transaction (its amount, fees included, and the
	 * network fee they paid on top), in the currency's units: the base of `refundPercent`.
	 */
	paid: string;
	/** The same in the currency's smallest unit, a string of digits. */
	paidMinUnits: string;
	/**
	 * The same in USD at the refunded transaction's time; absent when unknown (a request made
	 * before it was recorded).
	 */
	paidUsd?: string;
	/**
	 * The share of `paid` the refund sends back, a percent string (`"100"`: all of it). A customer
	 * requests `"100"`; the merchant sets it when it approves, or when it starts the refund.
	 */
	refundPercent: string;
	/**
	 * What the refund sends back: `refundPercent` of `paid`, rounded down to a whole min unit, in
	 * the currency's units.
	 */
	amount: string;
	/** The same in the currency's smallest unit, a string of digits. */
	amountMinUnits: string;
	/** The same in USD at the refunded transaction's time; absent when unknown. */
	amountUsd?: string;
	/** The currency paid, and sent back. */
	currency: Currency;
	/** The refund transfer's transaction (its block, what it cost), once approved; absent before. */
	settlement?: TransferSettlement;
	/** The currency's chain. */
	chain?: Chain;
	/** The refund transfer on the chain's explorer, once sent. */
	explorerUrl?: string;
	/**
	 * Where the refund transfer stands while the request is pending and it was sent (approved, or
	 * answered by the merchant's own refund): being confirmed, or its last attempt failed (API
	 * reads only, never in webhooks).
	 */
	approval?: RefundApproval;
	/** The refunded transaction's customer (API reads only). */
	customerUuid?: string;
	/** What the refunded transaction paid for (API reads only). */
	productName?: string;
	/** Names the refunded transaction's customer, even once deleted (API reads only). */
	customer?: CustomerSummary;
}

/** Where a pending request's refund transfer stands once sent. */
export interface RefundApproval {
	/**
	 * `waitingConfirmation` (sent, being confirmed on-chain) or `created` (its last attempt failed:
	 * `lastAttempt`; send it again from the dashboard).
	 */
	status: CheckoutSessionStatusValue;
	/** The transfer being confirmed, once known. */
	txHash?: string;
	/** Why the last attempt failed. */
	lastAttempt?: Attempt;
}

/** Filters `refunds.list`. */
export interface RefundListParams extends PageParams {
	/**
	 * Only the refunds in one of these statuses (at most 5 of `pending`, `approved`, `rejected`,
	 * `failed`), sent as a repeated `?status=`; absent or `[]`: every status.
	 * `['pending']` lists the ones awaiting an answer.
	 */
	status?: RefundStatus[];
	/** Only the refund of this transaction (`pay@…`, `sub-hist@…`, or the bare UUID). */
	txUuid?: string;
	/**
	 * Only the refunds of payments held for a member (`true`: the ones the organization decides
	 * and sends), or only the others (`false`).
	 */
	held?: boolean;
	/**
	 * Add the members' refunds, each naming its member: the API's default is `true` from the
	 * organization's space (`false` from a member's, where `true` is refused). Not with
	 * `userUuid`.
	 */
	includeMembers?: boolean;
	/** Read one member's refunds (organization space only). */
	userUuid?: string;
}
