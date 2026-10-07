/**
 * Currency types for cryptocurrency payments
 */

/**
 * Represents a cryptocurrency. A token (e.g. USDC on Ethereum) references its main
 * (native) currency; a main currency references nothing.
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
	/** Contract/mint address for tokens; empty string for main (native) currencies */
	address: string;
	/** Identifier of the main currency for a token; `null` for a main currency */
	mainCurrencyId: number | null;
	/** The main currency for a token; `null` for a main currency */
	mainCurrency: Currency | null;
	/** Whether this is a test-network currency */
	test: boolean;
}
