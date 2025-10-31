import { Duration } from './common';
import { Currency } from './currency';
import { TransactionStatus } from './status';

/**
 * Session and payment creation types
 */

/**
 * Subscription options for a session
 */
export interface SubscriptionOptions {
	/** Frequency in seconds */
	frequency: number;
	/** Type of subscription */
	subscriptionType: 'subscription' | 'payAsYouGo';
	/** Trial period in seconds (optional) */
	trialPeriod?: number;
	/** Free credits amount (optional) */
	freeCredits?: number;
	/** Minimum number of billing periods (optional) */
	minPeriods?: number;
}

/**
 * Complete session information
 */
export interface Session {
	/** Unique identifier for the session */
	uuid: string;
	/** Product ID (if using an existing product) */
	productId?: number;
	/** Name of the product */
	productName: string;
	/** Description of the product */
	description: string;
	/** Price in USD */
	price: number;
	/** Organization name */
	organizationName: string;
	/** URL to redirect on success */
	successUrl?: string;
	/** URL to redirect on cancellation */
	cancelUrl?: string;
	/** Customer UUID */
	customerUUID: string;
	/** Subscription options (for subscription sessions) */
	options?: SubscriptionOptions;
	/** Available cryptocurrencies for payment (currencies supported by the merchant) */
	availableCurrencies: Currency[];
}

/**
 * Subscription type for creating sessions
 */
export type SubscriptionType = 'subscription' | 'payAsYouGo';

/**
 * Subscription options when creating a session
 */
export interface CreateSubscriptionOptions {
	/** Type of subscription */
	subscriptionType: SubscriptionType;
	/** Billing frequency */
	frequency: Duration;
	/** Trial period duration (optional) */
	trialPeriod?: Duration;
	/** Free credits amount (optional) */
	freeCredits?: number;
	/** Minimum number of billing periods (optional) */
	minPeriods?: number;
}

/**
 * Data required to create a new payment session
 */
export interface CreateSessionDto {
	/** Product ID (required if not providing product details) */
	productId?: number;
	/** Product name (required if not providing productId) */
	productName?: string;
	/** Product description (required if not providing productId) */
	description?: string;
	/** Price in USD (required if not providing productId) */
	price?: number;
	/** URL to redirect on successful payment */
	successUrl?: string;
	/** URL to redirect on payment cancellation */
	cancelUrl?: string;
	/** Webhook URL for payment notifications */
	webhookUrl?: string;
	/** Customer UUID (optional, customer will be prompted if not provided) */
	customerUUID?: string;
	/** Subscription options (for subscription sessions) */
	options?: CreateSubscriptionOptions;
}

/**
 * Response containing a payment link
 */
export interface LinkResponse {
	/** Session UUID */
	uuid: string;
	/** Payment link for the customer */
	link: string;
	/** Unix timestamp when the link expires (optional) */
	expiresAt?: number;
}

export interface StatusLinkResponse {
	/** Status message */
	message: string;
	/** Link to check the status of the transaction (websocket) */
	statusLink: string;
}

/**
 * Webhook payload sent when a session status changes
 */
export interface SessionWebhookResponse {
	/** Session UUID */
	uuid: string;
	/** Current transaction status */
	status: TransactionStatus;
	/** Complete session information */
	session: Session;
}
