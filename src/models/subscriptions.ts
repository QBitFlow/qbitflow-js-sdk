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
import type {
	Currency,
	CustomerSummary,
	Duration,
	FeeLine,
	PageParams,
	TokenAmount,
	TransactionListFilters,
} from './common.js';

/**
 * A subscription (`sub@…`). Grant access while `now < currentPeriodEnd`, whatever the status
 * (`hasAccess(subscription)`): the status says why, `actionRequired` what its customer must do.
 */
export interface Subscription {
	/** The subscription's id (`sub@…`), its checkout session's for life. */
	uuid: string;
	/**
	 * Your reference for the subscription (an order or customer id), set when creating its
	 * checkout.
	 */
	reference?: string;
	/** When it was created. */
	createdAt: string;
	/** Its last change (a bill, a status, its metadata). */
	updatedAt: string;
	/**
	 * The subscriber's wallet, the one it bills; absent when unknown (a trial not confirmed yet may
	 * have none).
	 */
	from?: string;
	/**
	 * The wallet its bills pay: the merchant's (or, while the organization holds a member's funds,
	 * the organization's).
	 */
	to: string;
	/** Its product (`products.get`); absent without one. */
	productUuid?: string;
	/**
	 * The transaction that created it on-chain; absent until then (a trial, until its customer
	 * confirms it).
	 */
	subscriptionHash?: string;
	/** The currency (token) billed. */
	currency: Currency;
	/** The billing interval. */
	frequency: Duration;
	/**
	 * `trial`, `trialExpired`, `active`, `pastDue`, `paused`, `stopped` or `cancelled`. Every
	 * change sends `subscription.statusChanged`.
	 */
	status: SubscriptionStatus;
	/**
	 * What its customer must do (`topUpAllowance`, `raiseMaximum`, `confirmTrial`); absent for
	 * nothing. Every change sends `subscription.actionRequiredChanged`.
	 */
	actionRequired?: ActionRequired;
	/**
	 * The paid-through date: grant access while `now < currentPeriodEnd`, whatever the status. A
	 * trial: its end; `active`, `paused`, `stopped`: the end of the period paid for; `pastDue`: the
	 * start of the unpaid period (past); `cancelled`: when it was cancelled, or the end of its last
	 * paid period if that came first. Absent when unknown.
	 */
	currentPeriodEnd?: string;
	/**
	 * The price per period the customer subscribed at, in USD (a decimal string, `"9.99"`), locked
	 * at signup (a free trial's too); never `"0"`. Every bill charges it plus `fees`, converted to
	 * the token at the bill's price.
	 */
	priceUsd: string;
	/**
	 * What its checkout added to the price, line by line, as the customer saw them (a tax,
	 * shipping, the processing fee when the customer pays it), locked at signup with the price:
	 * every bill charges `priceUsd` plus these lines. `[]` without any.
	 */
	fees: FeeLine[];
	/**
	 * What the subscriber's wallet still lets QBitFlow bill, and the most one bill may charge, at
	 * today's price; absent during a free trial (nothing signed yet).
	 */
	allowance?: Allowance;
	/** When it was last billed; absent before its first bill (a trial). */
	lastBilledAt?: string;
	/**
	 * When its next bill is due (a trial: when it ends; `stopped`: when it is cancelled); absent
	 * once cancelled.
	 */
	nextBillingAt?: string;
	/** When it was cancelled; absent until then. */
	cancelledAt?: string;
	/** Why it stopped or was cancelled; absent while it runs. */
	cancellationReason?: CancellationReason;
	/**
	 * The earliest its customer may cancel it (the checkout's `minPeriods`); absent when they may
	 * cancel it any time.
	 */
	cancellableAt?: string;
	/**
	 * Your own data: its checkout session's, copied when the subscription was created, then
	 * changed with `subscriptions.update` (merged). `{}` without any.
	 */
	metadata: Record<string, string>;
	/**
	 * The subscription's page for its customer: where they top up its allowance, raise its
	 * maximum, pause, resume or cancel it, and confirm a trial. Share it with them.
	 */
	managementPageLink?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
	/** The customer, when QBitFlow has one. */
	customerUuid?: string;
	/** Your reference of the customer, as the checkout was given it. */
	customerReference?: string;
	/** Names the customer, even once deleted (API reads only). */
	customer?: CustomerSummary;
	/**
	 * Where its failing bill's retries stand (API reads only: webhooks tell each failure with
	 * `subscription.billingFailed`); absent while no bill is failing.
	 */
	dunning?: DunningStatus;
}

/**
 * What a subscriber's wallet still lets QBitFlow bill for their subscription (the allowance left
 * on-chain), in the subscription's token, how many bills that covers at today's price, and the
 * most one bill may charge, as they signed it. `amount`, `amountMinUnits` and `amountUsd` (its
 * value at today's price; absent without one) come from {@link TokenAmount}.
 */
export interface Allowance extends TokenAmount {
	/**
	 * How many whole bills the allowance still covers at today's price (rounded down, before each
	 * bill's network fee). 0 is a value: the customer must top it up (`actionRequired`
	 * `topUpAllowance`) before the next bill. Absent without a price.
	 */
	remainingPeriods?: number;
	/**
	 * The most one bill may charge, as the subscriber signed it, in the token's units: a bill
	 * above it waits for a new maximum (`actionRequired` `raiseMaximum`). Absent when none is
	 * recorded.
	 */
	maxPerPeriod?: string;
	/** The same as an on-chain integer. */
	maxPerPeriodMinUnits?: string;
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

/**
 * Where a test bill stands once its attempt settled (`subscriptions.testBill`): done (its
 * `outcome`), waiting for its next attempt after a failure (`failureCode`, `nextAttemptAt`), or
 * still running after 2 minutes. Its events are a live bill's (`subscription.billed`,
 * `subscription.billingFailed`, `subscription.statusChanged`).
 */
export interface TestBill {
	/**
	 * The bill (`sub-hist@…`): the id its `subscription.billed` and `subscriptions.getBill` carry
	 * once it is paid.
	 */
	billUuid: string;
	/**
	 * `running` (being charged), `waiting` (for its next attempt, its due date or a trial's grace
	 * period), `pending` (over the customer's maximum: waiting for a new one) or `done`.
	 */
	stage: BillingStage;
	/** How it ended, once done: `paid`, `notDue`, `skipped`, `cancelled` or `paused`; absent before. */
	outcome?: BillingOutcome;
	/** Its failed attempts so far. */
	attempts: number;
	/** When it is tried again at the latest, while waiting or pending; absent otherwise. */
	nextAttemptAt?: string;
	/** The charge's transaction, once paid. */
	txHash?: string;
	/** Its last failure's code (e.g. `insufficient_allowance`). */
	failureCode?: string;
}

/**
 * Changes a subscription (`subscriptions.update`): its metadata only. Its price and terms are
 * locked at signup; its status changes through its actions (`cancel`, its customer's pause and
 * resume).
 */
export interface UpdateSubscriptionParams {
	/**
	 * Merged into the subscription's: a key set to a value sets it, a key set to `''` deletes it,
	 * keys not named are kept (absent: unchanged). At most 50 keys once merged; each key 1 to 40
	 * of `A-Z a-z 0-9 _ - . :`, each value at most 500 characters without control or
	 * bidirectional characters.
	 */
	metadata?: Record<string, string>;
}

/** Filters `subscriptions.list`. */
export interface SubscriptionListParams extends TransactionListFilters {
	/**
	 * Only those in this status (cancelled ones are listed unless filtered out). Not checked
	 * against the known statuses: a newer one is sent as is.
	 */
	status?: SubscriptionStatus;
	/**
	 * Only the one with this reference (a page of 0 or 1 subscription;
	 * `subscriptions.getByReference` reads it).
	 */
	reference?: string;
}

/** Pages `subscriptions.listBills`. */
export type BillListParams = PageParams;

/** `subscriptions.cancel`'s options. */
export interface CancelSubscriptionParams {
	/**
	 * Cancel now (absent or `true`, the default: status `cancelled`); `false` stops it now
	 * (status `stopped`, never billed again) and cancels it when its paid period ends
	 * (`nextBillingAt`). A trial is cancelled immediately only (`false`: 400).
	 */
	immediate?: boolean;
}
