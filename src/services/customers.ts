import { type Core, path } from '../core.js';
import type { Page } from '../models/common.js';
import type {
	CreateCustomerParams,
	Customer,
	CustomerListParams,
	UpdateCustomerParams,
} from '../models/customers.js';
import { iteratePages } from '../pagination.js';
import { createCustomerBody, customerListQuery, updateCustomerBody } from '../params.js';
import { CustomerSchema, page } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathRequired, checkPathUUID } from '../validate.js';

/** Manages the customers (`/customer…`). Reach it as `client.customers`. */
export class CustomersService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * Creates a customer (`POST /customer`, 201). Sends an `Idempotency-Key` and is retried on
	 * transient failures. The email is stored lowercase.
	 *
	 * Errors: 400 `validation_failed` naming the field; 409 `unique_violation` when the email or
	 * the reference is taken by another live customer of the space (`details.field`).
	 */
	async create(params: CreateCustomerParams, options?: RequestOptions): Promise<Customer> {
		const body = createCustomerBody(params);
		return this.core.call(
			CustomerSchema,
			{ method: 'POST', path: '/customer', body, idempotent: true },
			options
		);
	}

	/**
	 * Changes a customer (`PUT /customer/:uuid`): only the fields given change; `''` clears
	 * `phoneNumber` or `address`. The reference cannot change. Not retried.
	 */
	async update(
		uuid: string,
		params: UpdateCustomerParams,
		options?: RequestOptions
	): Promise<Customer> {
		checkPathUUID('uuid', uuid);
		const body = updateCustomerBody(params);
		return this.core.call(
			CustomerSchema,
			{ method: 'PUT', path: path('/customer/:', ['uuid', uuid]), body },
			options
		);
	}

	/**
	 * One page of the space's customers (`GET /customer/all`; page size 10 by default, at most
	 * 100), filtered by `email` or `verified`. `iterate` walks every page.
	 */
	async list(params?: CustomerListParams, options?: RequestOptions): Promise<Page<Customer>> {
		const query = customerListQuery(params);
		return this.core.call(
			page(CustomerSchema),
			{ method: 'GET', path: '/customer/all', query },
			options
		);
	}

	/**
	 * Walks every customer `list` returns, fetching the pages lazily from `params.cursor` (or the
	 * first page) and keeping the filters and the page size. An error ends the walk (thrown).
	 */
	iterate(
		params?: CustomerListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Customer> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/** A customer by its UUID (`GET /customer/uuid/:uuid`). */
	async get(uuid: string, options?: RequestOptions): Promise<Customer> {
		checkPathUUID('uuid', uuid);
		return this.core.call(
			CustomerSchema,
			{ method: 'GET', path: path('/customer/uuid/:', ['uuid', uuid]) },
			options
		);
	}

	/** The space's customer with this email, whatever its casing (`GET /customer/email/:email`). */
	async getByEmail(email: string, options?: RequestOptions): Promise<Customer> {
		checkPathRequired('email', email);
		return this.core.call(
			CustomerSchema,
			{ method: 'GET', path: path('/customer/email/:', ['email', email]) },
			options
		);
	}

	/** The space's customer with your reference (`GET /customer/reference/:reference`), sent escaped. */
	async getByReference(reference: string, options?: RequestOptions): Promise<Customer> {
		checkPathRequired('reference', reference);
		return this.core.call(
			CustomerSchema,
			{ method: 'GET', path: path('/customer/reference/:', ['reference', reference]) },
			options
		);
	}

	/**
	 * Deletes a customer (`DELETE /customer/uuid/:uuid`, a soft delete): it leaves every read and
	 * frees its email and reference; its past payments keep naming it. Not retried.
	 */
	async delete(uuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('uuid', uuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/customer/uuid/:', ['uuid', uuid]) },
			options
		);
	}
}
