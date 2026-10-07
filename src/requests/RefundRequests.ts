import { list } from '../decode.js';
import { cursorPage, RefundEntrySchema } from '../schemas.js';
import { CursorData, getCursorData } from '../types/index.js';
import { RefundEntry } from '../types/refund.js';
import { cursorQueryBuilder, requireNonEmpty } from '../utils/index.js';
import { Request } from './Request.js';

/**
 * Refund requests
 */
export class RefundRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/refunds';

	/**
	 * Get the refund associated with a transaction (public status lookup).
	 *
	 * @param transactionUUID - Prefixed id of the original transaction (e.g. `pay@<uuid>`)
	 * @returns Refund entry
	 * @throws {ValidationException} When `transactionUUID` is empty
	 *
	 * @example
	 * ```typescript
	 * const refund = await client.refunds.getByTransaction('pay@…');
	 * console.log(refund.status, refund.reason);
	 * ```
	 */
	async getByTransaction(transactionUUID: string): Promise<RefundEntry> {
		requireNonEmpty('transactionUUID', transactionUUID);
		return this.getJson(
			RefundEntrySchema,
			`${RefundRequests.BASE_ROUTE}/by-transaction/${encodeURIComponent(transactionUUID)}`
		);
	}

	/**
	 * Get all refunds awaiting a merchant response (`respondedAt === null`)
	 * @returns List of active refund entries
	 *
	 * @example
	 * ```typescript
	 * const refunds = await client.refunds.getAll();
	 * refunds.forEach(r => console.log(r.uuid, r.status));
	 * ```
	 */
	async getAll(): Promise<RefundEntry[]> {
		return this.getJson(list(RefundEntrySchema), `${RefundRequests.BASE_ROUTE}/all`);
	}

	/**
	 * Get handled refunds (`respondedAt !== null`) with cursor-based pagination
	 * @param options - Pagination options
	 * @returns Paginated list of inactive refund entries
	 * @throws {ValidationException} When `limit` is not a positive integer
	 *
	 * @example
	 * ```typescript
	 * const result = await client.refunds.getAllInactive({ limit: 20 });
	 * if (result.hasMore()) {
	 *   const next = await client.refunds.getAllInactive({ cursor: result.nextCursor });
	 * }
	 * ```
	 */
	async getAllInactive(options?: {
		limit?: number;
		cursor?: string | null;
	}): Promise<CursorData<RefundEntry>> {
		const params = cursorQueryBuilder(options?.limit, options?.cursor);
		const page = await this.getJson(
			cursorPage(RefundEntrySchema),
			`${RefundRequests.BASE_ROUTE}/all/inactive`,
			params
		);
		return getCursorData(page);
	}
}
