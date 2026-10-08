/**
 * Represents a product in the QBitFlow system
 *
 * Products are items or services that customers can purchase through one-time payments or subscriptions.
 *
 * @see {@link https://qbitflow.app/docs Product API Documentation}
 *
 * @param id - Unique identifier for the product
 * @param name - Name of the product
 * @param description - Description of the product
 * @param price - Price of the product
 * @param reference - (Optional) Reference code for the product
 * @param createdAt - Date when the product was created
 * @param isActive - Indicates if the product is active
 */
export interface Product {
	id: number; // Unique identifier for the product
	name: string; // Name of the product
	description: string; // Description of the product
	price: number; // Price of the product
	reference?: string; // Optional reference code for the product
	/** RFC3339 timestamp for when the product was created */
	createdAt: string;
	isActive: boolean; // Indicates if the product is active
	/** Whether this is a test-mode product (test and live sets are isolated) */
	test: boolean;
	/** ID of the organization that owns this product */
	organizationId: number;
	/** ID of the user that owns this product, 0 for organization-level products */
	userId: number;
}

/**
 * Data Transfer Object for creating a new product
 *
 * @param name - Name of the product
 * @param description - Description of the product
 * @param price - Price of the product
 * @param reference - (Optional) Reference code for the product
 */
export interface CreateProductDto {
	name: string;
	description: string;
	price: number;
	reference?: string;
}

/**
 * Data Transfer Object for updating an existing product.
 *
 * Updates are **partial**: every field is optional and any field you omit keeps its
 * stored value — there is no side-effect reset. An empty object is a valid no-op.
 *
 * `reference` is deliberately absent: it is an immutable identifier and the API ignores
 * it on update.
 *
 * @param name - (Optional) Name of the product, 2-100 characters
 * @param description - (Optional) Description of the product, 2-500 characters
 * @param price - (Optional) Price of the product in USD, must be greater than 0
 */
export interface UpdateProductDto {
	name?: string;
	description?: string;
	price?: number;
}
