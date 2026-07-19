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
	/** Approved charge amount (on-chain allowance, in USD) */
	allowance: number;
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
}

// Pay-as-you-go subscriptions are temporarily disabled.
// Will be re-enabled in a future release.
/*
export interface PayAsYouGoSubscription extends Subscription {
	unitsCurrentPeriod: number;
	maxSpendingPerPeriod: number;
	freeCredits: number;
}
*/

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
	/** Optional arbitrary metadata attached to the billing */
	metadata?: PaymentMetadata;
}

/**
 * Represents a subscription status transition webhook event.
 *
 * Contains information about a subscription status change,
 * including previous and current status and the update timestamp.
 */
export interface SubscriptionStatusTransitionWebhook {
	/** UUID of the subscription that changed status */
	subscriptionUUID: string;
	/** The previous subscription status */
	previousStatus: SubscriptionStatus;
	/** The current subscription status */
	currentStatus: SubscriptionStatus;
	/** Timestamp when the status transition occurred */
	updatedAt: string;
}


