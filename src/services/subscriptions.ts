import { type Core, path } from '../core.js';
import { list } from '../decode.js';
import type { Page, ReadParams } from '../models/common.js';
import type { Bill } from '../models/payments.js';
import type {
	BillingState,
	BillListParams,
	CancelSubscriptionParams,
	Subscription,
	SubscriptionCancellation,
	SubscriptionListParams,
} from '../models/subscriptions.js';
import { iteratePages } from '../pagination.js';
import {
	billListQuery,
	cancelSubscriptionQuery,
	readQuery,
	subscriptionListQuery,
} from '../params.js';
import { BillingStateSchema, BillSchema, page, SubscriptionSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathRequired, checkPathTxId } from '../validate.js';

/**
 * Reads subscriptions and their bills, cancels them, and runs a test billing
 * (`/transaction/subscription…`). Reach it as `client.subscriptions`.
 *
 * Grant access while `now < subscription.currentPeriodEnd`, whatever the status.
 */
export class SubscriptionsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's subscriptions (`GET /transaction/subscriptions`; newest first,
	 * cancelled ones included, page size 20 by default, at most 100). Filters: `status`,
	 * `reference`, customer, product, creation window, and `includeMembers` or `userUuid`.
	 */
	async list(
		params?: SubscriptionListParams,
		options?: RequestOptions
	): Promise<Page<Subscription>> {
		const query = subscriptionListQuery(params);
		return this.core.call(
			page(SubscriptionSchema),
			{ method: 'GET', path: '/transaction/subscriptions', query },
			options
		);
	}

	/** Walks every subscription `list` returns, lazily, keeping the filters and the page size. */
	iterate(
		params?: SubscriptionListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Subscription> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * A subscription by its id (`GET /transaction/subscription/:uuid`; `sub@…` or the bare UUID),
	 * whatever its status (a cancelled one too). Before its checkout completes it is a
	 * `NotFoundError`: read the checkout session instead.
	 */
	async get(uuid: string, params?: ReadParams, options?: RequestOptions): Promise<Subscription> {
		checkPathTxId('uuid', uuid);
		const query = readQuery(params);
		return this.core.call(
			SubscriptionSchema,
			{ method: 'GET', path: path('/transaction/subscription/:', ['uuid', uuid]), query },
			options
		);
	}

	/**
	 * A subscription by the reference given to its checkout session
	 * (`GET /transaction/subscription/reference/subscription/:reference`), whatever its status.
	 */
	async getByReference(reference: string, options?: RequestOptions): Promise<Subscription> {
		checkPathRequired('reference', reference);
		return this.core.call(
			SubscriptionSchema,
			{
				method: 'GET',
				path: path('/transaction/subscription/reference/subscription/:', [
					'reference',
					reference,
				]),
			},
			options
		);
	}

	/**
	 * One page of a subscription's bills (`GET /transaction/subscription/:uuid/bills`; newest
	 * first, page size 20 by default, at most 100).
	 */
	async listBills(
		uuid: string,
		params?: BillListParams,
		options?: RequestOptions
	): Promise<Page<Bill>> {
		checkPathTxId('uuid', uuid);
		const query = billListQuery(params);
		return this.core.call(
			page(BillSchema),
			{
				method: 'GET',
				path: path('/transaction/subscription/:/bills', ['uuid', uuid]),
				query,
			},
			options
		);
	}

	/** Walks every bill of a subscription, lazily, keeping the page size. */
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
	 * One bill by its id (`GET /transaction/subscription/bill/:uuid`; `sub-hist@…` or the bare
	 * UUID). `includeMembers` reads a member's from the organization's space.
	 */
	async getBill(billUuid: string, params?: ReadParams, options?: RequestOptions): Promise<Bill> {
		checkPathTxId('billUuid', billUuid);
		const query = readQuery(params);
		return this.core.call(
			BillSchema,
			{
				method: 'GET',
				path: path('/transaction/subscription/bill/:', ['billUuid', billUuid]),
				query,
			},
			options
		);
	}

	/**
	 * A subscription's 10 most recent bills, newest first, as its customer's page shows them
	 * (`GET /transaction/subscription/history/:subscriptionUuid`, a public route; not paginated).
	 * The fields the API only returns to the subscription's owner (`metadata`, `customerUuid`,
	 * `customerReference`, `userUuid`, …) are empty here: use `listBills` for the full bills.
	 */
	async getPublicHistory(subscriptionUuid: string, options?: RequestOptions): Promise<Bill[]> {
		checkPathTxId('subscriptionUuid', subscriptionUuid);
		return this.core.call(
			list(BillSchema),
			{
				method: 'GET',
				path: path('/transaction/subscription/history/:', [
					'subscriptionUuid',
					subscriptionUuid,
				]),
			},
			options
		);
	}

	/**
	 * Cancels a subscription without its customer signing
	 * (`POST /transaction/subscription/processing/force-cancel/:uuid`). Not retried.
	 *
	 * By default (`immediate` absent or `true`) it is cancelled at once (status `cancelled`,
	 * `cancellationReason` `merchant`); `immediate: false` stops it now (status `stopped`) and
	 * cancels it at the end of its paid period. `pending` is true when the API answered 202: the
	 * on-chain cancel is still confirming and `subscription.statusChanged` tells the end.
	 *
	 * Errors: 404 for a cancelled or another space's subscription; 409
	 * `subscription_already_stopped_or_inactive`; 400 for a trial with `immediate: false`.
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
			{
				method: 'POST',
				path: path('/transaction/subscription/processing/force-cancel/:', ['uuid', uuid]),
				query,
			},
			options
		);
		return { subscription: value, pending: status === 202 };
	}

	/**
	 * Bills a test subscription now
	 * (`POST /transaction/subscription/processing/execute-billing/:uuid`) and returns the test
	 * bill's billing state. Test mode only (a live subscription is refused with a 400). Not retried.
	 */
	async executeTestBilling(uuid: string, options?: RequestOptions): Promise<BillingState> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			BillingStateSchema,
			{
				method: 'POST',
				path: path('/transaction/subscription/processing/execute-billing/:', [
					'uuid',
					uuid,
				]),
			},
			options
		);
	}
}
