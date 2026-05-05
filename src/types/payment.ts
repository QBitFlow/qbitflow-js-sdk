import { Currency } from './currency';
import { PaymentMetadata } from './common';

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
	/** Amount in the smallest units of the payment currency (e.g. satoshis for BTC) */
	amountMinUnits: string;
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
	/** Optional arbitrary metadata attached to the payment */
	metadata?: PaymentMetadata;
}

/**
 * Combined entry from one-time payments and subscription billing history
 */
export interface CombinedPayment {
	/** Where this entry originated */
	source: 'payment' | 'subscription_history';
	/** Unique identifier */
	uuid: string;
	/** Timestamp when the payment was created */
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
	/** Amount in the smallest units of the payment currency */
	amountMinUnits: string;
	/** Currency ID */
	currencyId: number;
	/** Currency details */
	currency: Currency;
	/** Product ID (if applicable, may be null) */
	productId?: number | null;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** Customer UUID */
	customerUUID: string;
	/** Subscription UUID (only present for subscription_history entries) */
	subscriptionUUID?: string;
	/** Whether this is a test payment */
	test: boolean;
	/** Optional arbitrary metadata */
	metadata?: PaymentMetadata;
}
