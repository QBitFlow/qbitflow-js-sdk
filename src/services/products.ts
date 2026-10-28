import { type Core, path } from '../core.js';
import type { Page } from '../models/common.js';
import type {
	CreateProductParams,
	Product,
	ProductListParams,
	UpdateProductParams,
} from '../models/products.js';
import { iteratePages } from '../pagination.js';
import { createProductBody, productListQuery, updateProductBody } from '../params.js';
import { page, ProductSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathUUID } from '../validate.js';

/** Manages the products (`/products…`). Reach it as `client.products`. */
export class ProductsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's products (`GET /products`; newest first, page size 20 by default,
	 * at most 100). Hidden products (`isActive` false) are left out unless `includeHidden`;
	 * `subscription` keeps only the subscription (`true`) or one-time (`false`) products;
	 * `reference` the one with that reference. {@link iterate} walks every page.
	 */
	async list(params?: ProductListParams, options?: RequestOptions): Promise<Page<Product>> {
		const query = productListQuery(params);
		return this.core.call(
			page(ProductSchema),
			{ method: 'GET', path: '/products', query },
			options
		);
	}

	/**
	 * Walks every product {@link list} returns, fetching the pages lazily from `params.cursor` (or
	 * the first page) and keeping the filters and the page size. An error ends the walk (thrown).
	 */
	iterate(params?: ProductListParams, options?: RequestOptions): AsyncIterableIterator<Product> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * Creates a product (`POST /products`, 201). Sends an `Idempotency-Key` and is retried on
	 * transient failures. A subscription product needs `subscription.frequency`.
	 *
	 * Errors: 400 `validation_failed` (e.g. a price above `"5"` in test mode, `details.max` `"5"`;
	 * a live subscription product at `"0.25"` or less, `details.min`); 409 `unique_violation` on
	 * `reference` (references are unique among the space's live products); a member's key needs
	 * the organization's `members.products` policy, and `members.subscriptions` to give the
	 * product subscription terms (403 `policy_disabled`, `details.policy` names it).
	 */
	async create(params: CreateProductParams, options?: RequestOptions): Promise<Product> {
		const body = createProductBody(params);
		return this.core.call(
			ProductSchema,
			{ method: 'POST', path: '/products', body, idempotent: true },
			options
		);
	}

	/**
	 * A product by its UUID (`GET /products/:uuid`), hidden ones included. An unknown, deleted or
	 * another space's product is a `NotFoundError`.
	 */
	async get(uuid: string, options?: RequestOptions): Promise<Product> {
		checkPathUUID('uuid', uuid);
		return this.core.call(
			ProductSchema,
			{ method: 'GET', path: path('/products/:', ['uuid', uuid]) },
			options
		);
	}

	/**
	 * The space's product with your reference, hidden or not: runs {@link list}'s reference filter
	 * (`GET /products?reference=`) and returns its one product. No product with that reference is
	 * a `NotFoundError` (status 404, code `not_found`), as an unknown uuid is. The reference is
	 * checked like a created one's (1 to 100 of `A-Z a-z 0-9 . _ : @ -`, not `.` or `..`).
	 */
	async getByReference(reference: string, options?: RequestOptions): Promise<Product> {
		return this.core.getByReference(ProductSchema, '/products', 'product', reference, options);
	}

	/**
	 * Changes a product in place (`PATCH /products/:uuid`): only the fields given change (empty
	 * params are a no-op that returns the product); `metadata` is merged. The reference cannot
	 * change. A new price or new terms apply to new checkouts and new subscribers only: existing
	 * subscriptions and open checkout sessions keep theirs. Not retried.
	 *
	 * A member's key gives a product subscription terms only with the organization's
	 * `members.subscriptions` policy (403 `policy_disabled`); `removeSubscription` and other edits
	 * never need it.
	 */
	async update(
		uuid: string,
		params: UpdateProductParams,
		options?: RequestOptions
	): Promise<Product> {
		checkPathUUID('uuid', uuid);
		const body = updateProductBody(params);
		return this.core.call(
			ProductSchema,
			{ method: 'PATCH', path: path('/products/:', ['uuid', uuid]), body },
			options
		);
	}

	/**
	 * Deletes a product (`DELETE /products/:uuid`, 204; a soft delete): it leaves every read and
	 * frees its reference. It does not stop its subscriptions (they keep billing at their price):
	 * cancel them with `subscriptions.cancel` if the product is gone for good. Not retried.
	 */
	async delete(uuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('uuid', uuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/products/:', ['uuid', uuid]) },
			options
		);
	}
}
