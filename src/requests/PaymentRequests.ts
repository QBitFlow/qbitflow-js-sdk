import {
	CombinedPayment,
	CreatePaymentSessionDto,
	CursorData,
	CursorDataResponse,
	getCursorData,
	LinkResponse,
	OneTimePaymentSession,
	Payment,
} from '../types';
import { Customer } from '../types/customer';
import { cursorQueryBuilder, validateCreateSession } from '../utils';
import { Request } from './Request';
import { SessionRequests } from './SessionRequests';

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
	 * Create a new one-time payment session.
	 * Provide either a productId or full product details (productName + description + price).
	 *
	 * @param options - Payment session options
	 * @returns Payment link response with UUID and link
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.createSession({
	 *   productId: 1,
	 *   customerUUID: 'customer-uuid'
	 * });
	 * console.log(payment.link); // Send this link to the customer
	 * ```
	 */
	async createSession(options: CreatePaymentSessionDto): Promise<LinkResponse> {
		validateCreateSession(options);
		return this.sessionRequests.createForPayment(options);
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
	async getSession(sessionUUID: string): Promise<OneTimePaymentSession> {
		return this.sessionRequests.get<OneTimePaymentSession>(sessionUUID);
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
		return this.getReq<Payment>(`${ PaymentRequests.BASE_ROUTE }/payment/${ paymentUUID }`);
	}

	/**
	 * Get a completed one-time payment by the reference you assigned when creating it.
	 * Lets you resolve a payment from your own order/invoice ID without storing QBitFlow's UUID.
	 *
	 * @param reference - Your own payment reference
	 * @returns Payment details
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.getByReference('order-1234');
	 * console.log(payment.uuid, payment.amount);
	 * ```
	 */
	async getByReference(reference: string): Promise<Payment> {
		return this.getReq<Payment>(
			`${ PaymentRequests.BASE_ROUTE }/payment/reference/${ encodeURIComponent(reference) }`
		);
	}

	/**
	 * Get all one-time payments with cursor-based pagination
	 * @param options - Pagination options
	 * @returns Paginated payment list
	 *
	 * @example
	 * ```typescript
	 * const result = await client.oneTimePayments.getAll({ limit: 10 });
	 * if (result.hasMore()) {
	 *   const next = await client.oneTimePayments.getAll({ limit: 10, cursor: result.nextCursor });
	 * }
	 * ```
	 */
	async getAll(options?: { limit?: number; cursor?: string | null }): Promise<CursorData<Payment>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);
		const partial = await this.getReq<CursorDataResponse<Payment>>(
			`${ PaymentRequests.BASE_ROUTE }/payments`,
			params
		);
		return getCursorData(partial);
	}

	/**
	 * Get all payments (one-time and subscription billings) combined, with cursor-based pagination
	 * @param options - Pagination options
	 * @returns Paginated combined payment list
	 *
	 * @example
	 * ```typescript
	 * const result = await client.oneTimePayments.getAllCombined({ limit: 20 });
	 * result.items.forEach(p => console.log(p.source, p.amount));
	 * ```
	 */
	async getAllCombined(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<CombinedPayment>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);
		const partial = await this.getReq<CursorDataResponse<CombinedPayment>>(
			`${ PaymentRequests.BASE_ROUTE }/payments/combined`,
			params
		);
		return getCursorData(partial);
	}

	/**
	 * Get the customer associated with a transaction
	 * @param transactionUUID - Transaction UUID
	 * @returns Customer information
	 *
	 * @example
	 * ```typescript
	 * const customer = await client.oneTimePayments.getCustomerForTransaction('tx-uuid');
	 * console.log(customer.email);
	 * ```
	 */
	async getCustomerForTransaction(transactionUUID: string): Promise<Customer> {
		return this.getReq<Customer>(`${ PaymentRequests.BASE_ROUTE }/customer/${ transactionUUID }`);
	}
}
