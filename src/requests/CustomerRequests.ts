import { ValidationException } from '../exceptions';
import { CursorData, CursorDataResponse, getCursorData, SuccessResponse } from '../types';
import { CreateCustomerDto, Customer, UpdateCustomerDto } from '../types/customer';
import { cursorQueryBuilder } from '../utils';
import { Request } from './Request';

/**
 * Handler for customer-related API requests
 */
export class CustomerRequests extends Request {
	private static readonly BASE_ROUTE = '/customer';

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Create a new customer
	 * @param customerData The customer data
	 * @returns The created customer
	 */
	async create(customerData: CreateCustomerDto): Promise<Customer> {
		return this.postReq<Customer>(`${CustomerRequests.BASE_ROUTE}/`, customerData);
	}

	/**
	 * Get customer by ID
	 * @param customerUUID The customer ID
	 * @returns The customer
	 */
	async get(customerUUID: string): Promise<Customer> {
		if (!customerUUID) {
			throw new ValidationException('Customer UUID is required');
		}
		return this.getReq<Customer>(`${CustomerRequests.BASE_ROUTE}/uuid/${customerUUID}`);
	}

	/**
	 * Get customer by email
	 * @param email The customer email
	 * @returns The customer
	 */
	async getByEmail(email: string): Promise<Customer> {
		if (!email?.includes('@')) {
			throw new ValidationException('Valid email is required');
		}
		return this.getReq<Customer>(
			`${CustomerRequests.BASE_ROUTE}/email/${encodeURIComponent(email)}`
		);
	}

	/**
	 * Get all customers
	 * @returns List of customers
	 */
	async getAll(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<Customer>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);

		const partialCursor = await this.getReq<CursorDataResponse<Customer>>(
			`${CustomerRequests.BASE_ROUTE}/all`,
			params
		);

		return getCursorData(partialCursor);
	}

	/**
	 * Update customer by ID
	 * @param customerData The data to update
	 * @returns The updated customer
	 */
	async update(customerUUID: string, customerData: UpdateCustomerDto): Promise<Customer> {
		const data = {
			...customerData,
			uuid: customerUUID,
		};
		return this.putReq<Customer>(`${CustomerRequests.BASE_ROUTE}/`, data);
	}

	/**
	 * Delete customer by ID
	 * @param customerUUID The customer ID
	 */
	async delete(customerUUID: string): Promise<SuccessResponse> {
		return this.deleteReq<SuccessResponse>(
			`${CustomerRequests.BASE_ROUTE}/uuid/${customerUUID}`
		);
	}
}
