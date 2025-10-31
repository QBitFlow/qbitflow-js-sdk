import { Request } from './Request';
import { SessionRequests } from './SessionRequests';
import {
	CreateSessionDto,
	LinkResponse,
	Session,
	Payment,
	CombinedPayment,
	CursorData,
	CursorDataResponse,
	getCursorData,
} from '../types';
import { cursorQueryBuilder, validateCreateSession } from '../utils';

/**
 * One-time payment requests
 */
export class PaymentRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction';
	private readonly sessionRequests: SessionRequests;

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
		this.sessionRequests = new SessionRequests(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Create a new one-time payment session
	 * You must provide either a productId or full product details.
	 *
	 * @param options - Payment session options
	 * @returns Payment link response with UUID and link
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.createSession({
	 *   productId: 1,
	 *   webhookUrl: 'https://example.com/webhook',
	 *   customerUUID: '01997c89-d0e9-7c9a-9886-fe7709919695'
	 * });
	 * console.log(payment.link); // Send this link to customer
	 * ```
	 */
	async createSession(options: {
		productId?: number;
		productName?: string;
		description?: string;
		price?: number;
		successUrl?: string;
		cancelUrl?: string;
		webhookUrl?: string;
		customerUUID?: string;
	}): Promise<LinkResponse> {
		const sessionData: CreateSessionDto = {
			productId: options.productId,
			productName: options.productName,
			description: options.description,
			price: options.price,
			successUrl: options.successUrl,
			cancelUrl: options.cancelUrl,
			webhookUrl: options.webhookUrl,
			customerUUID: options.customerUUID,
		};

		validateCreateSession(sessionData);
		return this.sessionRequests.create(sessionData);
	}

	/**
	 * Get payment session details by UUID
	 * @param sessionUUID - Session UUID
	 * @returns Session details
	 *
	 * @example
	 * ```typescript
	 * const session = await client.oneTimePayments.getSession('session-uuid');
	 * console.log(session.productName, session.price);
	 * ```
	 */
	async getSession(sessionUUID: string): Promise<Session> {
		return this.sessionRequests.get(sessionUUID);
	}

	/**
	 * Get a completed one-time payment by UUID
	 * @param paymentUUID - Payment UUID
	 * @returns Payment details
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.get('payment-uuid');
	 * console.log(payment.transactionHash, payment.amount);
	 * ```
	 */
	async get(paymentUUID: string): Promise<Payment> {
		const endpoint = `${PaymentRequests.BASE_ROUTE}/payment/${paymentUUID}`;
		return this.getReq<Payment>(endpoint);
	}

	/**
	 * Get all one-time payments with pagination
	 * @param options - Pagination options
	 * @returns Cursor-based paginated payment list
	 *
	 * @example
	 * ```typescript
	 * const result = await client.oneTimePayments.getAll({ limit: 10 });
	 * console.log(result.data); // Array of payments
	 * if (result.hasMore) {
	 *   const nextPage = await client.oneTimePayments.getAll({
	 *     limit: 10,
	 *     cursor: result.nextCursor
	 *   });
	 * }
	 * ```
	 */
	async getAll(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<Payment>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);

		const partialCursor = await this.getReq<CursorDataResponse<Payment>>(
			`${PaymentRequests.BASE_ROUTE}/payments`,
			params
		);

		return getCursorData(partialCursor);
	}

	/**
	 * Get all combined payments (one-time and subscription payments)
	 * @param options - Pagination options
	 * @returns Cursor-based paginated combined payment list
	 *
	 * @example
	 * ```typescript
	 * const result = await client.oneTimePayments.getAllCombined({ limit: 20 });
	 * result.data.forEach(payment => {
	 *   console.log(payment.source, payment.amount);
	 * });
	 * ```
	 */
	async getAllCombined(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<CombinedPayment>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);

		const partialCursor = await this.getReq<CursorData<CombinedPayment>>(
			`${PaymentRequests.BASE_ROUTE}/payments/combined`,
			params
		);

		return getCursorData(partialCursor);
	}
}
