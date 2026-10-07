/**
 * Products.
 *
 * @module
 */

import type { Duration } from './common.js';

/** A product: a one-time product, or a subscription product with its terms. */
export interface Product {
	/** The product's id. */
	uuid: string;
	/** Its name. */
	name: string;
	/** Its description (`''` when none). */
	description: string;
	/** Its price in USD (per period for a subscription product). */
	price: number;
	/** When it was created. */
	createdAt: string;
	/** False for a hidden product (left out of `products.list` unless `includeHidden`). */
	isActive: boolean;
	/** The merchant's reference (defaults to the uuid). */
	reference: string;
	/** A subscription product's terms; absent for a one-time product. */
	subscription?: SubscriptionTerms;
	/** The product's payment link. */
	paymentLink?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
}

/** A subscription product's terms. */
export interface SubscriptionTerms {
	/** How often it bills (e.g. `{value: 1, unit: 'months'}`: 30 days). */
	frequency: Duration;
	/** A free trial before the first bill; absent without one. */
	trialPeriod?: Duration;
	/** The periods the customer commits to before cancelling; absent without a minimum. */
	minPeriods?: number;
}

/** Sets a subscription product's terms (each optional on an update). */
export interface SubscriptionTermsParams {
	/**
	 * How often it bills: at least 1 unit, at most 1 year (the API also requires at least 1 hour
	 * in live mode, 5 minutes in test mode). Required on a create.
	 */
	frequency?: Duration;
	/** A free trial before the first bill (`{value: 0}`: none). */
	trialPeriod?: Duration;
	/** The periods the customer commits to before cancelling, at most 1000 (0: none). */
	minPeriods?: number;
}

/** Creates a product (`products.create`). */
export interface CreateProductParams {
	/** Required: 2 to 100 characters, one line. */
	name: string;
	/** Optional: 2 to 500 characters. */
	description?: string;
	/** Required, in USD, above 0 (at most 5 in test mode). */
	price: number;
	/** Your reference, unique per space; generated when absent. */
	reference?: string;
	/** Makes it a subscription product (`frequency` required). */
	subscription?: SubscriptionTermsParams;
}

/** Updates a product (`products.update`): fields left out are unchanged. */
export interface UpdateProductParams {
	/** The new name. */
	name?: string;
	/** The new description; `''` clears it. */
	description?: string;
	/** The new price in USD, above 0: for new checkouts and subscribers only. */
	price?: number;
	/** `false` hides the product from `products.list`, `true` lists it again. */
	isActive?: boolean;
	/** Sets (or changes) the subscription terms; a one-time product needs `frequency`. */
	subscription?: SubscriptionTermsParams;
	/** Makes it a one-time product (not with `subscription`). */
	removeSubscription?: boolean;
}

/** Filters `products.list`. */
export interface ProductListParams {
	/** List the hidden products too (`isActive` false). */
	includeHidden?: boolean;
	/** Only the subscription products (`true`) or the one-time ones (`false`). */
	subscription?: boolean;
}
