/**
 * Customers.
 *
 * @module
 */

/** A customer of a space. */
export interface Customer {
	/** The customer's id. */
	uuid: string;
	/** The first name. */
	name: string;
	/** The last name, when given. */
	lastName?: string;
	/** The email address, lowercase. Several customers of a space may share one. */
	email: string;
	/** True for a customer the merchant created, false for one created from the email a payer typed at checkout. */
	verified: boolean;
	/** The phone number, when given. */
	phoneNumber?: string;
	/** The physical address, when given. */
	address?: string;
	/** The merchant's reference, when given. */
	reference?: string;
	/** When it was created. */
	createdAt: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
}

/** Creates a customer (`customers.create`). */
export interface CreateCustomerParams {
	/** Required: the first name, 2 to 100 characters, one line. */
	name: string;
	/** Optional: 1 to 100 characters, one line. */
	lastName?: string;
	/** Required (stored lowercase), at most 254 characters. */
	email: string;
	/** Optional: at most 32 characters, digits and `. - ( )` and spaces, an optional `+`. */
	phoneNumber?: string;
	/** Optional: at most 500 characters. */
	address?: string;
	/** Your reference (e.g. your own customer id), unique per space. */
	reference?: string;
}

/**
 * Updates a customer (`customers.update`): fields left out are unchanged; `''` clears
 * `phoneNumber` or `address`. The reference cannot be changed.
 */
export interface UpdateCustomerParams {
	/** The new first name. */
	name?: string;
	/** The new last name. */
	lastName?: string;
	/** The new email. */
	email?: string;
	/** The new phone number; `''` clears it. */
	phoneNumber?: string;
	/** The new address; `''` clears it. */
	address?: string;
}

/** Filters `customers.list` (page size: server default 10, max 100). */
export interface CustomerListParams {
	/** The page size (0 or absent = the server's default). */
	limit?: number;
	/** The previous page's `nextCursor`; absent for the first page. */
	cursor?: string;
	/** Only the customers with this email, whatever its casing. */
	email?: string;
	/** Only the customers the merchant created (`true`) or those created at checkout (`false`). */
	verified?: boolean;
}
