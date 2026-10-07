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
	TransferType,
	WebhookPayloadVersion,
} from '../enums.js';
import type { PaymentSessionData, SubscriptionSessionData } from './checkout.js';
import type { Currency, TxMetadata } from './common.js';
import type { LedgerEntry, Member } from './members.js';
import type { Bill, Payment } from './payments.js';
import type { Refund } from './refunds.js';
import type { Subscription } from './subscriptions.js';

/** `payment.completed`'s data: the payment, confirmed. */
export interface PaymentCompleted extends Payment {
	/** The payment's page for its customer. */
	managementPageLink?: string;
}

/** `subscription.created`'s data (status `active`, or `trial`). */
export interface SubscriptionCreated extends Subscription {
	/** The subscription's management page for its customer. */
	managementPageLink?: string;
}

/** `subscription.billed`'s data: the paid bill. */
export interface SubscriptionBilled extends Bill {
	/** The subscription's merchant reference, if it has one. */
	subscriptionReference?: string;
	/** The subscription's status once the bill is paid. */
	subscriptionStatus: SubscriptionStatus;
}

/** `subscription.statusChanged`'s data. */
export interface SubscriptionStatusChanged extends Subscription {
	/** The status before the change. */
	previousStatus: SubscriptionStatus;
	/** The subscription's management page for its customer. */
	managementPageLink?: string;
}

/** `subscription.actionRequiredChanged`'s data. */
export interface SubscriptionActionRequiredChanged extends Subscription {
	/** What its customer had to do before (absent: nothing). */
	previousActionRequired?: ActionRequired;
	/** The subscription's management page for its customer. */
	managementPageLink?: string;
}

/** `subscription.billingFailed`'s data: a bill attempt failed. */
export interface SubscriptionBillingFailed extends Subscription {
	/** `insufficientBalance`, `allowanceExhausted`, `approvalRevoked`, `maxAmountExceeded` or `other`. */
	reason: BillingFailureReason;
	/** The charge's error code (e.g. `insufficient_funds`). */
	failureCode?: string;
	/** The bill that failed (`sub-hist@…`: its id once paid). */
	billUuid: string;
	/** The bill, in USD (a decimal **string**, unlike `subscription.upcomingBill`'s). */
	amountUsd: string;
	/** This bill's failed attempts so far, this one included. */
	attempt: number;
	/** The attempts left. */
	remainingAttempts: number;
	/** When the bill is tried again at the latest. */
	nextAttemptAt?: string;
	/** The subscription's management page, where its customer fixes it. */
	managementPageLink?: string;
}

/** `subscription.upcomingBill`'s data: a bill (or a trial's end) is near. */
export interface SubscriptionUpcomingBill extends Subscription {
	/** When it is billed (for a trial: when the trial ends). */
	billingDate: string;
	/** The bill, in USD (a **number**, unlike `subscription.billingFailed`'s). */
	amountUsd: number;
	/** True when the trial ends then: the customer must confirm it to be billed. */
	trialEnding: boolean;
	/** Whether the wallet holds the bill; absent for a trial. */
	balanceSufficient?: boolean;
	/** Whether the remaining allowance covers the bill; absent for a trial. */
	allowanceSufficient?: boolean;
}

/** `member.joined`'s data: the member, and the invitation they accepted. */
export interface MemberJoined extends Member {
	/** The invitation they accepted (`invitations.create`'s). */
	invitationUuid: string;
}

/**
 * `heldFunds.released`'s data: the transfer paying a member the funds the organization held for
 * them, and the lines it settled.
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
	/** The amount, in USD. */
	amount: number;
	/** The amount in the token's min units (a decimal string). */
	amountMinUnits: string;
	/** The currency paid in. */
	currencyId: number;
	/** That currency. */
	currency: Currency | null;
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
	/** `heldFundsRelease`. */
	type: TransferType;
	/** The transaction's network fees and block. */
	txMetadata: TxMetadata;
	/** The held-funds lines it settled. */
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
	/** The payload version (`v2`). */
	version: WebhookPayloadVersion;
	/** When it happened. */
	createdAt: string;
	/** True when it happened in test mode. */
	test: boolean;
	/** The member whose space it happened in; absent for the organization's own. */
	userUuid?: string;
	/** The event's object. */
	data: D;
}

export type PaymentCompletedEvent = EventEnvelope<'payment.completed', PaymentCompleted>;
export type SubscriptionCreatedEvent = EventEnvelope<'subscription.created', SubscriptionCreated>;
export type SubscriptionBilledEvent = EventEnvelope<'subscription.billed', SubscriptionBilled>;
export type SubscriptionStatusChangedEvent = EventEnvelope<
	'subscription.statusChanged',
	SubscriptionStatusChanged
>;
export type SubscriptionActionRequiredChangedEvent = EventEnvelope<
	'subscription.actionRequiredChanged',
	SubscriptionActionRequiredChanged
>;
export type SubscriptionBillingFailedEvent = EventEnvelope<
	'subscription.billingFailed',
	SubscriptionBillingFailed
>;
export type SubscriptionUpcomingBillEvent = EventEnvelope<
	'subscription.upcomingBill',
	SubscriptionUpcomingBill
>;
/** `refund.requested`: a pending refund. */
export type RefundRequestedEvent = EventEnvelope<'refund.requested', Refund>;
/** `refund.completed`: an approved refund. */
export type RefundCompletedEvent = EventEnvelope<'refund.completed', Refund>;
/** `refund.denied`: a rejected refund. */
export type RefundDeniedEvent = EventEnvelope<'refund.denied', Refund>;
export type MemberJoinedEvent = EventEnvelope<'member.joined', MemberJoined>;
export type MemberRemovedEvent = EventEnvelope<'member.removed', Member>;
export type HeldFundsReleasedEvent = EventEnvelope<'heldFunds.released', HeldFundsReleased>;
/**
 * `checkout.expired`: the expired session, a payment's or a subscription's (chosen by its
 * `txType`; tell them apart with `webhooks.isSubscriptionSession`). An unknown `txType` decodes
 * as a payment's.
 */
export type CheckoutExpiredEvent = EventEnvelope<
	'checkout.expired',
	PaymentSessionData | SubscriptionSessionData
>;
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
	| RefundCompletedEvent
	| RefundDeniedEvent
	| MemberJoinedEvent
	| MemberRemovedEvent
	| HeldFundsReleasedEvent
	| CheckoutExpiredEvent
	| WebhookTestEvent;

/** A webhook event (a v2 delivery's body, or an event of the log), discriminated on `type`. */
export type Event = KnownEvent | UnknownEvent;

/** The event of a known type `T`. */
export type EventOf<T extends KnownEventType> = Extract<KnownEvent, { type: T }>;
