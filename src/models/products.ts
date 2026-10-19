/**
 * Products.
 *
 * @module
 */

import type { Duration, PageParams } from './common.js';

/**
 * Something a merchant sells: a one-time product, or a subscription product with its terms. Its
 * payment link opens a checkout of it.
 */
export interface Product {
	/** The product's id (a UUIDv7). */
	uuid: string;
	/** Its name. */
	name: string;
	/** Its description; absent without one. */
	description?: string;
	/**
	 * Its price in USD, a decimal string (`"12.5"`): what a checkout of the product charges
	 * before its fees (per period for a subscription product).
	 */
	priceUsd: string;
	/** When it was created. */
	createdAt: string;
	/**
	 * False for a hidden product: out of `products.list` unless `includeHidden`, still readable
	 * and editable by uuid. Hidden are the inline products of subscription checkouts, those of a
	 * removed member or a closed organization, and those hidden with `update`.
	 */
	isActive: boolean;
	/** The merchant's reference, unique per space and mode (the uuid when none was given). */
	reference: string;
	/**
	 * The merchant's own data on the product (never copied onto its checkouts, payments or
	 * subscriptions); `{}` without any.
	 */
	metadata: Record<string, string>;
	/**
	 * A subscription product's terms (the defaults of its subscription checkouts); absent for a
	 * one-time product.
	 */
	subscription?: SubscriptionTerms;
	/** The product's shareable link: opening it starts a checkout of the product. */
	paymentLink?: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose space it is in; absent for the organization's own. */
	userUuid?: string;
}

/**
 * A subscription product's terms: billed every `frequency`, after an optional free trial, for at
 * least an optional number of periods.
 */
export interface SubscriptionTerms {
	/** How often it bills (e.g. `{value: 1, unit: 'months'}`: 30 days). */
	frequency: Duration;
	/** A free trial before the first bill; absent without one. */
	trialPeriod?: Duration;
	/** The periods the customer commits to before they can cancel; absent without a minimum. */
	minPeriods?: number;
}

/**
 * Sets subscription terms (a product's, or a subscription checkout's over its product's): each
 * field given replaces the base's, each field left out keeps it.
 */
export interface SubscriptionTermsParams {
	/**
	 * How often it bills: at least 1 unit, at most 1 year (the API also requires at least 1 hour
	 * in live mode, 5 minutes in test mode).
	 */
	frequency?: Duration;
	/** A free trial before the first bill (`{value: 0}`: none, removing one). */
	trialPeriod?: Duration;
	/** The periods the customer commits to before cancelling, at most 1000 (0: none, removing one). */
	minPeriods?: number;
}

/** Creates a product (`products.create`). */
export interface CreateProductParams {
	/** Required: 2 to 100 characters, one line. */
	name: string;
	/** Optional: 2 to 500 characters. */
	description?: string;
	/**
	 * Required: the price in USD, a decimal **string** (`"12.50"`): above 0, at most 2 decimals,
	 * at most 1,000,000. The API also caps it at `"5"` in test mode (400 with `details.max`
	 * `"5"`) and requires more than `"0.25"` for a live subscription product (`details.min`).
	 */
	priceUsd: string;
	/**
	 * Your reference, unique per space and mode (1 to 100 of `A-Z a-z 0-9 . _ : @ -`); the
	 * product's uuid when absent.
	 */
	reference?: string;
	/** Makes it a subscription product (`frequency` required); absent: a one-time product. */
	subscription?: SubscriptionTermsParams;
	/**
	 * Your own data on the product (an id in your catalog): at most 50 keys of 1 to 40 characters
	 * among `A-Z a-z 0-9 _ - . :`, values of at most 500 characters without control or
	 * bidirectional characters. A key set to `''` is not stored. Never put secrets or personal
	 * data in it.
	 */
	metadata?: Record<string, string>;
}

/** Updates a product (`products.update`): fields left out are unchanged. The reference cannot change. */
export interface UpdateProductParams {
	/** The new name, 2 to 100 characters (absent or `''` = unchanged). */
	name?: string;
	/** The new description (2 to 500 characters); `''` clears it, absent leaves it unchanged. */
	description?: string;
	/**
	 * The new price in USD, a decimal string as at creation (absent or `''` = unchanged): for
	 * new checkouts and subscribers only (a subscription keeps the price it was subscribed at).
	 */
	priceUsd?: string;
	/** `false` hides the product from `products.list`, `true` lists it again. */
	isActive?: boolean;
	/**
	 * Sets (or changes) the subscription terms, field by field, for new subscribers only; a
	 * one-time product needs `frequency`.
	 */
	subscription?: SubscriptionTermsParams;
	/** Makes it a one-time product again (not with `subscription`). */
	removeSubscription?: boolean;
	/**
	 * Merged into the product's: a key set to a value sets it, a key set to `''` deletes it, keys
	 * not named are kept (absent: unchanged). At most 50 keys once merged.
	 */
	metadata?: Record<string, string>;
}

/** Filters `products.list`. */
export interface ProductListParams extends PageParams {
	/** List the hidden products too (`isActive` false). */
	includeHidden?: boolean;
	/** Only the subscription products (`true`) or the one-time ones (`false`). */
	subscription?: boolean;
	/**
	 * Only the product with this reference, hidden or not (a page of 0 or 1 product;
	 * `products.getByReference` reads it).
	 */
	reference?: string;
}
