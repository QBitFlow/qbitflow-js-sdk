import { Currency } from './currency';

/**
 * Payment and transaction types
 */

/**
 * One-time payment information
 */
export interface Payment {
	/** Unique identifier for the payment */
	uuid: string;
	/** Timestamp when payment was created */
	createdAt: string;
	/** Sender address */
	from: string;
	/** Receiver address */
	to: string;
	/** Product name */
	name: string;
	/** Product description */
	description: string;
	/** Amount paid in USD */
	amount: number;
	/** Currency ID used for payment */
	currencyId: number;
	/** Currency details */
	currency: Currency;
	/** Whether this is a test payment */
	test: boolean;
	/** Product ID (if applicable) */
	productId?: number;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** Customer UUID */
	customerUUID: string;
}

/**
 * Combined payment information from one-time and subscription payments
 */
export interface CombinedPayment extends Payment {
	/** Source of the payment (e.g., "payment" or "subscription_history") */
	source: string;
	/** Subscription UUID (if this is a subscription payment) */
	subscriptionUUID?: string;
}
