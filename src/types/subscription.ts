import { PaymentMetadata } from './common';
import { Currency } from './currency';

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
	/** Unique identifier for the subscription */
	uuid: string;
	/**
	 * Your own reference for the subscription, set when the session was created.
	 * Use `subscriptions.getByReference()` to look the subscription up by this value.
	 */
	reference?: string;
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
	/** Currency used for payments */
	currency: Currency;
	/** Whether it's a test subscription */
	test: boolean;
	/** Customer UUID */
	customerUUID: string;
	/** Billing frequency in seconds */
	frequency: number;
	/** Approved charge amount (remaining on-chain allowance in USD, as a decimal string) */
	allowance: string;
	/** Current status of the subscription */
	subscriptionStatus: SubscriptionStatus;
	/** Whether the subscription is flagged for cancellation after the current period */
	stopped: boolean;
	/** Timestamp of the last billing date (null if never billed) */
	lastBillingDate?: string;
	/** Timestamp of the next scheduled billing */
	nextBillingDate: string;
	/** Earliest date the subscription can be cancelled (set when minPeriods > 0) */
	minimumCancellationDate?: string;
	/** Timestamp when the subscription was created */
	createdAt: string;
	/** Timestamp when the subscription was last updated */
	updatedAt: string;
	/** ID of the organization that owns this subscription (authenticated only) */
	organizationId?: number;
	/** ID of the user that owns this subscription (authenticated only) */
	userId?: number;
}

/**
 * A historical billing record for a subscription
 */
export interface SubscriptionHistory {
	/** Unique identifier for this history record */
	uuid: string;
	/** Timestamp when the billing occurred */
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
	/** Amount in the smallest units of the payment currency */
	amountMinUnits: string;
	/** Currency ID */
	currencyId: number;
	/** Currency used for the payment */
	currency: Currency;
	/** Whether this was a test transaction */
	test: boolean;
	/** Product ID (if applicable) */
	productId?: number;
	/** UUID of the parent subscription */
	subscriptionUUID: string;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** Customer UUID */
	customerUUID: string;
	/** ID of the organization that owns this billing record (authenticated only) */
	organizationId?: number;
	/** ID of the user that owns this billing record (authenticated only) */
	userId?: number;
	/** Structured metadata attached to the billing (authenticated only) */
	metadata?: PaymentMetadata;
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
	/** The previous subscription status */
	previousStatus: SubscriptionStatus;
	/** The current subscription status */
	currentStatus: SubscriptionStatus;
	/** Timestamp when the status transition occurred */
	updatedAt: string;
}

/** Fields carried on every subscription webhook, whatever the payload. */
interface SubscriptionWebhookEnvelope {
	/** UUID of the subscription this delivery is about */
	subscriptionUUID: string;
	/**
	 * Your own reference for the subscription, set when the session was created
	 * (omitted if none was provided).
	 */
	subscriptionReference?: string;
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
 * The envelope QBitFlow POSTs to your subscription webhook URL.
 *
 * The subscription identity lives on the envelope and the event-specific payload in
 * `data`, discriminated by `type` — so narrowing on `type` narrows `data` too:
 *
 * ```typescript
 * const event = req.body as SubscriptionWebhook;
 *
 * if (event.type === SubscriptionWebhookType.STATUS_TRANSITION) {
 *   console.log(event.data.previousStatus, '->', event.data.currentStatus);
 * } else {
 *   console.log('billed', event.data.amount, 'for', event.subscriptionUUID);
 * }
 * ```
 */
export type SubscriptionWebhook = SubscriptionStatusTransitionWebhook | SubscriptionBillingWebhook;


