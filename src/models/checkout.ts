/**
 * Checkout sessions.
 *
 * @module
 */

import type { CheckoutSessionStatusValue, TransactionType } from '../enums.js';
import type { Attempt, Duration } from './common.js';

/** A created checkout session: send the customer to `link`. */
export interface CheckoutSession {
	/** The checkout page for the customer. */
	link: string;
	/** The session's id (`pay@…`, `sub@…`), also the id of the payment or subscription it creates. */
	uuid: string;
	/** When the checkout can no longer be paid (`checkout.expired` is sent then). */
	expiresAt?: string;
}

/** A checkout session's status. */
export interface CheckoutSessionStatus {
	/** The session's id (`pay@…`, `sub@…`). */
	uuid: string;
	/**
	 * `created` (waiting for the customer; with `lastAttempt`: their last attempt failed),
	 * `waitingConfirmation`, `completed` or `expired`.
	 */
	status: CheckoutSessionStatusValue;
	/** The customer's transaction, once sent (not kept for completed subscriptions). */
	txHash?: string;
	/** An optional detail, e.g. why the session expired. */
	message?: string;
	/** The customer's last failed attempt: never final, don't cancel the order on it. */
	lastAttempt?: Attempt;
}

/** A payment checkout session, as `checkout.expired` sends it. */
export interface PaymentSessionData {
	/** The session's id (`pay@…`, `sub@…`). */
	uuid: string;
	/** The merchant's reference, set when creating it. */
	reference?: string;
	/** The product, when it named one. */
	productUuid?: string;
	/** The product's reference, when it named it so. */
	productReference?: string;
	/** The product's name. */
	productName?: string;
	/** The product's description. */
	description?: string;
	/** The price in USD. */
	price?: number;
	/** Where the customer goes after paying (placeholders filled). */
	successUrl?: string;
	/** Where a customer who leaves the checkout goes. */
	cancelUrl?: string;
	/** The merchant's success page, on QBitFlow's own success page's copy. */
	redirectUrl?: string;
	/** The organization's name. */
	organizationName: string;
	/** The member who created it, for a member's session. */
	userName?: string;
	/** True in test mode. */
	test: boolean;
	/** `payment` or `createSubscription`. */
	txType: TransactionType;
	/** The currencies accepted for the payment. */
	availableCurrencyIds: number[];
	/** When the session was opened. */
	createdAt?: string;
	/** When it could no longer be paid. */
	expiresAt?: string;
}

/** A subscription checkout session, as `checkout.expired` sends it (`txType` `createSubscription`). */
export interface SubscriptionSessionData extends PaymentSessionData {
	/** How often it bills. */
	frequency: Duration;
	/** The free trial; absent without one. */
	trialPeriod?: Duration;
	/** The periods the customer commits to; absent without a minimum. */
	minPeriods?: number;
	/** True when it upgrades a trial. */
	upgradingFromTrial?: boolean;
}

/**
 * Opens a one-time payment checkout session (`checkoutSessions.createPayment`). Name the product
 * with exactly one of `productUuid`, `productReference`, or an inline product (`productName` +
 * `price`, `description` optional).
 */
export interface CreatePaymentSessionParams {
	/** Your reference for the payment (an order id): unique per space, 1 to 100 of `A-Z a-z 0-9 . _ : @ -`. */
	reference?: string;
	/** One of the space's products. */
	productUuid?: string;
	/** Names the product by its reference instead. */
	productReference?: string;
	/** An inline product's name (2 to 100 characters). */
	productName?: string;
	/** An inline product's description (2 to 500 characters), optional. */
	description?: string;
	/** An inline product's price in USD, above 0 (at most 5 in test mode). */
	price?: number;
	/**
	 * Where the customer goes after paying (`{{UUID}}`: the session's id; `{{TRANSACTION_TYPE}}`:
	 * `payment` or `createSubscription`).
	 */
	successUrl?: string;
	/** Where the customer goes after a cancelled or failed payment. */
	cancelUrl?: string;
	/** One of the space's customers. */
	customerUuid?: string;
	/** Your reference of the customer, kept on the payment. */
	customerReference?: string;
	/** The session's lifetime, 10 to 1440 minutes (0 or absent = the default). */
	expiresInMinutes?: number;
}

/**
 * Opens a subscription checkout session (`checkoutSessions.createSubscription`): the payment
 * session's fields, plus the terms, each optional over a subscription product's.
 */
export interface CreateSubscriptionSessionParams extends CreatePaymentSessionParams {
	/**
	 * How often it bills: at least 1 unit, at most 1 year (the API also requires at least 1 hour
	 * in live mode, 5 minutes in test mode). Optional over a subscription product's.
	 */
	frequency?: Duration;
	/** A free trial before the first bill (`{value: 0}`: none, removing a product's). */
	trialPeriod?: Duration;
	/** The periods the customer commits to before cancelling, at most 1000 (0: none). */
	minPeriods?: number;
}
