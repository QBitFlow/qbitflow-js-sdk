import { type Core, path } from '../core.js';
import type { Page, ReadParams } from '../models/common.js';
import type {
	Failure,
	FailureListParams,
	Payment,
	PaymentListParams,
	Transaction,
	TransactionListParams,
} from '../models/payments.js';
import { iteratePages } from '../pagination.js';
import { failureListQuery, paymentListQuery, readQuery, transactionListQuery } from '../params.js';
import { FailureSchema, page, PaymentSchema, TransactionSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathTxId } from '../validate.js';

/** Reads the one-time payments (`/payments…`). Reach it as `client.payments`. */
export class PaymentsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's one-time payments (`GET /payments`; newest first, page size 20 by
	 * default, at most 100). A payment exists once its transaction is confirmed. Filters:
	 * customer, product, creation window (both bounds excluded), `reference`, `refunded`, and
	 * `includeMembers` or `userUuid` (organization key without `onBehalfOf`). {@link iterate}
	 * walks every page.
	 */
	async list(params?: PaymentListParams, options?: RequestOptions): Promise<Page<Payment>> {
		const query = paymentListQuery(params);
		return this.core.call(
			page(PaymentSchema),
			{ method: 'GET', path: '/payments', query },
			options
		);
	}

	/**
	 * Walks every payment {@link list} returns, fetching the pages lazily from `params.cursor` (or
	 * the first page) and keeping the filters and the page size. An error ends the walk.
	 */
	iterate(params?: PaymentListParams, options?: RequestOptions): AsyncIterableIterator<Payment> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * A one-time payment by its id (`GET /payments/:uuid`; `pay@…` or the bare UUID).
	 * `includeMembers` reads a member's payment from the organization's space. A payment not
	 * confirmed yet (read its checkout session), or another space's, is a `NotFoundError`.
	 */
	async get(uuid: string, params?: ReadParams, options?: RequestOptions): Promise<Payment> {
		checkPathTxId('uuid', uuid);
		const query = readQuery(params);
		return this.core.call(
			PaymentSchema,
			{ method: 'GET', path: path('/payments/:', ['uuid', uuid]), query },
			options
		);
	}

	/**
	 * The space's one-time payment with the reference given to its checkout session: runs
	 * {@link list}'s reference filter (`GET /payments?reference=`) and returns its one payment. No
	 * payment with that reference (none, or not confirmed yet) is a `NotFoundError` (status 404,
	 * code `not_found`).
	 */
	async getByReference(reference: string, options?: RequestOptions): Promise<Payment> {
		return this.core.getByReference(PaymentSchema, '/payments', 'payment', reference, options);
	}
}

/**
 * Reads the transactions feed (`/transactions`): the one-time payments and the subscriptions'
 * bills together. Reach it as `client.transactions`.
 */
export class TransactionsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the transactions feed (`GET /transactions`; newest first, page size 20 by
	 * default, at most 100): the one-time payments and the subscriptions' bills together, each
	 * row with its `type` (`payment` or `bill`). It takes the payment lists' filters plus `type`,
	 * `subscriptionUuid` (one subscription's bills) and `refunded`. {@link iterate} walks every
	 * page.
	 */
	async list(
		params?: TransactionListParams,
		options?: RequestOptions
	): Promise<Page<Transaction>> {
		const query = transactionListQuery(params);
		return this.core.call(
			page(TransactionSchema),
			{ method: 'GET', path: '/transactions', query },
			options
		);
	}

	/**
	 * Walks every row {@link list} returns, fetching the pages lazily and keeping the filters and
	 * the page size. An error ends the walk.
	 */
	iterate(
		params?: TransactionListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Transaction> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}
}

/** Reads the failed payment attempts (`/payment-failures`). Reach it as `client.failures`. */
export class FailuresService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the failed payment attempts (`GET /payment-failures`; newest first, page size
	 * 20 by default, at most 100): failed attempts never moved money. It takes the payment lists'
	 * filters plus `kind`, `category` and `subscriptionUuid`.
	 */
	async list(params?: FailureListParams, options?: RequestOptions): Promise<Page<Failure>> {
		const query = failureListQuery(params);
		return this.core.call(
			page(FailureSchema),
			{ method: 'GET', path: '/payment-failures', query },
			options
		);
	}

	/**
	 * Walks every failure {@link list} returns, fetching the pages lazily and keeping the filters
	 * and the page size. An error ends the walk.
	 */
	iterate(params?: FailureListParams, options?: RequestOptions): AsyncIterableIterator<Failure> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}
}
