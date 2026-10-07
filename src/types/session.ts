import { Duration } from './common.js';
import { TransactionStatus, TransactionType } from './status.js';

/**
 * A one-time payment checkout session (`TransactionData` on the server). The same fields are
 * the base of every session, whatever its type.
 *
 * Optional values the server leaves out arrive as their zero value (`''`, `0`), so every
 * field is always present.
 */
export interface OneTimePaymentSession {
	/** Session UUID — identifies the payment on-chain (`pay@…` / `sub@…`) */
	uuid: string;
	/**
	 * Your own reference for the transaction (e.g. an internal order or invoice ID), set when
	 * the session was created; `''` when none was set.
	 */
	reference: string;
	/** Product ID (`0` when the session was not created from a stored product) */
	productId: number;
	/** Your own product reference (`''` when the product was not selected by reference) */
	productReference: string;
	/** Product name */
	productName: string;
	/** Product description */
	description: string;
	/** Price in USD */
	price: number;
	/** URL to redirect the customer after a successful payment (`''` when not set) */
	successUrl: string;
	/** URL to redirect the customer after a cancelled or failed payment (`''` when not set) */
	cancelUrl: string;
	/** ID of the organization that created the session */
	organizationId: number;
	/** Organisation name (set by the server) */
	organizationName: string;
	/** QBitFlow platform fee in basis points */
	feeBps: number;
	/** Additional organisation-level fee in basis points (`0` when none) */
	organizationFeeBps: number;
	/** ID of the user who created the payment link (`0` for an organization-level session) */
	userId: number;
	/** Name of the user who created the payment link (`''` unless a user-role creator) */
	userName: string;
	/** Whether this is a test-mode session */
	test: boolean;
	/** Pre-filled customer UUID; `null` when the customer is collected during checkout */
	customerUUID: string | null;
	/** Your own customer reference, if the customer was pre-filled by reference (`''` otherwise) */
	customerReference: string;
	/**
	 * Transaction type for this session (set by the server). A one-time payment reports
	 * `TransactionType.ONE_TIME_PAYMENT` (`"payment"`); a subscription session reports
	 * `TransactionType.CREATE_SUBSCRIPTION` — not the short `subscription` form. A value
	 * this SDK does not know yet arrives as its raw string.
	 */
	txType: TransactionType | (string & {});
	/**
	 * Currency IDs accepted for this payment (empty, never null, when there are none). Resolve
	 * currency details via `client.currencies.getAllAvailable()`.
	 */
	availableCurrencies: number[];
}

/**
 * Session checkout for a recurring subscription (`SubscriptionData` on the server).
 */
export interface SubscriptionSession extends OneTimePaymentSession {
	/** Billing frequency in seconds (e.g. 2592000 = 30 days) */
	frequency: number;
	/** Trial period in seconds (`0` when there is no trial) */
	trialPeriod: number;
	/** Minimum number of billing periods the subscriber must complete (`0` when none) */
	minPeriods: number;
	/** Whether the subscription is upgrading from a trial */
	upgradingFromTrial: boolean;
}

/**
 * Any session checkout. Narrow with {@link isSubscriptionSession} / {@link isPaymentSession}.
 */
export type SessionCheckout = OneTimePaymentSession | SubscriptionSession;

/**
 * Narrow a {@link SessionCheckout} to a {@link SubscriptionSession}.
 *
 * True for `txType: "createSubscription"`, and for a `txType` this SDK does not know yet when
 * the session carries a billing `frequency`.
 */
export function isSubscriptionSession(session: SessionCheckout): session is SubscriptionSession {
	if (session.txType === TransactionType.CREATE_SUBSCRIPTION) {
		return true;
	}
	if (session.txType === TransactionType.ONE_TIME_PAYMENT) {
		return false;
	}
	const frequency = (session as Partial<SubscriptionSession>).frequency;
	return typeof frequency === 'number' && frequency > 0;
}

/**
 * Whether a {@link SessionCheckout} is a one-time payment session: `txType: "payment"`, or no
 * `txType` at all and no billing `frequency` (the rule every QBitFlow SDK applies).
 */
export function isPaymentSession(session: SessionCheckout): session is OneTimePaymentSession {
	if (session.txType === TransactionType.ONE_TIME_PAYMENT) {
		return true;
	}
	const frequency = (session as Partial<SubscriptionSession>).frequency;
	return session.txType === '' && !(typeof frequency === 'number' && frequency > 0);
}

/**
 * Data required to create a one-time payment session.
 * Either productId / productReference or (productName + description + price) must be provided.
 * Empty optional strings count as "not provided" and are left out of the request.
 */
export interface CreatePaymentSessionDto {
	/**
	 * Your own reference for the transaction (e.g. an internal order or invoice ID).
	 * Stored on the resulting payment so you can look it up later with
	 * `oneTimePayments.getByReference()` without persisting QBitFlow's UUID.
	 */
	reference?: string;
	/** Use an existing product by ID (a positive integer) */
	productId?: number;
	/** Use an existing product by your own reference (alternative to productId) */
	productReference?: string;
	/** Provide an inline product name (2–100 characters, no markup) */
	productName?: string;
	/** Provide an inline product description (2–500 characters, no markup) */
	description?: string;
	/** Price in USD (required with an inline product; must be greater than 0) */
	price?: number;
	/** Absolute http(s) URL to redirect the customer on successful payment */
	successUrl?: string;
	/** Absolute http(s) URL to redirect the customer on payment cancellation */
	cancelUrl?: string;
	/**
	 * Pre-fill the customer by UUID (a bare UUID, e.g. `01997c89-d0e9-7c9a-9886-fe7709919695`);
	 * the customer will be prompted if omitted.
	 */
	customerUUID?: string;
	/**
	 * Pre-fill the customer by your own reference (alternative to customerUUID).
	 * If no customer matches, a new customer entry is created during checkout.
	 */
	customerReference?: string;
}

/**
 * Data required to create a subscription session.
 * Either productId / productReference or (productName + description + price) must be provided.
 */
export interface CreateSubscriptionSessionDto extends CreatePaymentSessionDto {
	/** Billing frequency (e.g. { value: 1, unit: 'months' }) — required, value 1..4294967295 */
	frequency: Duration;
	/** Optional trial period before the first billing (value 0..4294967295) */
	trialPeriod?: Duration;
	/** Minimum number of billing periods the subscriber must complete (0..4294967295; 0 = none) */
	minPeriods?: number;
}

/**
 * Response containing the generated payment link
 */
export interface LinkResponse {
	/** Session UUID (`pay@…` for a payment, `sub@…` for a subscription) */
	uuid: string;
	/** Payment link to send to the customer */
	link: string;
}

/**
 * Transaction webhook payload (`WebhookCompletedTransaction` on the server), delivered when
 * a checkout session completes. Decode a delivery with `parseSessionWebhook(body)`.
 */
export interface SessionWebhookResponse {
	/** Session UUID */
	uuid: string;
	/** Current transaction status; `null` when the server has none to report */
	status: TransactionStatus | null;
	/** Full session data — a payment or a subscription session; see {@link isSubscriptionSession} */
	session: SessionCheckout;
	/**
	 * Type of the transaction. A value this SDK does not know yet arrives as its raw string.
	 */
	txType: TransactionType | (string & {});
	/** Link to the QBitFlow management page for this transaction (`''` when not available) */
	managementPageLink: string;
}
