import { Request } from './Request';
import { SessionRequests } from './SessionRequests';
import {
	CreateSessionDto,
	LinkResponse,
	Session,
	Duration,
	Subscription,
	SubscriptionHistory,
	SuccessResponse,
} from '../types';
import { validateCreateSession } from '../utils';
import { ValidationException } from '../exceptions';
import { StatusLinkResponse } from '../types/session';

/**
 * Subscription payment requests
 */
export class SubscriptionRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/subscription';
	private readonly sessionRequests: SessionRequests;

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
		this.sessionRequests = new SessionRequests(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Create a new subscription session
	 * @param options - Subscription session options
	 * @returns Payment link response with UUID and link
	 *
	 * @example
	 * ```typescript
	 * const subscription = await client.subscriptions.createSession({
	 *   productId: 1,
	 *   frequency: { unit: 'months', value: 1 },
	 *   trialPeriod: { unit: 'days', value: 7 },
	 *   webhookUrl: 'https://example.com/webhook',
	 *   customerUUID: 'customer-uuid'
	 * });
	 * console.log(subscription.link);
	 * ```
	 */
	async createSession(options: {
		productId: number;
		frequency: Duration;
		trialPeriod?: Duration;
		minPeriods?: number;
		successUrl?: string;
		cancelUrl?: string;
		webhookUrl?: string;
		customerUUID?: string;
	}): Promise<LinkResponse> {
		const sessionData: CreateSessionDto = {
			productId: options.productId,
			successUrl: options.successUrl,
			cancelUrl: options.cancelUrl,
			webhookUrl: options.webhookUrl,
			customerUUID: options.customerUUID,
			options: {
				subscriptionType: 'subscription',
				frequency: options.frequency,
				trialPeriod: options.trialPeriod,
				minPeriods: options.minPeriods,
			},
		};

		validateCreateSession(sessionData);
		return this.sessionRequests.create(sessionData);
	}

	/**
	 * Get subscription session details by UUID
	 * @param sessionUuid - Session UUID
	 * @returns Session details
	 */
	async getSession(sessionUuid: string): Promise<Session> {
		return this.sessionRequests.get(sessionUuid);
	}

	/**
	 * Get a subscription by UUID
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Subscription details
	 *
	 * @example
	 * ```typescript
	 * const subscription = await client.subscriptions.get('subscription-uuid');
	 * console.log(subscription.status, subscription.nextBillingDate);
	 * ```
	 */
	async get(subscriptionUUID: string): Promise<Subscription> {
		const endpoint = `${SubscriptionRequests.BASE_ROUTE}/${subscriptionUUID}`;
		return this.getReq<Subscription>(endpoint);
	}

	/**
	 * Get subscription payment history
	 * @param subscriptionUUID - Subscription UUID
	 * @returns List of subscription payment history records
	 *
	 * @example
	 * ```typescript
	 * const history = await client.subscriptions.getPaymentHistory('subscription-uuid');
	 * history.forEach(record => {
	 *   console.log(record.uuid, record.amount, record.createdAt);
	 * });
	 * ```
	 */
	async getPaymentHistory(subscriptionUUID: string): Promise<SubscriptionHistory[]> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}

		return this.getReq<SubscriptionHistory[]>(
			`${SubscriptionRequests.BASE_ROUTE}/history/${subscriptionUUID}`
		);
	}

	/**
	 * Force cancel a subscription immediately.
	 * Warning: Use only when absolutely necessary
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Success response
	 */
	async forceCancel(subscriptionUUID: string): Promise<SuccessResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}

		return this.getReq<SuccessResponse>(
			`${SubscriptionRequests.BASE_ROUTE}/processing/force-cancel/${subscriptionUUID}`,
			{}
		);
	}

	/**
	 * Execute a test billing for a subscription (test mode only)
	 * This simulates a billing cycle for testing purposes.
	 *
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Status response
	 */
	async executeTestBilling(subscriptionUUID: string): Promise<StatusLinkResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}

		return this.getReq<StatusLinkResponse>(
			`${SubscriptionRequests.BASE_ROUTE}/processing/execute-billing/${subscriptionUUID}`,
			{}
		);
	}
}
