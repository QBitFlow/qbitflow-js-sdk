/**
 * Checkout sessions.
 *
 * @module
 */

import type { CheckoutSessionStatusValue, TransactionType } from '../enums.js';
import type { Attempt, Duration } from './common.js';
import type { FeeLine } from './payments.js';

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
	/** The product's price in USD. */
	price?: number;
	/**
	 * A payment checkout's fees, in the order the checkout shows them: the merchant's lines, then
	 * the processing fee when the customer pays it. `[]` without any (always, on a subscription
	 * session).
	 */
	fees: FeeLine[];
	/**
	 * What the customer pays in USD before the network fee: the price plus every line of `fees`
	 * (the payment's `amount`). The network fee comes on top, once the customer picks a currency.
	 * Absent on a subscription session.
	 */
	amount?: number;
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
	/**
	 * Amounts the customer pays on top of the price (a tax, shipping, QBitFlow's processing fee),
	 * shown line by line on the checkout. The session's and the payment's `amount` is the price
	 * plus every line, and QBitFlow's fee is taken on that amount. In test mode the amount, fees
	 * included, is at most $5. Omitted: no lines of your own, and the processing fee follows your
	 * `checkout.customerPaysProcessingFee` setting.
	 */
	fees?: CheckoutFees;
}

/**
 * What a payment checkout adds to its price (`CreatePaymentSessionParams.fees`). The customer
 * sees your lines in this order, then the processing fee, and pays them with the price; the
 * network fee still comes on top of the total.
 */
export interface CheckoutFees {
	/**
	 * `true`: the customer pays QBitFlow's processing fee, a last line `Processing fee` computed
	 * on the price and your lines at your platform fee, grossed up (the fee is also taken on the
	 * line itself) and rounded up to the cent, so you keep at least the price and your lines, as
	 * if no fee were taken ($100 + $20 VAT at 1.5 % → a $1.83 processing fee, $121.83 charged,
	 * $120.00 kept). `false`: you pay it, as without fees. Omitted: your
	 * `checkout.customerPaysProcessingFee` setting decides (set in the dashboard; off by default).
	 */
	processingFee?: boolean;
	/** Up to 10 lines of your own, shown in this order before the processing fee. */
	items?: FeeItem[];
}

/** A line of your own on a payment checkout (`CheckoutFees.items`). */
export interface FeeItem {
	/**
	 * The line's name, as the checkout shows it (`VAT (20%)`, `Shipping`): 1 to 40 characters on
	 * one line, a name as for products (no markup characters).
	 */
	label: string;
	/** More about the line (at most 200 characters, free text as a description), optional. */
	description?: string;
	/**
	 * The line's amount in USD: above 0, at most 1,000,000, with at most 2 decimals. A number is
	 * sent as a JSON number, a string (`"4.99"`, digits and an optional decimal point only) as
	 * typed, so no float rounds it.
	 */
	amountUsd: number | string;
}

/**
 * Opens a subscription checkout session (`checkoutSessions.createSubscription`): the payment
 * session's fields (but `fees`: a subscription checkout takes none), plus the terms, each optional
 * over a subscription product's.
 */
export interface CreateSubscriptionSessionParams extends Omit<CreatePaymentSessionParams, 'fees'> {
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
