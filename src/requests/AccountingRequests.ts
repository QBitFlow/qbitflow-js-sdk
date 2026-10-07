import { list } from '../decode.js';
import { AccountingEventSchema } from '../schemas.js';
import { AccountingEvent } from '../types/accounting.js';
import { validateAccountingExport } from '../utils/index.js';
import { Request } from './Request.js';

/**
 * Accounting export requests
 */
export class AccountingRequests extends Request {
	private static readonly BASE_ROUTE = '/accounting';

	/**
	 * Export accounting data for a date range.
	 *
	 * Returns an array of {@link AccountingEvent} objects when format is `'json'`, or the raw
	 * CSV text (header row included) when format is `'csv'`. The API decides how wide a window
	 * it accepts; an error response is parsed the same way for both formats.
	 *
	 * @param from - Start date in YYYY-MM-DD format (inclusive)
	 * @param to - End date in YYYY-MM-DD format (inclusive), not before `from`
	 * @param format - Response format: `'json'` or `'csv'`
	 * @returns Accounting events as a JSON array or CSV string
	 * @throws {ValidationException} When a date is malformed or not a real calendar date,
	 *   `from` is after `to`, or the format is unknown
	 *
	 * @example
	 * ```typescript
	 * // JSON
	 * const events = await client.accounting.export('2026-08-01', '2026-08-31', 'json');
	 * events.forEach(e => console.log(e.paymentId, e.netAmountUsd));
	 *
	 * // CSV
	 * const csv = await client.accounting.export('2026-08-01', '2026-08-31', 'csv');
	 * fs.writeFileSync('export.csv', csv);
	 * ```
	 */
	async export(from: string, to: string, format: 'json'): Promise<AccountingEvent[]>;
	async export(from: string, to: string, format: 'csv'): Promise<string>;
	async export(
		from: string,
		to: string,
		format: 'csv' | 'json'
	): Promise<AccountingEvent[] | string>;
	async export(
		from: string,
		to: string,
		format: 'csv' | 'json'
	): Promise<AccountingEvent[] | string> {
		validateAccountingExport(from, to, format);

		const params = { from, to, format };
		const endpoint = `${AccountingRequests.BASE_ROUTE}/export`;

		if (format === 'csv') {
			return this.getText(endpoint, params);
		}

		return this.getJson(list(AccountingEventSchema), endpoint, params);
	}
}
