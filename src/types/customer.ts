/**
 * Customer entity representing a customer in the QBitFlow system
 *
 * Customers are individuals or entities that make payments though your platform.
 * Each customer has a unique UUID and contact information.
 *
 * @see {@link https://qbitflow.app/docs Customer API Documentation}
 *
 * @param uuid - Unique identifier for the customer
 * @param name - First name of the customer
 * @param lastName - Last name of the customer
 * @param email - Email address of the customer
 * @param phoneNumber - (Optional) Phone number of the customer
 * @param address - (Optional) Address of the customer
 * @param reference - (Optional) Reference code for the customer
 * @param createdAt - Date when the customer was created
 */
export interface Customer {
	uuid: string;
	name: string;
	lastName: string;
	email: string;

	phoneNumber?: string;
	address?: string;

	reference?: string;
	createdAt: Date;
}

/**
 * Data Transfer Object for creating a new customer
 *
 * @param name - First name of the customer
 * @param lastName - Last name of the customer
 * @param email - Email address of the customer
 * @param phoneNumber - (Optional) Phone number of the customer
 * @param address - (Optional) Address of the customer
 * @param reference - (Optional) Reference code for the customer
 */
export interface CreateCustomerDto {
	name: string;
	lastName: string;
	email: string;

	phoneNumber?: string;
	address?: string;

	reference?: string;
}

/**
 * Data Transfer Object for updating an existing customer
 *
 * @param uuid - Unique identifier for the customer
 * @param name - (Optional) First name of the customer
 * @param lastName - (Optional) Last name of the customer
 * @param email - (Optional) Email address of the customer
 * @param phoneNumber - (Optional) Phone number of the customer
 * @param address - (Optional) Address of the customer
 */
export interface UpdateCustomerDto {
	uuid: string;
	name?: string;
	lastName?: string;
	email?: string;

	phoneNumber?: string;
	address?: string;
}
