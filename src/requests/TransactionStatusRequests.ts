import { TransactionStatusSchema } from '../schemas.js';
import { TransactionStatus, TransactionType } from '../types/index.js';
import { requireNonEmpty } from '../utils/index.js';
import { Request } from './Request.js';

/**
 * Transaction status requests.
 *
 * To follow a transaction as it progresses, use webhooks (recommended — QBitFlow notifies
 * you when a checkout completes) or poll {@link TransactionStatusRequests.get}.
 */
export class TransactionStatusRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/status';

	/**
	 * Get the current status of a transaction
	 * @param transactionUuid - Transaction UUID
	 * @param transactionType - Type of transaction (a `TransactionType` member or its string value)
	 * @returns Current transaction status
	 * @throws {ValidationException} When `transactionUuid` or `transactionType` is empty
	 * @throws {NotFoundException} When the transaction has not been processed yet (or is unknown)
	 *
	 * @example
	 * ```typescript
	 * const status = await client.transactionStatus.get('pay@…', TransactionType.ONE_TIME_PAYMENT);
	 * console.log(status.status, status.txHash);
	 * ```
	 */
	async get(
		transactionUuid: string,
		transactionType: TransactionType | `${TransactionType}`
	): Promise<TransactionStatus> {
		requireNonEmpty('transactionUuid', transactionUuid);
		requireNonEmpty('transactionType', transactionType);

		return this.getJson(TransactionStatusSchema, TransactionStatusRequests.BASE_ROUTE, {
			txUUID: transactionUuid,
			txType: transactionType,
		});
	}
}
