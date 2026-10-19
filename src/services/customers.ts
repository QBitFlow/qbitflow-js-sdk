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
import { checkPathUUID } from '../validate.js';

/** Manages the customers (`/customers…`). Reach it as `client.customers`. */
export class CustomersService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's customers (`GET /customers`; newest first, page size 20 by default,
	 * at most 100), filtered by `email` (several customers may share one), `reference` or
	 * `verified`. {@link iterate} walks every page.
	 */
	async list(params?: CustomerListParams, options?: RequestOptions): Promise<Page<Customer>> {
		const query = customerListQuery(params);
		return this.core.call(
			page(CustomerSchema),
			{ method: 'GET', path: '/customers', query },
			options
		);
	}

	/**
	 * Walks every customer {@link list} returns, fetching the pages lazily from `params.cursor`
	 * (or the first page) and keeping the filters and the page size. An error ends the walk.
	 */
	iterate(
		params?: CustomerListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Customer> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * Creates a customer (`POST /customers`, 201; verified). Sends an `Idempotency-Key` and is
	 * retried on transient failures. The email is stored lowercase and is not unique: several
	 * customers of a space may share one.
	 *
	 * Errors: 400 `validation_failed` naming the field; 409 `unique_violation` when the reference
	 * is taken by another live customer of the space (`details.field` `reference`).
	 */
	async create(params: CreateCustomerParams, options?: RequestOptions): Promise<Customer> {
		const body = createCustomerBody(params);
		return this.core.call(
			CustomerSchema,
			{ method: 'POST', path: '/customers', body, idempotent: true },
			options
		);
	}

	/**
	 * A customer by its UUID (`GET /customers/:uuid`). An unknown, deleted or another space's
	 * customer is a `NotFoundError`.
	 */
	async get(uuid: string, options?: RequestOptions): Promise<Customer> {
		checkPathUUID('uuid', uuid);
		return this.core.call(
			CustomerSchema,
			{ method: 'GET', path: path('/customers/:', ['uuid', uuid]) },
			options
		);
	}

	/**
	 * The space's customer with your reference: runs {@link list}'s reference filter
	 * (`GET /customers?reference=`) and returns its one customer. No customer with that reference
	 * is a `NotFoundError` (status 404, code `not_found`). To find customers by email, use
	 * `list({ email })` (an email may match several).
	 */
	async getByReference(reference: string, options?: RequestOptions): Promise<Customer> {
		return this.core.getByReference(
			CustomerSchema,
			'/customers',
			'customer',
			reference,
			options
		);
	}

	/**
	 * Changes a customer (`PATCH /customers/:uuid`): only the fields given change; `''` clears
	 * `lastName`, `phoneNumber` or `address`; `metadata` is merged. The reference cannot change.
	 * Not retried.
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
			{ method: 'PATCH', path: path('/customers/:', ['uuid', uuid]), body },
			options
		);
	}

	/**
	 * Deletes a customer (`DELETE /customers/:uuid`, 204; a soft delete): it leaves every read and
	 * frees its reference; its past payments keep naming it (`CustomerSummary.deleted`). Not
	 * retried.
	 */
	async delete(uuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('uuid', uuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/customers/:', ['uuid', uuid]) },
			options
		);
	}
}
