import { CombinedPaymentSchema, cursorPage, CustomerSchema, PaymentSchema } from '../schemas.js';
import {
	CombinedPayment,
	CreatePaymentSessionDto,
	CursorData,
	getCursorData,
	LinkResponse,
	OneTimePaymentSession,
	Payment,
} from '../types/index.js';
import { Customer } from '../types/customer.js';
import { cursorQueryBuilder, requireNonEmpty } from '../utils/index.js';
import { Request } from './Request.js';
import { SessionRequests } from './SessionRequests.js';
import { Transport } from './Transport.js';

/**
 * One-time payment requests
 */
export class PaymentRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction';
	private readonly sessionRequests: SessionRequests;

	constructor(transport: Transport, headers: Readonly<Record<string, string>> = {}) {
		super(transport, headers);
		this.sessionRequests = new SessionRequests(transport, headers);
	}

	/**
	 * Create a new one-time payment session.
	 * Provide either a productId / productReference or full product details
	 * (productName + description + price). Empty optional strings are left out of the request.
	 *
	 * @param options - Payment session options
	 * @returns Payment link response with UUID and link
	 * @throws {ValidationException} When the payload breaks the API's rules (see
	 *   `prepareSessionBody`)
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.createSession({
	 *   productId: 1,
	 *   successUrl: 'https://shop.example.com/thanks',
	 * });
	 * console.log(payment.link); // Send this link to the customer
	 * ```
	 */
	async createSession(options: CreatePaymentSessionDto): Promise<LinkResponse> {
		return this.sessionRequests.createForPayment(options);
	}

	/**
	 * Get payment session details by UUID (public route)
	 * @param sessionUUID - Session UUID
	 * @param closeToExpireError - Whether the API should answer with an error when the session
	 *   is close to expiry. Omit for the API default (`true`); pass `false` to always get the
	 *   session data.
	 * @returns Session details
	 * @throws {ValidationException} When `sessionUUID` is empty, or the session is a
	 *   subscription session (use `client.subscriptions.getSession()` for those)
	 *
	 * @example
	 * ```typescript
	 * const session = await client.oneTimePayments.getSession('pay@…');
	 * console.log(session.productName, session.price);
	 * ```
	 */
	async getSession(
		sessionUUID: string,
		closeToExpireError?: boolean
	): Promise<OneTimePaymentSession> {
		return this.sessionRequests.get('payment', sessionUUID, closeToExpireError);
	}

	/**
	 * Get a completed one-time payment by UUID (`pay@<uuid>` or bare UUID)
	 * @param paymentUUID - Payment UUID
	 * @returns Payment details
	 * @throws {ValidationException} When `paymentUUID` is empty
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.get('pay@…');
	 * console.log(payment.transactionHash, payment.amount, payment.currency.symbol);
	 * ```
	 */
	async get(paymentUUID: string): Promise<Payment> {
		requireNonEmpty('paymentUUID', paymentUUID);
		return this.getJson(
			PaymentSchema,
			`${PaymentRequests.BASE_ROUTE}/payment/${encodeURIComponent(paymentUUID)}`
		);
	}

	/**
	 * Get a completed one-time payment by the reference you assigned when creating it.
	 * Lets you resolve a payment from your own order/invoice ID without storing QBitFlow's UUID.
	 *
	 * The reference is escaped correctly, but the API currently cannot route a reference
	 * containing `/` (it answers 404).
	 *
	 * @param reference - Your own payment reference
	 * @returns Payment details
	 * @throws {ValidationException} When `reference` is empty
	 *
	 * @example
	 * ```typescript
	 * const payment = await client.oneTimePayments.getByReference('order-1234');
	 * console.log(payment.uuid, payment.amount);
	 * ```
	 */
	async getByReference(reference: string): Promise<Payment> {
		requireNonEmpty('reference', reference);
		return this.getJson(
			PaymentSchema,
			`${PaymentRequests.BASE_ROUTE}/payment/reference/${encodeURIComponent(reference)}`
		);
	}

	/**
	 * Get all one-time payments with cursor-based pagination
	 * @param options - Pagination options
	 * @returns Paginated payment list
	 * @throws {ValidationException} When `limit` is not a positive integer
	 *
	 * @example
	 * ```typescript
	 * const result = await client.oneTimePayments.getAll({ limit: 10 });
	 * if (result.hasMore()) {
	 *   const next = await client.oneTimePayments.getAll({ limit: 10, cursor: result.nextCursor });
	 * }
	 * ```
	 */
	async getAll(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<Payment>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);
		const page = await this.getJson(
			cursorPage(PaymentSchema),
			`${PaymentRequests.BASE_ROUTE}/payments`,
			params
		);
		return getCursorData(page);
	}

	/**
	 * Get all payments (one-time and subscription billings) combined, with cursor-based pagination
	 * @param options - Pagination options
	 * @returns Paginated combined payment list
	 * @throws {ValidationException} When `limit` is not a positive integer
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
		const page = await this.getJson(
			cursorPage(CombinedPaymentSchema),
			`${PaymentRequests.BASE_ROUTE}/payments/combined`,
			params
		);
		return getCursorData(page);
	}

	/**
	 * Get the customer associated with a transaction (`pay@…` or `sub@…`)
	 * @param transactionUUID - Transaction UUID
	 * @returns Customer information
	 * @throws {ValidationException} When `transactionUUID` is empty
	 *
	 * @example
	 * ```typescript
	 * const customer = await client.oneTimePayments.getCustomerForTransaction('pay@…');
	 * console.log(customer.email);
	 * ```
	 */
	async getCustomerForTransaction(transactionUUID: string): Promise<Customer> {
		requireNonEmpty('transactionUUID', transactionUUID);
		return this.getJson(
			CustomerSchema,
			`${PaymentRequests.BASE_ROUTE}/customer/${encodeURIComponent(transactionUUID)}`
		);
	}
}
