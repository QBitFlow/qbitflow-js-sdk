import { CursorData, CursorDataResponse, getCursorData } from '../types';
import { RefundEntry } from '../types/refund';
import { cursorQueryBuilder } from '../utils';
import { Request } from './Request';

/**
 * Refund requests
 */
export class RefundRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/refunds';

	/**
	 * Get the refund associated with a transaction.
	 * This endpoint is public and does not require authentication.
	 *
	 * @param transactionUUID - UUID of the original transaction
	 * @returns Refund entry
	 *
	 * @example
	 * ```typescript
	 * const refund = await client.refunds.getByTransaction('tx-uuid');
	 * console.log(refund.status, refund.reason);
	 * ```
	 */
	async getByTransaction(transactionUUID: string): Promise<RefundEntry> {
		return this.getReq<RefundEntry>(
			`${ RefundRequests.BASE_ROUTE }/by-transaction/${ transactionUUID }`
		);
	}

	/**
	 * Get all active refunds for your organization
	 * @returns List of active refund entries
	 *
	 * @example
	 * ```typescript
	 * const refunds = await client.refunds.getAll();
	 * refunds.forEach(r => console.log(r.uuid, r.status));
	 * ```
	 */
	async getAll(): Promise<RefundEntry[]> {
		return this.getReq<RefundEntry[]>(`${ RefundRequests.BASE_ROUTE }/all`);
	}

	/**
	 * Get inactive (resolved) refunds for your organization with cursor-based pagination
	 * @param options - Pagination options
	 * @returns Paginated list of inactive refund entries
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
		const partial = await this.getReq<CursorDataResponse<RefundEntry>>(
			`${ RefundRequests.BASE_ROUTE }/all/inactive`,
			params
		);
		return getCursorData(partial);
	}
}
