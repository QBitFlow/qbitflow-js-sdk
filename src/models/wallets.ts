/**
 * Wallets and the currency catalog's params.
 *
 * @module
 */

import type { Currency, TokenAmount } from './common.js';

/**
 * A space's receiving address on one chain (`currency`, its native coin), with the currencies it
 * accepts on that chain (`tokenWallets`). Its mode is the space's. Wallets are added and removed
 * in the dashboard.
 */
export interface Wallet {
	/** The wallet's id. */
	uuid: string;
	/** When it was added. */
	createdAt: string;
	/** The wallet's address on its chain (EVM: `0x…`, Solana: base58). */
	address: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose wallet it is; absent for the organization's own. */
	userUuid?: string;
	/** The currencies it accepts on its chain; `[]` when none. */
	tokenWallets: TokenWallet[];
	/** The chain, by its native coin. */
	currency: Currency;
}

/** A currency a wallet accepts on its chain: a token (USDC on Base) or the chain's native coin. */
export interface TokenWallet {
	/** The token wallet's id. */
	uuid: string;
	/** When the wallet started accepting it. */
	createdAt: string;
	/** The currency accepted. */
	currency: Currency;
	/** The wallet it belongs to. */
	walletUuid: string;
	/**
	 * What the wallet holds of the currency, read on its chain now: set only by `wallets.list`
	 * with `withBalances`, and absent when the chain couldn't be read.
	 */
	balance?: Balance;
}

/**
 * What a wallet holds of a currency, read on its chain now. `amount`, `amountMinUnits` and
 * `amountUsd` (its value at today's price; absent when QBitFlow has no price it can trust right
 * now) come from {@link TokenAmount}.
 *
 * ```json
 * {"currency": {…}, "amount": "12.5", "amountMinUnits": "12500000", "amountUsd": "12.5"}
 * ```
 */
export interface Balance extends TokenAmount {
	/** The currency held. */
	currency: Currency;
}

/** `wallets.list`'s options. */
export interface WalletListParams {
	/** Add each token wallet's balance (read on-chain: slower). */
	withBalances?: boolean;
}

/** `wallets.listAcceptedCurrencies`' options. */
export interface AcceptedCurrenciesParams {
	/**
	 * Read a member's (an organization key; 403 otherwise, also with `onBehalfOf`); absent for
	 * the request's space.
	 */
	userUuid?: string;
}

/** `currencies.list`'s options. */
export interface CurrencyListParams {
	/** List the test networks' currencies (whatever the key's mode); absent or `false`: mainnet. */
	test?: boolean;
	/** List only the chains' native coins (ETH, BASE, SOL), no tokens. */
	main?: boolean;
}
