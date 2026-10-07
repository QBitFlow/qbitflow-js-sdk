import { cursorPage, CustomerSchema, SuccessResponseSchema } from '../schemas.js';
import { CursorData, getCursorData, SuccessResponse } from '../types/index.js';
import { CreateCustomerDto, Customer, UpdateCustomerDto } from '../types/customer.js';
import {
	cursorQueryBuilder,
	prepareCreateCustomerBody,
	prepareUpdateCustomerBody,
	requireNonEmpty,
	validateEmail,
} from '../utils/index.js';
import { Request } from './Request.js';

/**
 * Handler for customer-related API requests
 */
export class CustomerRequests extends Request {
	private static readonly BASE_ROUTE = '/customer';

	/**
	 * Create a new customer
	 * @param customerData The customer data
	 * @returns The created customer
	 * @throws {ValidationException} When `name`/`lastName` are not 2–100 alphanumspace
	 *   characters or `email` is invalid
	 */
	async create(customerData: CreateCustomerDto): Promise<Customer> {
		const body = prepareCreateCustomerBody(customerData);
		return this.postJson(CustomerSchema, `${CustomerRequests.BASE_ROUTE}/`, body);
	}

	/**
	 * Get customer by UUID
	 * @param customerUUID The customer UUID
	 * @returns The customer
	 * @throws {ValidationException} When `customerUUID` is empty
	 */
	async get(customerUUID: string): Promise<Customer> {
		requireNonEmpty('customerUUID', customerUUID);
		return this.getJson(
			CustomerSchema,
			`${CustomerRequests.BASE_ROUTE}/uuid/${encodeURIComponent(customerUUID)}`
		);
	}

	/**
	 * Get customer by the reference you assigned when creating it.
	 * Lets you resolve a customer from your own identifier without storing QBitFlow's UUID.
	 * The reference is escaped correctly, but the API currently cannot route a reference
	 * containing `/` (it answers 404).
	 *
	 * @param reference The customer reference
	 * @returns The customer
	 * @throws {ValidationException} When `reference` is empty
	 */
	async getByReference(reference: string): Promise<Customer> {
		requireNonEmpty('reference', reference);
		return this.getJson(
			CustomerSchema,
			`${CustomerRequests.BASE_ROUTE}/reference/${encodeURIComponent(reference)}`
		);
	}

	/**
	 * Get customer by email
	 * @param email The customer email
	 * @returns The customer
	 * @throws {ValidationException} When `email` is not a valid e-mail address
	 */
	async getByEmail(email: string): Promise<Customer> {
		validateEmail('email', email);
		return this.getJson(
			CustomerSchema,
			`${CustomerRequests.BASE_ROUTE}/email/${encodeURIComponent(email)}`
		);
	}

	/**
	 * Get all customers (cursor-paginated)
	 * @param options Page size and cursor
	 * @returns One page of customers
	 * @throws {ValidationException} When `limit` is not a positive integer
	 */
	async getAll(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<Customer>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);
		const page = await this.getJson(
			cursorPage(CustomerSchema),
			`${CustomerRequests.BASE_ROUTE}/all`,
			params
		);
		return getCursorData(page);
	}

	/**
	 * Update customer by UUID. Updates are partial: omitted fields keep their stored value, and
	 * an empty string counts as "not provided".
	 * @param customerUUID The customer UUID
	 * @param customerData The data to update
	 * @returns The updated customer
	 * @throws {ValidationException} When `customerUUID` is empty or a provided field breaks
	 *   the API's rules
	 */
	async update(customerUUID: string, customerData: UpdateCustomerDto): Promise<Customer> {
		requireNonEmpty('customerUUID', customerUUID);
		const body = prepareUpdateCustomerBody(customerData);
		return this.putJson(
			CustomerSchema,
			`${CustomerRequests.BASE_ROUTE}/${encodeURIComponent(customerUUID)}`,
			body
		);
	}

	/**
	 * Delete (soft-delete) customer by UUID
	 * @param customerUUID The customer UUID
	 * @throws {ValidationException} When `customerUUID` is empty
	 */
	async delete(customerUUID: string): Promise<SuccessResponse> {
		requireNonEmpty('customerUUID', customerUUID);
		return this.deleteJson(
			SuccessResponseSchema,
			`${CustomerRequests.BASE_ROUTE}/uuid/${encodeURIComponent(customerUUID)}`
		);
	}
}
