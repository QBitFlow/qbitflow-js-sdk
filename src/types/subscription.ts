import { Currency } from './currency';

/**
 * Subscription types and interfaces
 */

/**
 * Subscription status values. Enumeration of possible subscription states.
 */
export enum SubscriptionStatus {
	/** Subscription is active and billing normally */
	ACTIVE = 'active',

	/** Subscription has been cancelled (inactive) */
	CANCELLED = 'cancelled',

	/** Last payment attempt failed. Will be retried until grace period is over, and then switch to cancelled */
	PAST_DUE = 'past_due',

	/** Allowance amount is low, next billing may fail */
	LOW_ON_FUNDS = 'low_on_funds',

	/** Max amount has been reached, likely due to price fluctuations. User must increase it via the subscription management page */
	PENDING = 'pending',

	/** Currently in trial period */
	TRIAL = 'trial',

	/** Trial period has expired. Grace period to upgrade before flagged as cancelled */
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
	/** Blockchain subscription hash */
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
	/** Allowed charge amount in USD */
	allowance: number;
	/** Current status of the subscription */
	status: SubscriptionStatus;
	/** Whether the subscription is stopped */
	stopped: boolean;
	/** Timestamp of the last billing date */
	lastBillingDate?: string;
	/** Timestamp of the next billing date */
	nextBillingDate: string;
	/** Minimum cancellation date (if applicable) */
	minimumCancellationDate?: Date;

	/** Timestamp when subscription was created */
	createdAt: string;
	/** Timestamp when subscription was last updated */
	updatedAt: Date;
}

/**
 * Pay-as-you-go subscription information
 */
export interface PayAsYouGoSubscription extends Subscription {
	/** Usage units in current billing cycle */
	unitsCurrentPeriod: number;
	/** Maximum spending limit per billing cycle, in USD */
	maxSpendingPerPeriod: number;
	/** Free credits available */
	freeCredits: number;
}

/**
 * Represents a historical record of a subscription payment.
 *
 * This model contains all the details of a processed payment for a subscription.
 * @see {@link https://qbitflow.app/docs Subscription History API Documentation}
 */
export interface SubscriptionHistory {
	/** Unique identifier for the subscription history record */
	uuid: string;
	/** Timestamp when the record was created */
	createdAt: Date;
	/** Subscriber's address */
	from: string;
	/** Recipient's address (merchant's wallet for the selected currency) */
	to: string;
	/** Name of the product */
	name: string;
	/** Description of the product */
	description: string;
	/** Amount charged for the subscription */
	amount: number;

	/** Currency ID */
	currencyId: number;
	/** Currency used for the payment */
	currency: Currency;
	/** Indicates if this was a test transaction */
	test: boolean;
	/** Product ID */
	productId?: string;
	/** UUID of the subscription */
	subscriptionUUID: string;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** Customer UUID */
	customerUUID: string;
}
