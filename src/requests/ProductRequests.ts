import { SuccessResponse } from '../types';
import { CreateProductDto, Product, UpdateProductDto } from '../types/product';
import { Request } from './Request';

/**
 * Handler for product-related API requests
 */
export class ProductRequests extends Request {
	private static readonly BASE_ROUTE = '/product';

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Create a new product
	 * @param productData The product data
	 * @returns The created product
	 */
	async create(productData: CreateProductDto): Promise<Product> {
		return this.postReq<Product>(`${ProductRequests.BASE_ROUTE}/`, productData);
	}

	/**
	 * Get product by ID
	 * @param productId The product ID
	 * @returns The product
	 */
	async get(productId: number): Promise<Product> {
		return this.getReq<Product>(`${ProductRequests.BASE_ROUTE}/id/${productId}`);
	}

	/**
	 * Get all products
	 * @returns List of products
	 */
	async getAll(): Promise<Product[]> {
		return this.getReq<Product[]>(`${ProductRequests.BASE_ROUTE}/`);
	}

	/**
	 * Get product by reference
	 * @param reference The product reference
	 * @returns The product
	 */
	async getByReference(reference: string): Promise<Product> {
		return this.getReq<Product>(`${ProductRequests.BASE_ROUTE}/reference/${reference}`);
	}

	/**
	 * Update product by ID
	 * @param productId The product ID
	 * @param productData The data to update
	 * @returns The updated product
	 */
	async update(productId: number, productData: UpdateProductDto): Promise<Product> {
		return this.putReq<Product>(`${ProductRequests.BASE_ROUTE}/${productId}`, productData);
	}

	/**
	 * Delete product by ID
	 * @param productId The product ID
	 */
	async delete(productId: number): Promise<SuccessResponse> {
		return this.deleteReq<SuccessResponse>(`${ProductRequests.BASE_ROUTE}/${productId}`);
	}
}
