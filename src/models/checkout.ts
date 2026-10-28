/**
 * Checkout sessions.
 *
 * @module
 */

import type { CheckoutSessionStatusValue, TransactionType } from '../enums.js';
import type { Attempt, Duration, FeeLine } from './common.js';

/**
 * A checkout session just opened (`checkoutSessions.createPayment`, `createSubscription`): the
 * page to send the customer to, its id, and how long it can be paid.
 */
export interface CreatedCheckoutSession {
	/** The checkout page for the customer: `<the merchant's checkout base URL>/checkout?uuid=<uuid>`. */
	link: string;
	/** The session's id (`pay@…`, `sub@…`), also the id of the payment or subscription it creates. */
	uuid: string;
	/** When the checkout can no longer be paid (`checkout.expired` is sent then, if it wasn't paid). */
	expiresAt: string;
}

/**
 * Where a checkout session stands, for the merchant that created it (`checkoutSessions.get` and
 * `expire`).
 */
export interface CheckoutSessionStatus {
	/** The session's id (`pay@…`, `sub@…`), also the id of the payment or subscription it creates. */
	uuid: string;
	/**
	 * `created` (waiting for the customer; with `lastAttempt`: their last attempt failed, they may
	 * try again until the session expires), `waitingConfirmation` (a transaction was sent), or the
	 * final `completed` and `expired`.
	 */
	status: CheckoutSessionStatusValue;
	/** The customer's transaction, once sent (not kept for completed subscriptions). */
	txHash?: string;
	/** An optional detail, e.g. why the session expired. */
	message?: string;
	/**
	 * The customer's last failed attempt (its code, reason and time): never final, don't cancel
	 * the order on it; wait for `completed` (`payment.completed`, `subscription.created`) or
	 * `expired` (`checkout.expired`).
	 */
	lastAttempt?: Attempt;
	/**
	 * When the checkout can no longer be paid, while it is open (on `expire`'s answer: when it was
	 * expired); absent once completed, or expired at its time.
	 */
	expiresAt?: string;
}

/**
 * A one-time payment's checkout session, as `checkout.expired` sends it (flat; a subscription's
 * is {@link SubscriptionSessionData}). No customer is named: match it on `uuid`, `reference` or
 * `metadata`.
 */
export interface PaymentSessionData {
	/** The session's id (`pay@…`, `sub@…`): the id the payment or subscription would have had. */
	uuid: string;
	/** The merchant's reference of the checkout (an order id), set when creating it. */
	reference?: string;
	/** The product paid for; absent for an inline product of a payment. */
	productUuid?: string;
	/** The product's reference, when the checkout named it so. */
	productReference?: string;
	/** What is paid for: the product's name as the checkout was opened (or the inline one). */
	productName?: string;
	/** The product's description as the checkout was opened; absent without one. */
	description?: string;
	/** The product's price in USD, a decimal string. */
	priceUsd: string;
	/**
	 * What the checkout adds to the price, line by line, in the order the checkout shows them: the
	 * merchant's lines, then the processing fee (when the customer pays it). A subscription's are
	 * charged with every bill. `[]` without any.
	 */
	fees: FeeLine[];
	/**
	 * What the customer pays in USD before the network fee, a decimal string: `priceUsd` plus
	 * every line of `fees` (the payment's `amountUsd`, or each bill's of a subscription).
	 */
	amountUsd: string;
	/** The merchant's page for the customer after paying (placeholders filled). */
	successUrl?: string;
	/** The merchant's page for a customer who leaves the checkout (placeholders filled). */
	cancelUrl?: string;
	/** True for a checkout paid on test networks. */
	test: boolean;
	/** The session's kind: `payment` or `createSubscription`. */
	txType: TransactionType;
	/** The merchant's own data on the checkout; `{}` without any. */
	metadata: Record<string, string>;
	/** When the session was opened. */
	createdAt?: string;
	/** When it could no longer be paid (when the merchant expired it, if so). */
	expiresAt?: string;
}

/**
 * A subscription's checkout session, as `checkout.expired` sends it (`txType`
 * `createSubscription`): the payment session's fields and its terms.
 */
export interface SubscriptionSessionData extends PaymentSessionData {
	/** How often it would have billed. */
	frequency: Duration;
	/** The free trial; absent without one. */
	trialPeriod?: Duration;
	/** The periods the customer would have committed to; absent without a minimum. */
	minPeriods?: number;
	/**
	 * True for a checkout confirming a free trial already started (always false in
	 * `checkout.expired`: such a session sends nothing when it expires).
	 */
	upgradingFromTrial: boolean;
}

/**
 * Opens a one-time payment checkout session (`checkoutSessions.createPayment`). Name the product
 * with exactly one of `productUuid`, `productReference`, or an inline product (`productName` +
 * `priceUsd`, `description` optional).
 */
export interface CreatePaymentSessionParams {
	/**
	 * Your reference for the payment (an order or invoice id), kept on it: unique per space (open
	 * sessions included), 1 to 100 of `A-Z a-z 0-9 . _ : @ -`, not `.` or `..`.
	 */
	reference?: string;
	/** One of the space's products (unknown: 404). */
	productUuid?: string;
	/** Names the product by its reference instead (unknown: 404). */
	productReference?: string;
	/**
	 * An inline product's name (2 to 100 characters, one line): the payment keeps it as a
	 * snapshot, without `productUuid`.
	 */
	productName?: string;
	/** An inline product's description (2 to 500 characters), optional. */
	description?: string;
	/**
	 * An inline product's price in USD, a decimal **string** (`"12.50"`): above 0, at most 2
	 * decimals, at most 1,000,000. The API caps it at `"5"` in test mode (`details.max` `"5"`).
	 */
	priceUsd?: string;
	/**
	 * Where the customer goes after paying, through QBitFlow's page for the payment
	 * (`Placeholders.UUID`: the session's id; `Placeholders.TRANSACTION_TYPE`: `payment` or
	 * `createSubscription`). Default: the space's `checkout.defaults` setting (set in the
	 * dashboard). https only in live mode. Reaching it is no proof of payment: fulfil on
	 * `payment.completed`.
	 *
	 * A member's own key may send it (and `cancelUrl`) while its organization's
	 * `members.checkoutRedirects` policy allows it (on by default). With the policy off, the call
	 * fails with a `PermissionDeniedError` (403 `policy_disabled`, `details.policy`
	 * `members.checkoutRedirects`, `details.field` naming the URL, `successUrl` first) and nothing
	 * is created. An organization key, acting `onBehalfOf` a member too, may always send both.
	 */
	successUrl?: string;
	/**
	 * Where the customer goes after a cancelled or failed payment (same placeholders). A member's
	 * own key may send it under the same policy as `successUrl`.
	 */
	cancelUrl?: string;
	/** One of the space's customers (unknown: 404); the checkout then asks the customer nothing. */
	customerUuid?: string;
	/**
	 * Your own reference of the customer, kept on the payment: the space's customer with this
	 * reference is linked if there is one (none is created). The checkout then asks the customer
	 * nothing.
	 */
	customerReference?: string;
	/**
	 * How long the checkout can be paid, 10 to 1440 minutes (0 or absent = the default lifetime;
	 * never longer than it).
	 */
	expiresInMinutes?: number;
	/**
	 * Your own data on the checkout (an order id, a CRM key): at most 50 keys of 1 to 40
	 * characters among `A-Z a-z 0-9 _ - . :`, values of at most 500 characters without control or
	 * bidirectional characters (`''` values are dropped). Copied onto the payment and into its
	 * webhooks (`payment.completed`, `checkout.expired`); never shown to the customer. Never put
	 * secrets or personal data in it.
	 */
	metadata?: Record<string, string>;
	/**
	 * Adds amounts to the price (a tax, shipping, QBitFlow's processing fee), shown to the
	 * customer line by line and paid with it; absent for none. The session's and the payment's
	 * `amountUsd` is the price plus every line, and QBitFlow's fee is taken on it. The test-mode
	 * cap (`"5"`) applies to that amount, fees included (400 `validation_failed` on `fees`).
	 */
	fees?: CheckoutFees;
}

/**
 * What a checkout adds to its price: a one-time payment's (`CreatePaymentSessionParams.fees`), or
 * a subscription's (`CreateSubscriptionSessionParams.fees`, each of its bills then charging the
 * price and the same lines). The customer sees your lines in this order, then the processing fee,
 * and pays them with the price; the network fee still comes on top of the total.
 */
export interface CheckoutFees {
	/**
	 * `true` has the customer pay QBitFlow's processing fee on top: a last line `{type:
	 * 'processingFee', label: 'Processing fee'}`, computed by QBitFlow on the price and your lines
	 * at your platform fee p (never below 0.5 %) as `base × p / (1 − p)`, rounded up to the cent.
	 * QBitFlow's fee is also taken on that line, so this gross-up leaves you at least the price
	 * and your lines, as if no fee were taken ($100 + $20 VAT at 0.99 % → a $1.20 fee, $121.20
	 * charged, $120.00 kept). A marketplace's organization fee is not passed on. Absent: the
	 * space's `checkout.customerPaysProcessingFee` setting decides (off by default; set by the
	 * organization's team in the dashboard, a member can't change it); `false` turns it off for
	 * this checkout.
	 */
	processingFee?: boolean;
	/** Up to 10 lines of your own, shown in this order before the processing fee. */
	items?: FeeItem[];
}

/** A line of the merchant's own on a checkout (`CheckoutFees.items`). */
export interface FeeItem {
	/**
	 * The line's name, as the checkout shows it: one line, 1 to 40 characters (`VAT (20%)`,
	 * `Shipping`), a name as for products (no markup characters).
	 */
	label: string;
	/** More about the line, at most 200 characters; optional. */
	description?: string;
	/**
	 * The line's amount in USD, a decimal **string** (`"4.99"`): above 0, at most 1,000,000, with
	 * at most 2 decimals.
	 */
	amountUsd: string;
}

/**
 * Opens a subscription checkout session (`checkoutSessions.createSubscription`): the payment
 * session's fields, plus the terms, each optional over a subscription product's (the merged terms
 * are validated as a product's are; without a product's terms, `frequency` is required).
 */
export interface CreateSubscriptionSessionParams extends CreatePaymentSessionParams {
	/**
	 * An inline product's price per period in USD, a decimal **string**: above 0, at most 2
	 * decimals, at most 1,000,000. The API caps it at `"5"` in test mode and requires more than
	 * `"0.25"` for a live subscription (inline or its product's; `details.min`). An inline product
	 * becomes a hidden product, shared by the space's inline products of the same name,
	 * description and price.
	 */
	priceUsd?: string;
	/**
	 * Your own data on the checkout, copied onto the subscription (then changed with
	 * `subscriptions.update`) and into its webhooks; the rules of
	 * `CreatePaymentSessionParams.metadata`.
	 */
	metadata?: Record<string, string>;
	/**
	 * Adds amounts to the price (a tax, shipping, QBitFlow's processing fee), shown to the
	 * customer line by line and locked with the price: every bill (the first one, at creation,
	 * and each next one) charges the price plus every line; absent for none. The subscription
	 * keeps them as `Subscription.fees`, its `priceUsd` staying the price. The maximum per period
	 * and the allowance the subscriber signs are sized on that amount, and QBitFlow's fee is taken
	 * on it. The test-mode cap (`"5"`) applies to that amount, fees included (400
	 * `validation_failed` on `fees`).
	 */
	fees?: CheckoutFees;
	/**
	 * How often it bills: at least 1 unit, at most 1 year (the API also requires at least 1 hour
	 * in live mode, 5 minutes in test mode). Optional over a subscription product's.
	 */
	frequency?: Duration;
	/** A free trial before the first bill (`{value: 0}`: none, removing a product's). */
	trialPeriod?: Duration;
	/** The periods the customer commits to before cancelling, at most 1000 (0: none, removing a product's). */
	minPeriods?: number;
}
