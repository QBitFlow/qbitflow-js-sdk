import { list } from '../decode.js';
import { CurrencySchema } from '../schemas.js';
import { Currency } from '../types/currency.js';
import { Request } from './Request.js';

/**
 * Handler for supported-currency lookups.
 *
 * These endpoints are public (no authentication required); use them to resolve the
 * currency IDs returned in `SessionCheckout.availableCurrencies`.
 */
export class CurrencyRequests extends Request {
	private static readonly BASE_ROUTE = '/utils';

	/**
	 * Get all supported currencies, native currencies and tokens alike.
	 * @param test - Pass `true` to list test-network currencies (defaults to `false`)
	 * @returns List of currencies
	 *
	 * @example
	 * ```typescript
	 * const currencies = await client.currencies.getAllAvailable();
	 * const byId = new Map(currencies.map((c) => [c.id, c]));
	 * ```
	 */
	async getAllAvailable(test = false): Promise<Currency[]> {
		return this.getJson(
			list(CurrencySchema),
			`${CurrencyRequests.BASE_ROUTE}/all-available-currencies`,
			{ test }
		);
	}

	/**
	 * Get only the main (native / blockchain) currencies, excluding tokens.
	 * @param test - Pass `true` to list test-network currencies (defaults to `false`)
	 * @returns List of main currencies
	 */
	async getAllMain(test = false): Promise<Currency[]> {
		return this.getJson(
			list(CurrencySchema),
			`${CurrencyRequests.BASE_ROUTE}/all-main-currencies`,
			{ test }
		);
	}
}
