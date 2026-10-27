/**
 * Customers.
 *
 * @module
 */

import type { PageParams } from './common.js';

/** A merchant's customer: who pays, named on the payments and subscriptions it makes. */
export interface Customer {
	/** The customer's id (a UUIDv7). */
	uuid: string;
	/** The first name. */
	firstName: string;
	/** The last name; absent when not given. */
	lastName?: string;
	/**
	 * The email address, lowercase (matched case-insensitively). Several customers of a space may
	 * share one.
	 */
	email: string;
	/** The phone number; absent when not given. */
	phoneNumber?: string;
	/** The physical address; absent when not given. */
	address?: string;
	/** The merchant's reference (its id in your system), unique per space; absent without one. */
	reference?: string;
	/**
	 * The merchant's own data on the customer (never copied onto its payments or subscriptions);
	 * `{}` without any.
	 */
	metadata: Record<string, string>;
	/** When it was created. */
	createdAt: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
}

/** Creates a customer (`customers.create`). */
export interface CreateCustomerParams {
	/** Required: 2 to 100 characters, one line. */
	firstName: string;
	/** Optional: 1 to 100 characters, one line. */
	lastName?: string;
	/**
	 * Required (stored lowercase), at most 254 characters. Not unique: several customers of a
	 * space may share one.
	 */
	email: string;
	/** Optional: at most 32 characters, digits and `. - ( )` space, an optional `+`. */
	phoneNumber?: string;
	/** Optional: at most 500 characters. */
	address?: string;
	/**
	 * Your reference (e.g. your own customer id), unique per space and mode: 1 to 100 of
	 * `A-Z a-z 0-9 . _ : @ -`, not `.` or `..`.
	 */
	reference?: string;
	/**
	 * Your own data on the customer (a CRM key): at most 50 keys of 1 to 40 characters among
	 * `A-Z a-z 0-9 _ - . :`, values of at most 500 characters without control or bidirectional
	 * characters. A key set to `''` is not stored.
	 */
	metadata?: Record<string, string>;
}

/**
 * Updates a customer (`customers.update`): fields left out are unchanged. `firstName` and
 * `email` cannot be cleared; `lastName`, `phoneNumber` and `address` are cleared with `''`. The
 * reference cannot change.
 */
export interface UpdateCustomerParams {
	/** The new first name, 2 to 100 characters (absent or `''` = unchanged). */
	firstName?: string;
	/** The new last name (1 to 100 characters); `''` clears it, absent leaves it unchanged. */
	lastName?: string;
	/** The new email (absent or `''` = unchanged). */
	email?: string;
	/** The new phone number; `''` clears it, absent leaves it unchanged. */
	phoneNumber?: string;
	/** The new address; `''` clears it, absent leaves it unchanged. */
	address?: string;
	/**
	 * Merged into the customer's: a key set to a value sets it, a key set to `''` deletes it, keys
	 * not named are kept (absent: unchanged). At most 50 keys once merged.
	 */
	metadata?: Record<string, string>;
}

/** Filters `customers.list`. */
export interface CustomerListParams extends PageParams {
	/** Only the customers with this email, whatever its casing (several may share one). */
	email?: string;
	/**
	 * Only the customer with this reference (a page of 0 or 1 customer;
	 * `customers.getByReference` reads it).
	 */
	reference?: string;
}
