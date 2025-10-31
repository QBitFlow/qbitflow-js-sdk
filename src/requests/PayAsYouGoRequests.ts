import { Request } from './Request';
import { SessionRequests } from './SessionRequests';
import {
	CreateSessionDto,
	LinkResponse,
	Session,
	Duration,
	PayAsYouGoSubscription,
	SubscriptionHistory,
	SuccessResponse,
} from '../types';
import { validateCreateSession } from '../utils';
import { ValidationException } from '../exceptions';
import { StatusLinkResponse } from '../types/session';

/**
 * Pay-as-you-go subscription requests
 */
export class PayAsYouGoRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/subscription';
	private readonly sessionRequests: SessionRequests;

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
		this.sessionRequests = new SessionRequests(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Create a new pay-as-you-go subscription session
	 * @param options - PAYG subscription session options
	 * @returns Payment link response with UUID and link
	 *
	 * @example
	 * ```typescript
	 * const payg = await client.payAsYouGo.createSession({
	 *   productId: 1,
	 *   frequency: { unit: 'months', value: 1 },
	 *   freeCredits: 100,
	 *   webhookUrl: 'https://example.com/webhook',
	 *   customerUuid: 'customer-uuid'
	 * });
	 * console.log(payg.link);
	 * ```
	 */
	async createSession(options: {
		productId: number;
		frequency: Duration;
		freeCredits?: number;
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
				subscriptionType: 'payAsYouGo',
				frequency: options.frequency,
				freeCredits: options.freeCredits,
			},
		};

		validateCreateSession(sessionData);
		return this.sessionRequests.create(sessionData);
	}

	/**
	 * Get PAYG session details by UUID
	 * @param sessionUUID - Session UUID
	 * @returns Session details
	 */
	async getSession(sessionUUID: string): Promise<Session> {
		return this.sessionRequests.get(sessionUUID);
	}

	/**
	 * Get a pay-as-you-go subscription by UUID
	 * @param paygUUID - PAYG subscription UUID
	 * @returns PAYG subscription details
	 *
	 * @example
	 * ```typescript
	 * const payg = await client.payAsYouGo.get('payg-uuid');
	 * console.log(payg.allowance, payg.maxAmount);
	 * ```
	 */
	async get(paygUUID: string): Promise<PayAsYouGoSubscription> {
		const endpoint = `${PayAsYouGoRequests.BASE_ROUTE}/${paygUUID}`;
		return this.getReq<PayAsYouGoSubscription>(endpoint);
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
			`${PayAsYouGoRequests.BASE_ROUTE}/history/${subscriptionUUID}`
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
			`${PayAsYouGoRequests.BASE_ROUTE}/processing/force-cancel/${subscriptionUUID}`,
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
			`${PayAsYouGoRequests.BASE_ROUTE}/processing/execute-billing/${subscriptionUUID}`,
			{}
		);
	}
}
