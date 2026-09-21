/**
 * Currency types for cryptocurrency payments
 */

/**
 * Represents a cryptocurrency
 */
export interface Currency {
	/** Unique identifier for the currency */
	id: number;
	/** Currency symbol (e.g., BTC, ETH) */
	symbol: string;
	/** Full name of the currency */
	name: string;
	/** Number of decimal places */
	decimals: number;
	/** Identifier of the main currency (if this is a sub-currency, meaning token) */
	mainCurrencyId?: number;
	/** Details of the main currency (if applicable) */
	mainCurrency?: Currency;
	/** Whether this is a test currency */
	test: boolean;
}
