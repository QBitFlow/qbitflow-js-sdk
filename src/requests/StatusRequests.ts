import { TransactionStatus, TransactionType } from '../types';
import { Request } from './Request';

export class StatusRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/status';

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Get the status of a transaction
	 * @param transactionUUID - The transaction UUID
	 * @param transactionType - The type of transaction
	 * @returns The transaction status
	 */
	async get(
		transactionUUID: string,
		transactionType: TransactionType
	): Promise<TransactionStatus> {
		const params = {
			transactionUUID,
			transactionType,
		};

		return this.getReq<TransactionStatus>(StatusRequests.BASE_ROUTE, params);
	}
}
