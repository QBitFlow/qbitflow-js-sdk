/**
 * Webhook events: the envelope every v2 delivery (and every event of the log) carries, typed
 * by its `type`.
 *
 * `Event` is a discriminated union: narrow it with `event.type` (a `switch` works) or with the
 * type guards `isEventType` / `isUnknownEvent` (`webhooks.isEventType`), and `event.data` is
 * typed. An event of a type this SDK does not know is an {@link UnknownEvent} with its raw
 * `data`: answer it 2xx and ignore it.
 *
 * @module
 */

import type {
	ActionRequired,
	BillingFailureReason,
	Chain,
	KnownEventType,
	SubscriptionStatus,
} from '../enums.js';
import type { PaymentSessionData, SubscriptionSessionData } from './checkout.js';
import type { Currency, TransferSettlement } from './common.js';
import type { LedgerEntry, Member } from './members.js';
import type { Bill, Payment } from './payments.js';
import type { Refund } from './refunds.js';
import type { Subscription } from './subscriptions.js';

/**
 * `payment.completed`'s data: the payment, confirmed, as `payments.get` returns it to its owner
 * (its refund state excepted: API reads only), and its customer page. Fulfil the order: `uuid` is
 * the checkout session's `pay@…`, `reference` and `metadata` yours.
 */
export interface PaymentCompleted extends Payment {
	/** The payment's page for its customer. */
	managementPageLink?: string;
}

/**
 * `subscription.billed`'s data: the bill paid, and its subscription as the bill leaves it. Access
 * is paid until `bill.periodEnd`, unless `subscription.status` is `cancelled` (a charge that
 * landed just after a cancellation: record it, grant nothing).
 */
export interface SubscriptionBilled {
	/**
	 * The bill paid (as `subscriptions.getBill` returns it): its currency, settlement, and the
	 * period it pays, `periodStart` → `periodEnd`.
	 */
	bill: Bill;
	/**
	 * The subscription once the bill is paid: `active` (`stopped`, `paused` or `cancelled` if that
	 * happened while the charge was on its way), its next bill, its allowance, its reference and
	 * its metadata.
	 */
	subscription: Subscription;
}

/**
 * `subscription.statusChanged`'s data: the subscription with its new `status`, and the one
 * before. Every status change sends it, once.
 */
export interface SubscriptionStatusChanged extends Subscription {
	/** The status before the change. */
	previousStatus: SubscriptionStatus;
}

/**
 * `subscription.actionRequiredChanged`'s data: the subscription with its new `actionRequired`
 * (absent: nothing to do anymore), and the one before. Its `managementPageLink` is where the
 * customer acts.
 */
export interface SubscriptionActionRequiredChanged extends Subscription {
	/** What its customer had to do before (absent: nothing). */
	previousActionRequired?: ActionRequired;
}

/**
 * `subscription.billingFailed`'s data: the subscription as a failed bill attempt leaves it, and
 * the failure. Its `managementPageLink` is where the customer fixes it. Sent once per failed
 * attempt (`pastDue`), and once when a bill above the customer's maximum starts waiting for a new
 * one (`maxAmountExceeded`: no attempt spent).
 */
export interface SubscriptionBillingFailed extends Subscription {
	/**
	 * What the customer does: `insufficientBalance` (add funds to the wallet),
	 * `allowanceExhausted` (top up the allowance), `approvalRevoked` (approve the token again),
	 * `maxAmountExceeded` (sign a new maximum) or `other` (the network refused the charge).
	 */
	reason: BillingFailureReason;
	/** The charge's error code (e.g. `insufficient_funds`, `insufficient_allowance`). */
	failureCode?: string;
	/** The bill that failed: the `sub-hist@…` its `subscription.billed` has once it is paid. */
	billUuid: string;
	/** The bill, in USD, a decimal string: its `priceUsd` plus its `fees` lines. */
	amountUsd: string;
	/** This bill's failed attempts so far, this one included (`maxAmountExceeded` spends none). */
	attempt: number;
	/**
	 * The attempts left (retried 1, 3, 5 and 7 days after the first failed attempt). 0: this was
	 * the last; its cancellation follows (`subscription.statusChanged`).
	 */
	remainingAttempts: number;
	/**
	 * When the bill is tried again at the latest (`maxAmountExceeded`: when it stops waiting for a
	 * new maximum); absent after the last attempt.
	 */
	nextAttemptAt?: string;
}

/**
 * `subscription.upcomingBill`'s data: a bill (or a trial's end) is near, sent once per bill some
 * days before (3 by default). Remind the customer when `balanceSufficient` or
 * `allowanceSufficient` is false, or when `trialEnding`.
 */
export interface SubscriptionUpcomingBill extends Subscription {
	/** When it is billed (for a trial: when the trial ends). */
	billingAt: string;
	/** What the bill charges, in USD, a decimal string: its `priceUsd` plus its `fees` lines. */
	amountUsd: string;
	/**
	 * True when the trial ends then: the customer confirms the subscription (its
	 * `managementPageLink`) to be billed.
	 */
	trialEnding: boolean;
	/**
	 * Whether the wallet holds the bill at today's price; absent for a trial, or when it couldn't
	 * be checked.
	 */
	balanceSufficient?: boolean;
	/** Whether the remaining allowance covers the bill; absent for a trial, or without a price. */
	allowanceSufficient?: boolean;
}

/**
 * `member.joined`'s data: the member, in the mode they joined, and the invitation they accepted.
 * Store `userUuid` for `onBehalfOf`.
 */
export interface MemberJoined extends Member {
	/** The invitation they accepted (`invitations.create`'s `uuid`): match the event to it. */
	invitationUuid: string;
}

/**
 * `heldFunds.released`'s data: the transfer paying a member the funds the organization held for
 * them (in the member's space: the envelope's `userUuid`), and the lines it settled.
 */
export interface HeldFundsReleased {
	/** The transfer's id (`transfer@…`). */
	uuid: string;
	/** When it was recorded. */
	createdAt: string;
	/** The organization's wallet. */
	from: string;
	/** The member's wallet. */
	to: string;
	/** What the member received, in the currency's units, exact: the sum of the lines' `owed`. */
	amount: string;
	/** The same in the currency's smallest unit. */
	amountMinUnits: string;
	/** The same in USD, at the release's price. */
	amountUsd: string;
	/** The currency paid in. */
	currency: Currency;
	/** The transaction's hash. */
	txHash: string;
	/** The chain. */
	chain?: Chain;
	/** The transaction on the chain's block explorer. */
	explorerUrl?: string;
	/** True in test mode. */
	test: boolean;
	/** The member paid. */
	userUuid?: string;
	/** True once the recipient received it. */
	received: boolean;
	/** The transfer's transaction: its block and what it cost its sender. */
	settlement: TransferSettlement;
	/**
	 * The lines it settled, oldest first: the payments it paid (positive) and the refunds of them
	 * it took off (negative, type `refund`), each with what it counted for (`owed`,
	 * `owedMinUnits`, `owedUsd`).
	 */
	ledgers: LedgerEntry[];
}

/** `webhook.test`'s data (the dashboard's test delivery). */
export interface WebhookTest {
	/** The endpoint tested. */
	endpointUuid: string;
	/** The test's message. */
	message: string;
}

/**
 * The envelope of an event of type `T` with data `D`.
 *
 * Deliveries are at least once: deduplicate on `id`, and answer 2xx fast (also to the events you
 * ignore). `userUuid` names the member whose space the event happened in: pass it as
 * `onBehalfOf` for follow-up reads.
 */
export interface EventEnvelope<T extends string, D> {
	/** The event's id (`evt_…`): the same on every retry, deduplicate on it. */
	id: string;
	/** The event's type. */
	type: T;
	/** When it happened (at most millisecond precision). */
	createdAt: string;
	/** True when it happened in test mode. */
	test: boolean;
	/** The member whose space it happened in; absent for the organization's own. */
	userUuid?: string;
	/** The event's object. */
	data: D;
}

/** `payment.completed`: a one-time payment confirmed ({@link PaymentCompleted}). Fulfil the order. */
export type PaymentCompletedEvent = EventEnvelope<'payment.completed', PaymentCompleted>;
/**
 * `subscription.created`: the subscription (status `active`, or `trial`), as `subscriptions.get`
 * returns it, its `managementPageLink` included. Grant access until `currentPeriodEnd`.
 */
export type SubscriptionCreatedEvent = EventEnvelope<'subscription.created', Subscription>;
/** `subscription.billed`: the bill paid and its subscription (`data.bill`, `data.subscription`). */
export type SubscriptionBilledEvent = EventEnvelope<'subscription.billed', SubscriptionBilled>;
/** `subscription.statusChanged`: the subscription's new and previous status ({@link SubscriptionStatusChanged}). */
export type SubscriptionStatusChangedEvent = EventEnvelope<
	'subscription.statusChanged',
	SubscriptionStatusChanged
>;
/** `subscription.actionRequiredChanged`: what the customer must do changed ({@link SubscriptionActionRequiredChanged}). */
export type SubscriptionActionRequiredChangedEvent = EventEnvelope<
	'subscription.actionRequiredChanged',
	SubscriptionActionRequiredChanged
>;
/** `subscription.billingFailed`: a bill's attempt failed, or a bill waits ({@link SubscriptionBillingFailed}). */
export type SubscriptionBillingFailedEvent = EventEnvelope<
	'subscription.billingFailed',
	SubscriptionBillingFailed
>;
/** `subscription.upcomingBill`: a bill, or a trial's end, is near ({@link SubscriptionUpcomingBill}). */
export type SubscriptionUpcomingBillEvent = EventEnvelope<
	'subscription.upcomingBill',
	SubscriptionUpcomingBill
>;
/**
 * `refund.requested`: a new pending refund, always a customer's request (`initiatedBy`
 * `customer`). A merchant's own refund is announced only by `refund.approved`.
 */
export type RefundRequestedEvent = EventEnvelope<'refund.requested', Refund>;
/**
 * `refund.approved` (was `refund.completed`): the refund, approved, its transfer confirmed
 * (`txHash`, `settlement.transaction`); `refundPercent` and `amount` are the share actually paid
 * back. For a merchant's own refund (`initiatedBy` `merchant`) it is the first and only event.
 */
export type RefundApprovedEvent = EventEnvelope<'refund.approved', Refund>;
/**
 * `refund.rejected` (was `refund.denied`): a customer's request rejected by whoever decides it. A
 * decision, final.
 */
export type RefundRejectedEvent = EventEnvelope<'refund.rejected', Refund>;
/** `member.joined`: someone accepted an invitation and is now a member ({@link MemberJoined}). */
export type MemberJoinedEvent = EventEnvelope<'member.joined', MemberJoined>;
/** `member.removed`: a member was removed from the organization (the {@link Member}). */
export type MemberRemovedEvent = EventEnvelope<'member.removed', Member>;
/** `heldFunds.released`: a member's held funds were paid out to them ({@link HeldFundsReleased}). */
export type HeldFundsReleasedEvent = EventEnvelope<'heldFunds.released', HeldFundsReleased>;
/**
 * `checkout.expired`: the expired session, a payment's or a subscription's (chosen by its
 * `txType`; tell them apart with `webhooks.isSubscriptionSession`). An unknown `txType` decodes
 * as a payment's (the raw object is kept).
 */
export type CheckoutExpiredEvent = EventEnvelope<
	'checkout.expired',
	PaymentSessionData | SubscriptionSessionData
>;
/** `webhook.test`: the dashboard's test delivery ({@link WebhookTest}). */
export type WebhookTestEvent = EventEnvelope<'webhook.test', WebhookTest>;

/**
 * An event of a type this SDK does not know: answer it 2xx and ignore it; its `data` is kept raw.
 *
 * Its `type` is a string at run time, typed `never` so that `switch (event.type)` and
 * `event.type === '…'` narrow `Event` to the known types (a `string` member would keep every
 * `data` `unknown`). Tell it apart with `webhooks.isUnknownEvent(event)`, and read its type as
 * `String(event.type)`.
 */
export type UnknownEvent = EventEnvelope<never, unknown>;

/** An event of a type this SDK knows. */
export type KnownEvent =
	| PaymentCompletedEvent
	| SubscriptionCreatedEvent
	| SubscriptionBilledEvent
	| SubscriptionStatusChangedEvent
	| SubscriptionActionRequiredChangedEvent
	| SubscriptionBillingFailedEvent
	| SubscriptionUpcomingBillEvent
	| RefundRequestedEvent
	| RefundApprovedEvent
	| RefundRejectedEvent
	| MemberJoinedEvent
	| MemberRemovedEvent
	| HeldFundsReleasedEvent
	| CheckoutExpiredEvent
	| WebhookTestEvent;

/** A webhook event (a v2 delivery's body, or an event of the log), discriminated on `type`. */
export type Event = KnownEvent | UnknownEvent;

/** The event of a known type `T`. */
export type EventOf<T extends KnownEventType> = Extract<KnownEvent, { type: T }>;
