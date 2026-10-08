import { Duration } from './common';
import { TransactionStatus, TransactionType } from './status';

/**
 * Base fields present on every session checkout, regardless of type.
 * Mirrors TransactionData on the server.
 */
export interface OneTimePaymentSession {
	/** Session UUID — identifies the payment on-chain */
	uuid: string;
	/**
	 * Your own reference for the transaction (e.g. an internal order or invoice ID),
	 * set when the session was created. Lets you link the transaction back to your system
	 * without storing QBitFlow's UUID.
	 */
	reference?: string;
	/** Product ID (if the session was created from an existing product) */
	productId?: number;
	/** Your own product reference (if the session was created from a product by reference) */
	productReference?: string;
	/** Product name */
	productName?: string;
	/** Product description */
	description?: string;
	/** Price in USD */
	price?: number;
	/** URL to redirect the customer after a successful payment */
	successUrl?: string;
	/** URL to redirect the customer after a cancelled or failed payment */
	cancelUrl?: string;
	/** Organisation name (set by the server) */
	organizationName: string;
	/**
	 * Transaction type for this session (set by the server). A one-time payment reports
	 * `TransactionType.PAYMENT`; a subscription session reports
	 * `TransactionType.CREATE_SUBSCRIPTION` — not the short `subscription` form.
	 */
	txType?: TransactionType;
	/** Whether this is a test-mode session */
	test: boolean;
	/**
	 * Currency IDs accepted for this payment. Resolve currency details via the
	 * `currencies` service (`client.currencies.getAllAvailable()`).
	 */
	availableCurrencies: number[];

	// Authenticated only — omitted on the public checkout page.

	/** Organisation ID (authenticated only) */
	organizationId?: number;
	/** QBitFlow platform fee in basis points (authenticated only) */
	feeBps?: number;
	/** Additional organisation-level fee in basis points (authenticated only) */
	organizationFeeBps?: number;
	/** ID of the user who created the payment link (authenticated only) */
	userId?: number;
	/** Name of the user who created the payment link (authenticated only) */
	userName?: string;
	/** Pre-filled customer UUID (authenticated only) */
	customerUUID?: string;
	/** Your own customer reference, if the customer was pre-filled by reference (authenticated only) */
	customerReference?: string;
}

/**
 * Session checkout for a recurring subscription.
 * Mirrors SubscriptionData on the server (extends TransactionData).
 */
export interface SubscriptionSession extends OneTimePaymentSession {
	/** Billing frequency in seconds (e.g. 2592000 = 30 days) */
	frequency: number;
	/** Trial period in seconds (0 / omitted if no trial) */
	trialPeriod?: number;
	/** Minimum number of billing periods the subscriber must complete */
	minPeriods?: number;
}

/**
 * Discriminated union of all possible session checkout shapes.
 * Use `instanceof`-style narrowing on the presence of `frequency`
 * to determine which variant you have.
 */
export type SessionCheckout = OneTimePaymentSession | SubscriptionSession;

/**
 * Data required to create a one-time payment session.
 * Either productId or (productName + description + price) must be provided.
 */
export interface CreatePaymentSessionDto {
	/**
	 * Your own reference for the transaction (e.g. an internal order or invoice ID).
	 * Stored on the resulting payment so you can look it up later with
	 * `oneTimePayments.getByReference()` without persisting QBitFlow's UUID.
	 */
	reference?: string;
	/** Use an existing product by ID */
	productId?: number;
	/** Use an existing product by your own reference (alternative to productId) */
	productReference?: string;
	/** Provide an inline product name */
	productName?: string;
	/** Provide an inline product description */
	description?: string;
	/** Price in USD (required when not using productId) */
	price?: number;
	/** URL to redirect the customer on successful payment */
	successUrl?: string;
	/** URL to redirect the customer on payment cancellation */
	cancelUrl?: string;
	/** Pre-fill the customer by UUID; the customer will be prompted if omitted */
	customerUUID?: string;
	/**
	 * Pre-fill the customer by your own reference (alternative to customerUUID).
	 * If no customer matches, a new customer entry is created during checkout.
	 */
	customerReference?: string;
}

/**
 * Data required to create a subscription session.
 * Either productId or (productName + description + price) must be provided.
 */
export interface CreateSubscriptionSessionDto extends CreatePaymentSessionDto {
	/** Billing frequency (e.g. { value: 1, unit: 'months' }) — required */
	frequency: Duration;
	/** Optional trial period before the first billing */
	trialPeriod?: Duration;
	/** Minimum number of billing periods the subscriber must complete */
	minPeriods?: number;
}

/**
 * Response containing the generated payment link
 */
export interface LinkResponse {
	/** Session UUID */
	uuid: string;
	/** Payment link to send to the customer */
	link: string;
}

export interface StatusLinkResponse {
	/** Status message */
	message: string;
	/** Link to the transaction status WebSocket */
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
	/** Full session data — may be a payment or a subscription session */
	session: SessionCheckout;
	/** Type of the transaction */
	txType: TransactionType;
	/** Link to the QBitFlow management page for this transaction */
	managementPageLink: string;
}
