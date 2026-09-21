import { ValidationException } from '../exceptions';
import {
	CreateSubscriptionSessionDto,
	LinkResponse,
	StatusLinkResponse,
	Subscription,
	SubscriptionHistory,
	SubscriptionSession,
	SuccessResponse,
} from '../types';
import { validateCreateSession } from '../utils';
import { Request } from './Request';
import { SessionRequests } from './SessionRequests';

/**
 * Subscription payment requests
 */
export class SubscriptionRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/subscription';
	private readonly sessionRequests: SessionRequests;

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number, headers?: Record<string, string>) {
		super(apiKey, baseUrl, timeout, maxRetries, headers);
		this.sessionRequests = new SessionRequests(apiKey, baseUrl, timeout, maxRetries, headers);
	}

	/**
	 * Create a new subscription session.
	 * Provide either a productId or full product details (productName + description + price).
	 *
	 * @param options - Subscription session options
	 * @returns Payment link response with UUID and link
	 *
	 * @example
	 * ```typescript
	 * const sub = await client.subscriptions.createSession({
	 *   productId: 1,
	 *   frequency: { unit: 'months', value: 1 },
	 *   trialPeriod: { unit: 'days', value: 7 },
	 *   customerUUID: 'customer-uuid'
	 * });
	 * console.log(sub.link);
	 * ```
	 */
	async createSession(options: CreateSubscriptionSessionDto): Promise<LinkResponse> {
		validateCreateSession(options);
		return this.sessionRequests.createForSubscription(options);
	}

	/**
	 * Get subscription session details by UUID
	 * @param sessionUuid - Session UUID
	 * @returns Session details
	 */
	async getSession(sessionUuid: string): Promise<SubscriptionSession> {
		return this.sessionRequests.get<SubscriptionSession>(sessionUuid);
	}

	/**
	 * Get a subscription by UUID
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Subscription details
	 *
	 * @example
	 * ```typescript
	 * const sub = await client.subscriptions.get('subscription-uuid');
	 * console.log(sub.subscriptionStatus, sub.nextBillingDate);
	 * ```
	 */
	async get(subscriptionUUID: string): Promise<Subscription> {
		return this.getReq<Subscription>(`${ SubscriptionRequests.BASE_ROUTE }/${ subscriptionUUID }`);
	}

	/**
	 * Get a subscription by the reference you assigned when creating it.
	 * Lets you resolve a subscription from your own order/invoice ID without storing QBitFlow's UUID.
	 *
	 * @param reference - Your own subscription reference
	 * @returns Subscription details
	 *
	 * @example
	 * ```typescript
	 * const sub = await client.subscriptions.getByReference('sub-1234');
	 * console.log(sub.uuid, sub.subscriptionStatus);
	 * ```
	 */
	async getByReference(reference: string): Promise<Subscription> {
		if (!reference) {
			throw new ValidationException('Subscription reference is required');
		}
		return this.getReq<Subscription>(
			`${ SubscriptionRequests.BASE_ROUTE }/reference/subscription/${ encodeURIComponent(reference) }`
		);
	}

	/**
	 * Get subscription payment history
	 * @param subscriptionUUID - Subscription UUID
	 * @returns List of subscription billing history records
	 *
	 * @example
	 * ```typescript
	 * const history = await client.subscriptions.getPaymentHistory('subscription-uuid');
	 * history.forEach(r => console.log(r.uuid, r.amount, r.createdAt));
	 * ```
	 */
	async getPaymentHistory(subscriptionUUID: string): Promise<SubscriptionHistory[]> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		return this.getReq<SubscriptionHistory[]>(
			`${ SubscriptionRequests.BASE_ROUTE }/history/${ subscriptionUUID }`
		);
	}

	/**
	 * Force-cancel a subscription immediately.
	 * The normal cancellation flow requires the subscriber to sign a message;
	 * this bypasses that for cases such as suspicious activity or admin-initiated cancellations.
	 *
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Success response
	 */
	async forceCancel(subscriptionUUID: string): Promise<SuccessResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		return this.getReq<SuccessResponse>(
			`${ SubscriptionRequests.BASE_ROUTE }/processing/force-cancel/${ subscriptionUUID }`
		);
	}

	/**
	 * Manually trigger a billing cycle for a test-mode subscription.
	 * In production, billing is executed automatically on schedule.
	 *
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Status link response
	 */
	async executeTestBilling(subscriptionUUID: string): Promise<StatusLinkResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		return this.getReq<StatusLinkResponse>(
			`${ SubscriptionRequests.BASE_ROUTE }/processing/execute-billing/${ subscriptionUUID }`
		);
	}
}
