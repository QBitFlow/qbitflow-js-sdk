import type { Core } from '../core.js';
import { list } from '../decode.js';
import type { Page } from '../models/common.js';
import type { InitiateRefundParams, Refund, RefundListParams } from '../models/refunds.js';
import { iteratePages } from '../pagination.js';
import { initiateRefundBody, refundListQuery } from '../params.js';
import { page, RefundSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';

/** Lists and initiates refunds (`/transaction/refunds…`). Reach it as `client.refunds`. */
export class RefundsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The refunds awaiting the merchant's answer (`GET /transaction/refunds/all`; not
	 * paginated). From the organization's space the members' refunds are included by default
	 * (`includeMembers: false` leaves them out); `userUuid` reads one member's; `held` filters on
	 * held transactions. `limit` and `cursor` are not sent.
	 */
	async list(params?: RefundListParams, options?: RequestOptions): Promise<Refund[]> {
		const query = refundListQuery(params, false);
		return this.core.call(
			list(RefundSchema),
			{ method: 'GET', path: '/transaction/refunds/all', query },
			options
		);
	}

	/**
	 * One page of the answered refunds, approved or rejected (`GET /transaction/refunds/all/inactive`;
	 * page size 10 by default, at most 50), with `list`'s filters.
	 */
	async listInactive(params?: RefundListParams, options?: RequestOptions): Promise<Page<Refund>> {
		const query = refundListQuery(params, true);
		return this.core.call(
			page(RefundSchema),
			{ method: 'GET', path: '/transaction/refunds/all/inactive', query },
			options
		);
	}

	/** Walks every refund `listInactive` returns, lazily, keeping the filters and the page size. */
	iterateInactive(
		params?: RefundListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Refund> {
		return iteratePages(params?.cursor, (cursor) =>
			this.listInactive({ ...params, cursor }, options)
		);
	}

	/**
	 * Starts a refund of a payment (`pay@…`) or a bill (`sub-hist@…`) of the space
	 * (`POST /transaction/refunds/initiate`, 201). Sends an `Idempotency-Key` and is retried on
	 * transient failures. It creates a pending refund: no money moves until the merchant signs the
	 * transfer in the dashboard. `refundPercent` (default 100) applies to everything the customer
	 * paid, network fee included, rounded down.
	 *
	 * Errors: 404 for a transaction outside the space; 400 `validation_failed`; 409
	 * `refund_already_exists` (`details.refundUuid`) or `held_funds_released`; a member's key needs
	 * the `members.refunds` policy (403 `policy_disabled`).
	 */
	async initiate(params: InitiateRefundParams, options?: RequestOptions): Promise<Refund> {
		const body = initiateRefundBody(params);
		return this.core.call(
			RefundSchema,
			{ method: 'POST', path: '/transaction/refunds/initiate', body, idempotent: true },
			options
		);
	}
}
