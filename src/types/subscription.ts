import { PaymentMetadata } from './common.js';
import { Currency } from './currency.js';

/**
 * Subscription status values
 */
export enum SubscriptionStatus {
	/** Subscription is active and billing normally */
	ACTIVE = 'active',

	/** Subscription has been cancelled (inactive) */
	CANCELLED = 'cancelled',

	/** Last payment attempt failed; will retry until grace period ends then switch to cancelled */
	PAST_DUE = 'past_due',

	/** On-chain allowance is low; next billing may fail */
	LOW_ON_FUNDS = 'low_on_funds',

	/** Max amount reached (e.g. price fluctuation); subscriber must increase it via the management page */
	PENDING = 'pending',

	/** Currently in trial period */
	TRIAL = 'trial',

	/** Trial period has expired; grace period to upgrade before flagged as cancelled */
	TRIAL_EXPIRED = 'trial_expired',
}

/**
 * Regular subscription information
 */
export interface Subscription {
	/** Unique identifier for the subscription, `sub@`-prefixed */
	uuid: string;
	/**
	 * Your own reference for the subscription, set when the session was created; `null` when
	 * none was set. Use `subscriptions.getByReference()` to look the subscription up by it.
	 */
	reference: string | null;
	/** Subscriber's address */
	from: string;
	/** Recipient's address (merchant's wallet for the selected currency) */
	to: string;
	/** Product ID */
	productId: number;
	/** On-chain subscription hash */
	subscriptionHash: string;
	/** Selected currency ID */
	currencyId: number;
	/** The selected currency */
	currency: Currency;
	/** Whether it's a test subscription */
	test: boolean;
	/** Customer UUID; `null` when no customer is attached */
	customerUUID: string | null;
	/** Billing frequency in seconds */
	frequency: number;
	/** Approved charge amount (remaining on-chain allowance in USD, as a decimal string) */
	allowance: string;
	/**
	 * Current status of the subscription. A value this SDK does not know yet arrives as its
	 * raw string — treat it as "not active" rather than assuming a member.
	 */
	subscriptionStatus: SubscriptionStatus | (string & {});
	/** Whether the subscription is flagged for cancellation after the current period */
	stopped: boolean;
	/** RFC3339 timestamp of the last billing (Go's zero time `0001-01-01T00:00:00Z` if never billed) */
	lastBillingDate: string;
	/** RFC3339 timestamp of the next scheduled billing */
	nextBillingDate: string;
	/** Earliest date the subscription can be cancelled (set when minPeriods > 0); `null` otherwise */
	minimumCancellationDate: string | null;
	/** RFC3339 timestamp when the subscription was created */
	createdAt: string;
	/** RFC3339 timestamp when the subscription was last updated */
	updatedAt: string;
	/** ID of the organization that owns this subscription */
	organizationId: number;
	/** ID of the user that owns this subscription; `0` for organization-level */
	userId: number;
}

/**
 * A historical billing record for a subscription
 */
export interface SubscriptionHistory {
	/** Unique identifier for this history record, `sub-hist@`-prefixed */
	uuid: string;
	/** RFC3339 timestamp when the billing occurred */
	createdAt: string;
	/** Subscriber's address */
	from: string;
	/** Recipient's address */
	to: string;
	/** Product name */
	name: string;
	/** Product description */
	description: string;
	/** Amount charged in USD */
	amount: number;
	/** Amount in the smallest units of the payment currency, as a decimal string */
	amountMinUnits: string;
	/** Currency ID */
	currencyId: number;
	/** The currency charged */
	currency: Currency;
	/** Whether this was a test transaction */
	test: boolean;
	/** Product ID */
	productId: number;
	/** UUID of the parent subscription (`sub@…`) */
	subscriptionUUID: string;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** Customer UUID; `null` when no customer is attached */
	customerUUID: string | null;
	/** ID of the organization that owns this billing record */
	organizationId: number;
	/** ID of the user that owns this billing record; `0` for organization-level */
	userId: number;
	/** Structured metadata attached to the billing */
	metadata: PaymentMetadata;
}

/** Which payload a subscription webhook carries. */
export enum SubscriptionWebhookType {
	/** `data` is a {@link SubscriptionStatusTransition} */
	STATUS_TRANSITION = 'status_transition',
	/** `data` is a {@link SubscriptionHistory} */
	BILLING = 'billing',
}

/**
 * The `data` payload of a subscription webhook whose `type` is `status_transition`.
 */
export interface SubscriptionStatusTransition {
	/** The previous subscription status (raw string if unknown to this SDK) */
	previousStatus: SubscriptionStatus | (string & {});
	/** The current subscription status (raw string if unknown to this SDK) */
	currentStatus: SubscriptionStatus | (string & {});
	/** RFC3339 timestamp when the status transition occurred */
	updatedAt: string;
}

/** Fields carried on every subscription webhook, whatever the payload. */
export interface SubscriptionWebhookEnvelope {
	/** UUID of the subscription this delivery is about (`sub@…`) */
	subscriptionUUID: string;
	/**
	 * Your own reference for the subscription, set when the session was created (`''` if none
	 * was provided).
	 */
	subscriptionReference: string;
}

/** A subscription changed status. */
export interface SubscriptionStatusTransitionWebhook extends SubscriptionWebhookEnvelope {
	type: SubscriptionWebhookType.STATUS_TRANSITION;
	data: SubscriptionStatusTransition;
}

/** A subscription period was billed. */
export interface SubscriptionBillingWebhook extends SubscriptionWebhookEnvelope {
	type: SubscriptionWebhookType.BILLING;
	data: SubscriptionHistory;
}

/**
 * A subscription webhook whose `type` this SDK does not know yet. `data` is the raw JSON
 * payload, untouched.
 */
export interface UnknownSubscriptionWebhook extends SubscriptionWebhookEnvelope {
	/** The raw `type` string the API sent */
	type: string & {};
	/** The raw `data` JSON, untouched */
	data: unknown;
}

/**
 * The envelope QBitFlow POSTs to your subscription webhook URL. Decode a delivery with
 * `parseSubscriptionWebhook(body)`.
 *
 * The subscription identity lives on the envelope and the event-specific payload in
 * `data`, discriminated by `type`. Because a `type` this SDK does not know yet is kept as its
 * raw string (with `data` left untouched), narrow with the type guards
 * {@link isSubscriptionStatusTransitionWebhook} and {@link isSubscriptionBillingWebhook},
 * which narrow `data` too:
 *
 * ```typescript
 * const event = parseSubscriptionWebhook(req.body);
 *
 * if (isSubscriptionStatusTransitionWebhook(event)) {
 *   console.log(event.data.previousStatus, '->', event.data.currentStatus);
 * } else if (isSubscriptionBillingWebhook(event)) {
 *   console.log('billed', event.data.amount, 'for', event.subscriptionUUID);
 * } else {
 *   // A type this SDK does not know yet: event.type is the raw string, event.data raw JSON.
 * }
 * ```
 */
export type SubscriptionWebhook =
	| SubscriptionStatusTransitionWebhook
	| SubscriptionBillingWebhook
	| UnknownSubscriptionWebhook;

/** Narrow a {@link SubscriptionWebhook} to a status-transition delivery. */
export function isSubscriptionStatusTransitionWebhook(
	event: SubscriptionWebhook
): event is SubscriptionStatusTransitionWebhook {
	return event.type === SubscriptionWebhookType.STATUS_TRANSITION;
}

/** Narrow a {@link SubscriptionWebhook} to a billing (renewal) delivery. */
export function isSubscriptionBillingWebhook(
	event: SubscriptionWebhook
): event is SubscriptionBillingWebhook {
	return event.type === SubscriptionWebhookType.BILLING;
}
