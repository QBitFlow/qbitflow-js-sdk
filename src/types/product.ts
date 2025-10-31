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
	createdAt: Date; // Date when the product was created
	isActive: boolean; // Indicates if the product is active
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
 * Data Transfer Object for updating an existing product
 *
 * @param name - Name of the product
 * @param description - Description of the product
 * @param price - Price of the product
 */
export interface UpdateProductDto {
	name: string;
	description: string;
	price: number;
}
