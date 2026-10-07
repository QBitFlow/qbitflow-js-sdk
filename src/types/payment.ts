import { Currency } from './currency.js';
import { PaymentMetadata } from './common.js';

/**
 * A completed one-time payment.
 */
export interface Payment {
	/** Unique identifier for the payment, `pay@`-prefixed */
	uuid: string;
	/**
	 * Your own reference for the payment, set when the session was created; `null` when none
	 * was set. Use `oneTimePayments.getByReference()` to look the payment up by this value.
	 */
	reference: string | null;
	/** RFC3339 timestamp when the payment was created */
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
	/** Amount in the smallest units of the payment currency (e.g. satoshis for BTC), as a decimal string */
	amountMinUnits: string;
	/** ID of the currency used for the payment */
	currencyId: number;
	/** The currency used for the payment */
	currency: Currency;
	/** Whether this is a test payment */
	test: boolean;
	/** ID of the product paid for; `0` when the payment was not for a stored product */
	productId: number;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** UUID of the paying customer; `null` when no customer is attached */
	customerUUID: string | null;
	/** ID of the organization that owns this payment */
	organizationId: number;
	/** ID of the user that owns this payment; `0` for an organization-level payment */
	userId: number;
	/** Structured metadata attached to the payment (fee breakdown, on-chain details, amounts) */
	metadata: PaymentMetadata;
}

/**
 * Combined entry from one-time payments and subscription billing history
 */
export interface CombinedPayment {
	/**
	 * Where this entry originated. A value this SDK does not know yet arrives as its raw
	 * string.
	 */
	source: 'payment' | 'subscription_history' | (string & {});
	/** Unique identifier (`pay@…` or `sub-hist@…`) */
	uuid: string;
	/** RFC3339 timestamp when the payment was created */
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
	/** Amount in the smallest units of the payment currency, as a decimal string */
	amountMinUnits: string;
	/** Currency ID */
	currencyId: number;
	/** The currency used for the payment */
	currency: Currency;
	/** Product ID; `null` when the entry is not for a stored product */
	productId: number | null;
	/** Blockchain transaction hash */
	transactionHash: string;
	/** Customer UUID (the zero UUID when no customer is attached) */
	customerUUID: string;
	/** Parent subscription UUID (`sub@…`); `null` for a one-time payment */
	subscriptionUUID: string | null;
	/** Whether this is a test payment */
	test: boolean;
	/** Structured metadata attached to the payment; `null` when the API has none */
	metadata: PaymentMetadata | null;
}
