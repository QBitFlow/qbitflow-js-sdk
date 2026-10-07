import { type Core, path } from '../core.js';
import { fieldError } from '../errors.js';
import { list } from '../decode.js';
import type { AccountingEvent } from '../models/accounting.js';
import type { Currency } from '../models/common.js';
import type {
	CurrencyListParams,
	SupportedCurrenciesParams,
	Wallet,
	WalletListParams,
} from '../models/wallets.js';
import {
	accountingQuery,
	currencyListQuery,
	supportedCurrenciesQuery,
	walletListQuery,
} from '../params.js';
import { AccountingEventSchema, CurrencySchema, WalletSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathUUID } from '../validate.js';

/** Reads the wallets and the currencies a space accepts (`/wallet…`). Reach it as `client.wallets`. */
export class WalletsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The request's space's wallets (`GET /wallet/user`). `withBalances` adds each token wallet's
	 * balance. Wallets are added and removed in the dashboard.
	 */
	async list(params?: WalletListParams, options?: RequestOptions): Promise<Wallet[]> {
		const query = walletListQuery(params);
		return this.core.call(
			list(WalletSchema),
			{ method: 'GET', path: '/wallet/user', query },
			options
		);
	}

	/** A member's wallets in the key's mode (`GET /wallet/user/:userUuid`). Organization key only. */
	async listForMember(userUuid: string, options?: RequestOptions): Promise<Wallet[]> {
		checkPathUUID('userUuid', userUuid);
		return this.core.call(
			list(WalletSchema),
			{ method: 'GET', path: path('/wallet/user/:', ['userUuid', userUuid]) },
			options
		);
	}

	/**
	 * The currencies the space's checkouts accept (`GET /wallet/supported-currencies`): check a
	 * seller is ready before opening their checkouts (none: 409 `merchant_not_ready`). `userUuid`
	 * reads a member's (organization key).
	 */
	async listSupportedCurrencies(
		params?: SupportedCurrenciesParams,
		options?: RequestOptions
	): Promise<Currency[]> {
		const query = supportedCurrenciesQuery(params);
		return this.core.call(
			list(CurrencySchema),
			{ method: 'GET', path: '/wallet/supported-currencies', query },
			options
		);
	}
}

/** Exports the accounting events (`/accounting/export`). Reach it as `client.accounting`. */
export class AccountingService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The accounting events between two dates, both `YYYY-MM-DD` and included
	 * (`GET /accounting/export?format=json`). The API allows at most 95 days (400 beyond); the
	 * SDK checks the dates and `from <= to` before sending.
	 */
	async exportJson(
		from: string,
		to: string,
		options?: RequestOptions
	): Promise<AccountingEvent[]> {
		const query = accountingQuery(from, to, 'json');
		return this.core.call(
			list(AccountingEventSchema),
			{ method: 'GET', path: '/accounting/export', query },
			options
		);
	}

	/** The same export as CSV text (`GET /accounting/export?format=csv`). Errors are still JSON, and typed as usual. */
	async exportCsv(from: string, to: string, options?: RequestOptions): Promise<string> {
		const query = accountingQuery(from, to, 'csv');
		return this.core.callText({ method: 'GET', path: '/accounting/export', query }, options);
	}
}

/** Reads the currency catalog (`/utils…`, public routes; the key is sent anyway). Reach it as `client.currencies`. */
export class CurrenciesService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * Every currency checkouts can take (`GET /utils/all-available-currencies`, public). `test`
	 * lists the testnet currencies, whatever the key's mode. Rate limited to 60 requests a minute
	 * per IP: cache the list.
	 */
	async listAvailable(
		params?: CurrencyListParams,
		options?: RequestOptions
	): Promise<Currency[]> {
		const query = currencyListQuery(params);
		return this.core.call(
			list(CurrencySchema),
			{ method: 'GET', path: '/utils/all-available-currencies', query },
			options
		);
	}

	/** The chains' main currencies (`GET /utils/all-main-currencies`, public), with `listAvailable`'s params and rate limit. */
	async listMain(params?: CurrencyListParams, options?: RequestOptions): Promise<Currency[]> {
		const query = currencyListQuery(params);
		return this.core.call(
			list(CurrencySchema),
			{ method: 'GET', path: '/utils/all-main-currencies', query },
			options
		);
	}

	/**
	 * A currency by its id (`GET /utils/currency/id/:id`, public): resolve the `currencyId` and
	 * `acceptedCurrencyIds` fields with it. Ids are unique across test and live.
	 */
	async get(id: number, options?: RequestOptions): Promise<Currency> {
		if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
			throw fieldError('id', 'must be a currency id (above 0)');
		}
		return this.core.call(
			CurrencySchema,
			{ method: 'GET', path: `/utils/currency/id/${id}` },
			options
		);
	}
}
