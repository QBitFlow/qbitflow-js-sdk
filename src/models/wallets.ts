/**
 * Wallets and the currency catalog's params.
 *
 * @module
 */

import type { Currency } from './common.js';

/** A wallet of a space on one chain, with its token wallets. */
export interface Wallet {
	/** The wallet's id. */
	uuid: string;
	/** When it was added. */
	createdAt: string;
	/** The wallet's address. */
	publicKey: string;
	/** True in test mode. */
	test: boolean;
	/** The member whose wallet it is; absent for the organization's own. */
	userUuid?: string;
	/** The tokens enabled on it. */
	tokenWallets: TokenWallet[];
	/** The chain's native coin. */
	currencyId: number;
	/** That native coin. */
	currency: Currency;
}

/** A token enabled on a wallet. */
export interface TokenWallet {
	/** The token wallet's id. */
	uuid: string;
	/** When it was enabled. */
	createdAt: string;
	/** The token's currency id. */
	tokenId: number;
	/** The token's currency. */
	token: Currency;
	/** The wallet it belongs to. */
	walletUuid: string;
	/** Its balance; set only by `wallets.list` with `withBalances`. */
	balance?: Balance;
}

/** A token wallet's balance. */
export interface Balance {
	/** The token (e.g. `SOL:USDC`). */
	currency: string;
	/** The balance in the token (a decimal string). */
	balance: string;
	/** The same in USD. */
	balanceUsd: number;
}

/** `wallets.list`'s options. */
export interface WalletListParams {
	/** Add each token wallet's balance. */
	withBalances?: boolean;
}

/** `wallets.listSupportedCurrencies`' options. */
export interface SupportedCurrenciesParams {
	/** Read a member's (organization key); absent for the request's space. */
	userUuid?: string;
}

/** `currencies.listAvailable`'s and `currencies.listMain`'s options. */
export interface CurrencyListParams {
	/** List the testnet currencies (whatever the key's mode). */
	test?: boolean;
}
