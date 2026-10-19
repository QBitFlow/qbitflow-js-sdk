import { type Core, path } from '../core.js';
import type { Page, ReadParams } from '../models/common.js';
import type { Bill } from '../models/payments.js';
import type {
	BillListParams,
	CancelSubscriptionParams,
	Subscription,
	SubscriptionCancellation,
	SubscriptionListParams,
	TestBill,
	UpdateSubscriptionParams,
} from '../models/subscriptions.js';
import { iteratePages } from '../pagination.js';
import {
	cancelSubscriptionQuery,
	pageQuery,
	readQuery,
	subscriptionListQuery,
	updateSubscriptionBody,
} from '../params.js';
import { BillSchema, page, SubscriptionSchema, TestBillSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathTxId } from '../validate.js';

/**
 * Reads subscriptions and their bills, updates their metadata, cancels them, and runs a test
 * bill (`/subscriptions…`, `/bills…`). Reach it as `client.subscriptions`.
 *
 * Grant access while `now < subscription.currentPeriodEnd`, whatever the status
 * (`hasAccess(subscription)`).
 */
export class SubscriptionsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's subscriptions (`GET /subscriptions`; newest first, cancelled ones
	 * included, page size 20 by default, at most 100). A checkout not completed yet is no
	 * subscription. Filters: `status`, `reference`, customer, product, creation window, and
	 * `includeMembers` or `userUuid` (organization key). {@link iterate} walks every page.
	 */
	async list(
		params?: SubscriptionListParams,
		options?: RequestOptions
	): Promise<Page<Subscription>> {
		const query = subscriptionListQuery(params);
		return this.core.call(
			page(SubscriptionSchema),
			{ method: 'GET', path: '/subscriptions', query },
			options
		);
	}

	/**
	 * Walks every subscription {@link list} returns, fetching the pages lazily and keeping the
	 * filters and the page size. An error ends the walk.
	 */
	iterate(
		params?: SubscriptionListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Subscription> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * A subscription by its id (`GET /subscriptions/:uuid`; `sub@…` or the bare UUID), whatever
	 * its status (a cancelled one too). `includeMembers` reads a member's from the organization's
	 * space. Before its checkout completes it is a `NotFoundError`: read the checkout session
	 * instead.
	 */
	async get(uuid: string, params?: ReadParams, options?: RequestOptions): Promise<Subscription> {
		checkPathTxId('uuid', uuid);
		const query = readQuery(params);
		return this.core.call(
			SubscriptionSchema,
			{ method: 'GET', path: path('/subscriptions/:', ['uuid', uuid]), query },
			options
		);
	}

	/**
	 * The space's subscription with the reference given to its checkout session, whatever its
	 * status: runs {@link list}'s reference filter (`GET /subscriptions?reference=`) and returns
	 * its one subscription. No subscription with that reference is a `NotFoundError` (status 404,
	 * code `not_found`).
	 */
	async getByReference(reference: string, options?: RequestOptions): Promise<Subscription> {
		return this.core.getByReference(
			SubscriptionSchema,
			'/subscriptions',
			'subscription',
			reference,
			options
		);
	}

	/**
	 * Changes a subscription's metadata (`PATCH /subscriptions/:uuid`), merged into its own (a key
	 * set to `''` deletes it; at most 50 keys once merged), cancelled ones too, and returns the
	 * subscription. Its price, terms and status don't change here. A member's key needs the
	 * organization's `members.subscriptions` policy (403 `policy_disabled`). Not retried.
	 */
	async update(
		uuid: string,
		params: UpdateSubscriptionParams,
		options?: RequestOptions
	): Promise<Subscription> {
		checkPathTxId('uuid', uuid);
		const body = updateSubscriptionBody(params);
		return this.core.call(
			SubscriptionSchema,
			{ method: 'PATCH', path: path('/subscriptions/:', ['uuid', uuid]), body },
			options
		);
	}

	/**
	 * One page of a subscription's bills (`GET /subscriptions/:uuid/bills`; newest first, page
	 * size 20 by default, at most 100). {@link iterateBills} walks every page.
	 */
	async listBills(
		uuid: string,
		params?: BillListParams,
		options?: RequestOptions
	): Promise<Page<Bill>> {
		checkPathTxId('uuid', uuid);
		const query = pageQuery(params);
		return this.core.call(
			page(BillSchema),
			{ method: 'GET', path: path('/subscriptions/:/bills', ['uuid', uuid]), query },
			options
		);
	}

	/**
	 * Walks every bill of a subscription, fetching the pages lazily and keeping the page size. An
	 * error ends the walk.
	 */
	iterateBills(
		uuid: string,
		params?: BillListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Bill> {
		return iteratePages(params?.cursor, (cursor) =>
			this.listBills(uuid, { ...params, cursor }, options)
		);
	}

	/**
	 * One bill by its id (`GET /bills/:uuid`; `sub-hist@…` or the bare UUID). `includeMembers`
	 * reads a member's from the organization's space.
	 */
	async getBill(billUuid: string, params?: ReadParams, options?: RequestOptions): Promise<Bill> {
		checkPathTxId('billUuid', billUuid);
		const query = readQuery(params);
		return this.core.call(
			BillSchema,
			{ method: 'GET', path: path('/bills/:', ['billUuid', billUuid]), query },
			options
		);
	}

	/**
	 * Cancels a subscription without its customer signing (`POST /subscriptions/:uuid/cancel`).
	 * Not retried.
	 *
	 * By default (`immediate` absent or `true`) it is cancelled at once (status `cancelled`,
	 * `cancellationReason` `merchant`). `immediate: false` stops it now (status `stopped`, never
	 * billed again) and cancels it when its paid period ends. The answer is the subscription as
	 * the cancellation left it; `pending` is true when the API answered 202: the on-chain cancel
	 * is still confirming, the status is not updated yet, and `subscription.statusChanged` tells
	 * the end (the cancellation goes on whatever happens).
	 *
	 * Errors: 404 for a cancelled or another space's subscription; 409
	 * `subscription_already_stopped_or_inactive` (`immediate: false` on a stopped one); 400 on
	 * `immediate` for a trial with `immediate: false`; 409 `tx_already_sent` while a cancellation
	 * runs.
	 */
	async cancel(
		uuid: string,
		params?: CancelSubscriptionParams,
		options?: RequestOptions
	): Promise<SubscriptionCancellation> {
		checkPathTxId('uuid', uuid);
		const query = cancelSubscriptionQuery(params);
		const { value, status } = await this.core.callStatus(
			SubscriptionSchema,
			{ method: 'POST', path: path('/subscriptions/:/cancel', ['uuid', uuid]), query },
			options
		);
		return { subscription: value, pending: status === 202 };
	}

	/**
	 * Bills a test subscription now (`POST /subscriptions/:uuid/test-bill`) and returns where the
	 * test bill stands once its attempt settled (done, waiting after a failure, or still running
	 * after 2 minutes). Its events are a live bill's. Test mode only: a live subscription is a
	 * `BadRequestError` (400 `test_mode_only`); a bill not due yet is a 409 `payment_not_due`. Not
	 * retried.
	 */
	async testBill(uuid: string, options?: RequestOptions): Promise<TestBill> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			TestBillSchema,
			{ method: 'POST', path: path('/subscriptions/:/test-bill', ['uuid', uuid]) },
			options
		);
	}
}
