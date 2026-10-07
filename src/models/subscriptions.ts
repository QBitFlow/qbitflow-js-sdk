/**
 * Subscriptions.
 *
 * @module
 */

import type {
	ActionRequired,
	BillingOutcome,
	BillingStage,
	CancellationReason,
	SubscriptionStatus,
} from '../enums.js';
import type { Currency, CustomerSummary, Duration, TransactionListFilters } from './common.js';

/** A subscription. Grant access while `now < currentPeriodEnd`. */
export interface Subscription {
	/** The subscription's id (`sub@…`), its checkout session's for life. */
	uuid: string;
	/** The merchant's reference, set when creating its checkout. */
	reference?: string;
	/** When it was created. */
	createdAt: string;
	/** When it last changed. */
	updatedAt: string;
	/** The subscriber's wallet. */
	from: string;
	/** The wallet that receives the bills. */
	to: string;
	/** The subscription's product. */
	productUuid: string;
	/** The transaction that created it on-chain (`''` on a trial until confirmed). */
	subscriptionHash: string;
	/** The currency billed. */
	currencyId: number;
	/** That currency. */
	currency: Currency | null;
	/** The billing interval. */
	frequency: Duration;
	/** What remains of the allowance the subscriber granted, in the token's min units (a decimal string). */
	allowance: string;
	/** `trial`, `trialExpired`, `active`, `pastDue`, `paused`, `stopped` or `cancelled`. */
	status: SubscriptionStatus;
	/** What its customer must do (`topUpAllowance`, `raiseMaximum`, `confirmTrial`); absent for nothing. */
	actionRequired?: ActionRequired;
	/** The end of the period paid for (or of the trial): grant access while `now < currentPeriodEnd`. */
	currentPeriodEnd?: string;
	/** The price per period the customer subscribed at, in USD (a decimal string; `"0"` for old v1 subscriptions). */
	priceUsd: string;
	/** The customer's maximum per period, in min units (a decimal string); absent on trials and old subscriptions. */
	maxAmountPerPeriod?: string;
	/** The date of the last bill. */
	lastBillingDate: string;
	/** When the next bill is due (a trial: when it ends; stopped: when it is cancelled); absent once cancelled. */
	nextBillingDate?: string;
	/** When it was cancelled. */
	cancelledAt?: string;
	/** Why it stopped or was cancelled. */
	cancellationReason?: CancellationReason;
	/** The earliest date it can be cancelled (`minPeriods`). */
	minimumCancellationDate?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** The merchant's reference of the customer. */
	customerReference?: string;
	/** Names the customer (API reads only). */
	customer?: CustomerSummary;
	/** The failing bill's retries, while past due (API reads only). */
	dunning?: DunningStatus;
}

/** A past-due subscription's retries. */
export interface DunningStatus {
	/** The bill's failed attempts so far. */
	failedAttempts: number;
	/** The attempts left: after the last one fails, it is cancelled. */
	remainingAttempts: number;
	/** The bill's first failed attempt. */
	failingSince?: string;
	/** When the bill is tried again at the latest. */
	nextAttemptAt?: string;
	/** When it started waiting for the customer to raise their maximum. */
	awaitingMaximumSince?: string;
}

/** `subscriptions.cancel`'s answer. */
export interface SubscriptionCancellation {
	/** The subscription as the API answered it. */
	subscription: Subscription;
	/**
	 * True when the API answered 202: the cancellation is still confirming on-chain and
	 * `subscription.status` is not updated yet (`subscription.statusChanged` tells the end).
	 */
	pending: boolean;
}

/** A test billing run's state (`subscriptions.executeTestBilling`). */
export interface BillingState {
	/** The bill's id, bare (its history entry is `sub-hist@<billUuid>`). */
	billUuid: string;
	/** `running`, `waiting`, `pending` or `done`. */
	stage: BillingStage;
	/** How it ended, once done. */
	outcome?: BillingOutcome;
	/** The failed attempts so far. */
	attempts: number;
	/** When it tries again at the latest, while waiting or pending. */
	nextAttempt?: string;
	/** The charge's transaction, once paid. */
	txHash?: string;
	/** The last failure's code (e.g. `insufficient_allowance`). */
	failureCode?: string;
}

/** Filters `subscriptions.list` (page size: server default 20, max 100). */
export interface SubscriptionListParams extends TransactionListFilters {
	/** Only those in this status. */
	status?: SubscriptionStatus;
	/** Only the one with this reference. */
	reference?: string;
}

/** Pages `subscriptions.listBills` (page size: server default 20, max 100). */
export interface BillListParams {
	/** The page size (0 or absent = the server's default). */
	limit?: number;
	/** The previous page's `nextCursor`; absent for the first page. */
	cursor?: string;
}

/** `subscriptions.cancel`'s options. */
export interface CancelSubscriptionParams {
	/** Cancel now (absent or `true`, the default); `false` stops it at the end of the current period. */
	immediate?: boolean;
}
