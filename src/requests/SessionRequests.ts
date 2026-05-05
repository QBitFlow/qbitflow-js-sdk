import { Request } from './Request';
import { CreatePaymentSessionDto, CreateSubscriptionSessionDto, LinkResponse, SessionCheckout } from '../types';

/**
 * Internal session management — used by PaymentRequests and SubscriptionRequests
 */
export class SessionRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/session-checkout';

	/**
	 * Create a one-time payment session
	 * @param data - Payment session data
	 * @returns Payment link response
	 */
	async createForPayment(data: CreatePaymentSessionDto): Promise<LinkResponse> {
		return this.postReq<LinkResponse>(`${SessionRequests.BASE_ROUTE}/new/payment`, data);
	}

	/**
	 * Create a subscription session
	 * @param data - Subscription session data
	 * @returns Payment link response
	 */
	async createForSubscription(data: CreateSubscriptionSessionDto): Promise<LinkResponse> {
		return this.postReq<LinkResponse>(`${SessionRequests.BASE_ROUTE}/new/subscription`, data);
	}

	/**
	 * Get session details by UUID
	 * @param sessionUuid - Session UUID
	 * @param closeToExpireError - Whether to return an error if the session is close to expiration (default: true)
	 * @returns Session details
	 */
	async get<T extends SessionCheckout = SessionCheckout>(
		sessionUuid: string,
		closeToExpireError?: boolean
	): Promise<T> {
		const params = closeToExpireError !== undefined ? { closeToExpireError } : undefined;
		return this.getReq<T>(`${SessionRequests.BASE_ROUTE}/${sessionUuid}`, params);
	}
}
