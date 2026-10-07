import { list } from '../decode.js';
import { ProductSchema, SuccessResponseSchema } from '../schemas.js';
import { SuccessResponse } from '../types/index.js';
import { CreateProductDto, Product, UpdateProductDto } from '../types/product.js';
import {
	prepareCreateProductBody,
	prepareUpdateProductBody,
	requireNonEmpty,
	requirePositiveInt,
} from '../utils/index.js';
import { Request } from './Request.js';

/**
 * Handler for product-related API requests
 */
export class ProductRequests extends Request {
	private static readonly BASE_ROUTE = '/product';

	/**
	 * Create a new product
	 * @param productData The product data
	 * @returns The created product
	 * @throws {ValidationException} When `name` (2–100) / `description` (2–500) break the
	 *   `producttext` rule or `price` is not greater than 0
	 */
	async create(productData: CreateProductDto): Promise<Product> {
		const body = prepareCreateProductBody(productData);
		return this.postJson(ProductSchema, `${ProductRequests.BASE_ROUTE}/`, body);
	}

	/**
	 * Get product by ID
	 * @param productId The product ID
	 * @returns The product
	 * @throws {ValidationException} When `productId` is not a positive integer
	 */
	async get(productId: number): Promise<Product> {
		requirePositiveInt('productId', productId);
		return this.getJson(ProductSchema, `${ProductRequests.BASE_ROUTE}/id/${productId}`);
	}

	/**
	 * Get all active products (hidden ghost products are excluded)
	 * @returns List of products
	 */
	async getAll(): Promise<Product[]> {
		return this.getJson(list(ProductSchema), `${ProductRequests.BASE_ROUTE}/`);
	}

	/**
	 * Get product by reference. The reference is escaped correctly, but the API currently
	 * cannot route a reference containing `/` (it answers 404).
	 * @param reference The product reference
	 * @returns The product
	 * @throws {ValidationException} When `reference` is empty
	 */
	async getByReference(reference: string): Promise<Product> {
		requireNonEmpty('reference', reference);
		return this.getJson(
			ProductSchema,
			`${ProductRequests.BASE_ROUTE}/reference/${encodeURIComponent(reference)}`
		);
	}

	/**
	 * Update product by ID. Updates are partial: omitted fields keep their stored value.
	 * @param productId The product ID
	 * @param productData The data to update
	 * @returns The updated product
	 * @throws {ValidationException} When `productId` is not a positive integer or a provided
	 *   field breaks the API's rules
	 */
	async update(productId: number, productData: UpdateProductDto): Promise<Product> {
		requirePositiveInt('productId', productId);
		const body = prepareUpdateProductBody(productData);
		return this.putJson(ProductSchema, `${ProductRequests.BASE_ROUTE}/${productId}`, body);
	}

	/**
	 * Delete (soft-delete) product by ID
	 * @param productId The product ID
	 * @throws {ValidationException} When `productId` is not a positive integer
	 */
	async delete(productId: number): Promise<SuccessResponse> {
		requirePositiveInt('productId', productId);
		return this.deleteJson(SuccessResponseSchema, `${ProductRequests.BASE_ROUTE}/${productId}`);
	}
}
