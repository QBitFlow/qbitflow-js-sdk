import { QBitFlowConfig } from './types';
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES } from './config';
import {
	PaymentRequests,
	SubscriptionRequests,
	PayAsYouGoRequests,
	TransactionStatusRequests,
} from './requests';
import { CustomerRequests } from './requests/CustomerRequests';
import { ProductRequests } from './requests/ProductRequests';
import { UserRequests } from './requests/UserRequests';
import { ApiKeyRequests } from './requests/ApiKeyRequests';

/**
 * Main QBitFlow SDK client
 *
 * @example
 * ```typescript
 * import { QBitFlow } from 'qbitflow-sdk';
 *
 * const client = new QBitFlow('<your-api-key>');
 *
 * // Create a payment
 * const payment = await client.oneTimePayments.createSession({
 *   productId: 1,
 *   customerUUID: 'customer-uuid',
 *   webhookUrl: 'https://example.com/webhook'
 * });
 * ```
 */
export class QBitFlow {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly maxRetries: number;

	/** Customer-related operations */
	public readonly customers: CustomerRequests;

	/** Product-related operations */
	public readonly products: ProductRequests;

	/** User-related operations */
	public readonly users: UserRequests;

	/** API key management operations */
	public readonly apiKeys: ApiKeyRequests;

	/**
	 * One-time payment operations
	 */
	public readonly oneTimePayments: PaymentRequests;

	/**
	 * Subscription payment operations
	 */
	public readonly subscriptions: SubscriptionRequests;

	/**
	 * Pay-as-you-go subscription operations
	 */
	public readonly payAsYouGo: PayAsYouGoRequests;

	/**
	 * Transaction status operations
	 */
	public readonly transactionStatus: TransactionStatusRequests;

	/**
	 * Create a new QBitFlow client instance
	 * @param apiKeyOrConfig - API key string or configuration object
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
	 *   maxRetries: 3
	 * });
	 * ```
	 */
	constructor(apiKeyOrConfig: string | QBitFlowConfig) {
		if (typeof apiKeyOrConfig === 'string') {
			this.apiKey = apiKeyOrConfig;
			this.baseUrl = DEFAULT_BASE_URL;
			this.timeout = DEFAULT_TIMEOUT;
			this.maxRetries = DEFAULT_MAX_RETRIES;
		} else {
			this.apiKey = apiKeyOrConfig.apiKey;
			this.baseUrl = apiKeyOrConfig.baseUrl || DEFAULT_BASE_URL;
			this.timeout = apiKeyOrConfig.timeout || DEFAULT_TIMEOUT;
			this.maxRetries = apiKeyOrConfig.maxRetries || DEFAULT_MAX_RETRIES;
		}

		// Validate API key
		if (!this.apiKey) {
			throw new Error('API key is required');
		}

		// Initialize request handlers
		this.customers = new CustomerRequests(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries
		);

		this.products = new ProductRequests(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries
		);

		this.users = new UserRequests(this.apiKey, this.baseUrl, this.timeout, this.maxRetries);

		this.apiKeys = new ApiKeyRequests(this.apiKey, this.baseUrl, this.timeout, this.maxRetries);

		this.oneTimePayments = new PaymentRequests(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries
		);

		this.subscriptions = new SubscriptionRequests(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries
		);

		this.payAsYouGo = new PayAsYouGoRequests(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries
		);

		this.transactionStatus = new TransactionStatusRequests(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries
		);
	}

	/**
	 * Get the current API key
	 * @returns Current API key
	 */
	getApiKey(): string {
		return this.apiKey;
	}

	/**
	 * Get the current base URL
	 * @returns Current base URL
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}
}
