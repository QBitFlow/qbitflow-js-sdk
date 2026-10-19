import { type Core, path } from '../core.js';
import type { Page } from '../models/common.js';
import type { CreateRefundParams, Refund, RefundListParams } from '../models/refunds.js';
import { iteratePages } from '../pagination.js';
import { createRefundBody, refundListQuery } from '../params.js';
import { page, RefundSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathTxId } from '../validate.js';

/** Lists, reads and creates refunds (`/refunds…`). Reach it as `client.refunds`. */
export class RefundsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's refunds (`GET /refunds`; newest first, page size 20 by default, at
	 * most 100). `status` keeps the given statuses (`['pending']`: the ones awaiting an answer;
	 * absent: every status); `txUuid` the refund of one transaction. From the organization's space
	 * the members' refunds are included by default (`includeMembers: false` leaves them out);
	 * `userUuid` reads one member's; `held` filters on held transactions. {@link iterate} walks
	 * every page.
	 */
	async list(params?: RefundListParams, options?: RequestOptions): Promise<Page<Refund>> {
		const query = refundListQuery(params);
		return this.core.call(
			page(RefundSchema),
			{ method: 'GET', path: '/refunds', query },
			options
		);
	}

	/**
	 * Walks every refund {@link list} returns, fetching the pages lazily and keeping the filters
	 * and the page size. An error ends the walk.
	 */
	iterate(params?: RefundListParams, options?: RequestOptions): AsyncIterableIterator<Refund> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * A refund by its id (`GET /refunds/:uuid`; `refund@…` or the bare UUID). Another space's
	 * refund is a `NotFoundError`.
	 */
	async get(uuid: string, options?: RequestOptions): Promise<Refund> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			RefundSchema,
			{ method: 'GET', path: path('/refunds/:', ['uuid', uuid]) },
			options
		);
	}

	/**
	 * Starts a refund of a payment (`pay@…`) or a bill (`sub-hist@…`) of the space
	 * (`POST /refunds`, 201). Sends an `Idempotency-Key` and is retried on transient failures. It
	 * creates a pending refund, a draft that blocks nothing: no money moves until the merchant
	 * signs the transfer in the dashboard, and a new refund of the same transaction replaces it.
	 * `refundPercent` (default `"100"`) applies to everything the customer paid, network fee
	 * included, rounded down.
	 *
	 * Errors: 404 for a transaction outside the space; 400 `validation_failed` (`refundPercent`,
	 * or a refund rounding to nothing); 409 `refund_already_exists` (`details.refundUuid`: one
	 * refund per transaction, whatever it became; only an unsent draft gives way) or
	 * `held_funds_released` (a held payment already released to its member); a member's key needs
	 * the `members.refunds` policy (403 `policy_disabled`).
	 */
	async create(params: CreateRefundParams, options?: RequestOptions): Promise<Refund> {
		const body = createRefundBody(params);
		return this.core.call(
			RefundSchema,
			{ method: 'POST', path: '/refunds', body, idempotent: true },
			options
		);
	}
}
