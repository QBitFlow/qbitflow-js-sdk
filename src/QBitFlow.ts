import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT } from './config.js';
import {
	AccountingRequests,
	ApiKeyRequests,
	ClaimRequests,
	CurrencyRequests,
	CustomerRequests,
	PaymentRequests,
	ProductRequests,
	RefundRequests,
	SubscriptionRequests,
	TransactionStatusRequests,
	UserRequests,
	WebhookRequests,
} from './requests/index.js';
import { normalizeBaseUrl, onBehalfOfHeaders } from './requests/Request.js';
import { Transport } from './requests/Transport.js';
import { QBitFlowConfig } from './types/index.js';

/** Module-private key used by {@link QBitFlow.onBehalfOf} to build a scoped copy. */
const SCOPED = Symbol('qbitflow.scoped');

/** What a scoped copy shares with its parent client. */
interface ScopedInit {
	readonly [SCOPED]: {
		readonly transport: Transport;
		readonly headers: Readonly<Record<string, string>>;
	};
}

const isScopedInit = (value: unknown): value is ScopedInit =>
	typeof value === 'object' && value !== null && SCOPED in value;

/**
 * Main QBitFlow SDK client
 *
 * @example
 * ```typescript
 * import { QBitFlow } from 'qbitflow';
 *
 * const client = new QBitFlow(process.env.QBITFLOW_API_KEY!);
 *
 * // Create a one-time payment
 * const payment = await client.oneTimePayments.createSession({
 *   productId: 1,
 *   successUrl: 'https://shop.example.com/thanks',
 * });
 *
 * // Create a subscription
 * const sub = await client.subscriptions.createSession({
 *   productId: 1,
 *   frequency: { value: 1, unit: 'months' },
 * });
 * ```
 */
export class QBitFlow {
	private readonly transport: Transport;

	/** Customer-related operations */
	public readonly customers: CustomerRequests;

	/** Product-related operations */
	public readonly products: ProductRequests;

	/** User-related operations */
	public readonly users: UserRequests;

	/** API key management operations */
	public readonly apiKeys: ApiKeyRequests;

	/** Webhook-related operations */
	public readonly webhooks: WebhookRequests;

	/** One-time payment operations */
	public readonly oneTimePayments: PaymentRequests;

	/** Subscription payment operations */
	public readonly subscriptions: SubscriptionRequests;

	/** Transaction status operations */
	public readonly transactionStatus: TransactionStatusRequests;

	/** Refund operations */
	public readonly refunds: RefundRequests;

	/** Accounting export operations */
	public readonly accounting: AccountingRequests;

	/** Account claim operations */
	public readonly claims: ClaimRequests;

	/** Supported-currency lookups (public endpoints) */
	public readonly currencies: CurrencyRequests;

	/**
	 * Create a new QBitFlow client instance
	 * @param apiKeyOrConfig - API key string or configuration object
	 * @throws {Error} When the API key is missing or blank, the base URL is not an absolute
	 *   http(s) URL, or `timeout` / `maxRetries` are invalid
	 *
	 * @example
	 * ```typescript
	 * // Simple initialization
	 * const client = new QBitFlow('your-api-key');
	 *
	 * // With custom configuration
	 * const client = new QBitFlow({
	 *   apiKey: 'your-api-key',
	 *   timeout: 30000,
	 *   maxRetries: 0, // disable retries
	 * });
	 * ```
	 */
	constructor(apiKeyOrConfig: string | QBitFlowConfig) {
		let headers: Readonly<Record<string, string>> = {};

		if (isScopedInit(apiKeyOrConfig)) {
			this.transport = apiKeyOrConfig[SCOPED].transport;
			headers = apiKeyOrConfig[SCOPED].headers;
		} else {
			this.transport = new Transport(QBitFlow.resolveSettings(apiKeyOrConfig));
		}

		const transport = this.transport;
		this.customers = new CustomerRequests(transport, headers);
		this.products = new ProductRequests(transport, headers);
		this.users = new UserRequests(transport, headers);
		this.apiKeys = new ApiKeyRequests(transport, headers);
		this.webhooks = new WebhookRequests(transport, headers);
		this.oneTimePayments = new PaymentRequests(transport, headers);
		this.subscriptions = new SubscriptionRequests(transport, headers);
		this.transactionStatus = new TransactionStatusRequests(transport, headers);
		this.refunds = new RefundRequests(transport, headers);
		this.accounting = new AccountingRequests(transport, headers);
		this.claims = new ClaimRequests(transport, headers);
		this.currencies = new CurrencyRequests(transport, headers);
	}

	/** Validate the constructor argument and resolve the defaults. */
	private static resolveSettings(apiKeyOrConfig: string | QBitFlowConfig) {
		const config: QBitFlowConfig =
			typeof apiKeyOrConfig === 'string' ? { apiKey: apiKeyOrConfig } : apiKeyOrConfig;

		if (typeof config?.apiKey !== 'string' || config.apiKey.trim() === '') {
			throw new Error('API key is required');
		}

		const baseUrl = normalizeBaseUrl(config.baseUrl);
		let parsed: URL | undefined;
		try {
			parsed = new URL(baseUrl);
		} catch {
			parsed = undefined;
		}
		if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
			throw new Error('baseUrl must be an absolute http:// or https:// URL');
		}

		// `??`, not `||`: an explicit 0 must be honoured (0 retries disables retrying).
		const timeout = config.timeout ?? DEFAULT_TIMEOUT;
		const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

		if (!Number.isInteger(maxRetries) || maxRetries < 0) {
			throw new Error('maxRetries must be a non-negative integer');
		}
		if (!Number.isFinite(timeout) || timeout < 0) {
			throw new Error('timeout must be a non-negative number of milliseconds');
		}

		return { apiKey: config.apiKey, baseUrl, timeout, maxRetries };
	}

	/**
	 * Act on behalf of a specific user of your organization for every service at once.
	 *
	 * Returns a client whose every request carries `On-Behalf-Of: <userId>`, sharing this
	 * client's transport and configuration. This client is left untouched, so org-level and
	 * per-user calls can be mixed freely. Requires an organization-level admin/owner API key.
	 * `0` means "act at the organization level" (no header). A service of the returned client
	 * can still be re-scoped with its own `onBehalfOf()`.
	 *
	 * @param userId - ID of the user to act for, or 0 for the organization level
	 * @returns A client scoped to that user
	 * @throws {ValidationException} When `userId` is not a non-negative safe integer
	 *
	 * @example
	 * ```typescript
	 * const asUser = client.onBehalfOf(123);
	 * const products = await asUser.products.getAll();
	 * const payments = await asUser.oneTimePayments.getAll();
	 * ```
	 */
	onBehalfOf(userId: number): QBitFlow {
		const headers = onBehalfOfHeaders(userId);
		const init: ScopedInit = { [SCOPED]: { transport: this.transport, headers } };
		return new QBitFlow(init as unknown as QBitFlowConfig);
	}

	/**
	 * Get the current API key
	 * @returns Current API key
	 */
	getApiKey(): string {
		return this.transport.apiKey;
	}

	/**
	 * Get the current base URL (trailing slash removed)
	 * @returns Current base URL
	 */
	getBaseUrl(): string {
		return this.transport.baseUrl;
	}
}
