import { type Core, path } from '../core.js';
import type { Page, ReadParams } from '../models/common.js';
import type {
	CombinedPayment,
	CombinedPaymentListParams,
	Failure,
	FailureListParams,
	Payment,
	PaymentListParams,
} from '../models/payments.js';
import { iteratePages } from '../pagination.js';
import {
	combinedPaymentListQuery,
	failureListQuery,
	paymentListQuery,
	readQuery,
} from '../params.js';
import { CombinedPaymentSchema, FailureSchema, page, PaymentSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathRequired, checkPathTxId } from '../validate.js';

/** Reads the one-time payments and the combined feed of payments and bills. Reach it as `client.payments`. */
export class PaymentsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's one-time payments (`GET /transaction/payments`; newest first, page
	 * size 10 by default, at most 50). A payment exists once its transaction is confirmed.
	 * Filters: customer, product, creation window (both bounds excluded), `refunded`, and
	 * `includeMembers` or `userUuid` (organization key without `onBehalfOf`).
	 */
	async list(params?: PaymentListParams, options?: RequestOptions): Promise<Page<Payment>> {
		const query = paymentListQuery(params);
		return this.core.call(
			page(PaymentSchema),
			{ method: 'GET', path: '/transaction/payments', query },
			options
		);
	}

	/** Walks every payment `list` returns, lazily, keeping the filters and the page size. */
	iterate(params?: PaymentListParams, options?: RequestOptions): AsyncIterableIterator<Payment> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * One page of the combined feed of one-time payments and subscription bills
	 * (`GET /transaction/payments/combined`; newest first, page size 10 by default, at most 50),
	 * with `list`'s filters plus `source` and `subscriptionUuid`.
	 */
	async listCombined(
		params?: CombinedPaymentListParams,
		options?: RequestOptions
	): Promise<Page<CombinedPayment>> {
		const query = combinedPaymentListQuery(params);
		return this.core.call(
			page(CombinedPaymentSchema),
			{ method: 'GET', path: '/transaction/payments/combined', query },
			options
		);
	}

	/** Walks every row `listCombined` returns, lazily, keeping the filters and the page size. */
	iterateCombined(
		params?: CombinedPaymentListParams,
		options?: RequestOptions
	): AsyncIterableIterator<CombinedPayment> {
		return iteratePages(params?.cursor, (cursor) =>
			this.listCombined({ ...params, cursor }, options)
		);
	}

	/**
	 * A one-time payment by its id (`GET /transaction/payment/:uuid`; `pay@…` or the bare UUID).
	 * `includeMembers` reads a member's payment from the organization's space. A payment not
	 * confirmed yet, or another space's, is a `NotFoundError`.
	 */
	async get(uuid: string, params?: ReadParams, options?: RequestOptions): Promise<Payment> {
		checkPathTxId('uuid', uuid);
		const query = readQuery(params);
		return this.core.call(
			PaymentSchema,
			{ method: 'GET', path: path('/transaction/payment/:', ['uuid', uuid]), query },
			options
		);
	}

	/**
	 * A one-time payment by the reference given to its checkout session
	 * (`GET /transaction/payment/reference/:reference`), sent escaped.
	 */
	async getByReference(reference: string, options?: RequestOptions): Promise<Payment> {
		checkPathRequired('reference', reference);
		return this.core.call(
			PaymentSchema,
			{
				method: 'GET',
				path: path('/transaction/payment/reference/:', ['reference', reference]),
			},
			options
		);
	}
}

/** Reads the failed payment attempts (`/transaction/failures`). Reach it as `client.failures`. */
export class FailuresService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the failed payment attempts (`GET /transaction/failures`; newest first, page
	 * size 10 by default, at most 50): failed attempts never moved money. The payment lists'
	 * filters plus `kind`, `category` and `subscriptionUuid`.
	 */
	async list(params?: FailureListParams, options?: RequestOptions): Promise<Page<Failure>> {
		const query = failureListQuery(params);
		return this.core.call(
			page(FailureSchema),
			{ method: 'GET', path: '/transaction/failures', query },
			options
		);
	}

	/** Walks every failure `list` returns, lazily, keeping the filters and the page size. */
	iterate(params?: FailureListParams, options?: RequestOptions): AsyncIterableIterator<Failure> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}
}
