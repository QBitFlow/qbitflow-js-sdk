import { type Core, path } from '../core.js';
import { list } from '../decode.js';
import type {
	CreateProductParams,
	Product,
	ProductListParams,
	UpdateProductParams,
} from '../models/products.js';
import { createProductBody, productListQuery, updateProductBody } from '../params.js';
import { ProductSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathRequired, checkPathUUID } from '../validate.js';

/** Manages the products (`/product…`). Reach it as `client.products`. */
export class ProductsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The space's products (`GET /product`), cheapest first; not paginated. Hidden products
	 * (`isActive` false) are left out unless `includeHidden`; `subscription` keeps only the
	 * subscription (`true`) or one-time (`false`) products.
	 */
	async list(params?: ProductListParams, options?: RequestOptions): Promise<Product[]> {
		const query = productListQuery(params);
		return this.core.call(
			list(ProductSchema),
			{ method: 'GET', path: '/product', query },
			options
		);
	}

	/**
	 * Creates a product (`POST /product`, 201). Sends an `Idempotency-Key` and is retried on
	 * transient failures. A subscription product needs `subscription.frequency`.
	 *
	 * Errors: 400 `validation_failed` (e.g. a price above $5 in test mode, `details.max`); 409
	 * `unique_violation` on `reference`; a member's key needs the organization's
	 * `members.products` policy (403 `policy_disabled`).
	 */
	async create(params: CreateProductParams, options?: RequestOptions): Promise<Product> {
		const body = createProductBody(params);
		return this.core.call(
			ProductSchema,
			{ method: 'POST', path: '/product', body, idempotent: true },
			options
		);
	}

	/** A product by its UUID (`GET /product/uuid/:uuid`), hidden ones included. */
	async get(uuid: string, options?: RequestOptions): Promise<Product> {
		checkPathUUID('uuid', uuid);
		return this.core.call(
			ProductSchema,
			{ method: 'GET', path: path('/product/uuid/:', ['uuid', uuid]) },
			options
		);
	}

	/** A product by your reference (`GET /product/reference/:reference`), sent escaped. */
	async getByReference(reference: string, options?: RequestOptions): Promise<Product> {
		checkPathRequired('reference', reference);
		return this.core.call(
			ProductSchema,
			{ method: 'GET', path: path('/product/reference/:', ['reference', reference]) },
			options
		);
	}

	/**
	 * Changes a product in place (`PUT /product/:uuid`): only the fields given change. The
	 * reference cannot change. A new price applies to new checkouts and new subscribers only.
	 * Not retried.
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
			{ method: 'PUT', path: path('/product/:', ['uuid', uuid]), body },
			options
		);
	}

	/**
	 * Deletes a product (`DELETE /product/:uuid`, a soft delete): it leaves every read and frees
	 * its reference. Its subscriptions keep billing: cancel them with `subscriptions.cancel` if
	 * the product is gone for good. Not retried.
	 */
	async delete(uuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('uuid', uuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/product/:', ['uuid', uuid]) },
			options
		);
	}
}
