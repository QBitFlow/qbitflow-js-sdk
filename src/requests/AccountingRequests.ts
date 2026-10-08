import { Request } from './Request';
import { AccountingEvent } from '../types/accounting';
import { ValidationException } from '../exceptions';

/**
 * Accounting export requests
 */
export class AccountingRequests extends Request {
	private static readonly BASE_ROUTE = '/accounting';

	/**
	 * Export accounting data for a date range.
	 *
	 * Returns an array of {@link AccountingEvent} objects when format is `'json'`,
	 * or a raw CSV string when format is `'csv'`.
	 *
	 * @param from - Start date in YYYY-MM-DD format (inclusive)
	 * @param to - End date in YYYY-MM-DD format (inclusive)
	 * @param format - Response format: `'json'` or `'csv'`
	 * @returns Accounting events as JSON array or CSV string
	 *
	 * @example
	 * ```typescript
	 * // JSON
	 * const events = await client.accounting.export('2024-01-01', '2024-01-31', 'json') as AccountingEvent[];
	 * events.forEach(e => console.log(e.paymentId, e.netAmountUsd));
	 *
	 * // CSV
	 * const csv = await client.accounting.export('2024-01-01', '2024-01-31', 'csv') as string;
	 * fs.writeFileSync('export.csv', csv);
	 * ```
	 */
	async export(from: string, to: string, format: 'csv' | 'json'): Promise<AccountingEvent[] | string> {
		if (!from || !to) {
			throw new ValidationException('from and to dates are required (YYYY-MM-DD)');
		}

		const params = { from, to, format };

		if (format === 'csv') {
			return this.getReq<string>(
				`${AccountingRequests.BASE_ROUTE}/export`,
				params,
				{ responseType: 'text' }
			);
		}

		return this.getReq<AccountingEvent[]>(`${AccountingRequests.BASE_ROUTE}/export`, params);
	}
}
