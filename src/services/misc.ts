import { type Core, path } from '../core.js';
import { fieldError } from '../errors.js';
import type { AccountingEvent } from '../models/accounting.js';
import type { Currency } from '../models/common.js';
import type {
	AcceptedCurrenciesParams,
	CurrencyListParams,
	Wallet,
	WalletListParams,
} from '../models/wallets.js';
import {
	acceptedCurrenciesQuery,
	accountingQuery,
	currencyListQuery,
	walletListQuery,
} from '../params.js';
import { AccountingEventSchema, CurrencySchema, WalletSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathUUID } from '../validate.js';

/** Reads the wallets and the currencies a space accepts (`/wallets…`). Reach it as `client.wallets`. */
export class WalletsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The request's space's wallets (`GET /wallets`; a bounded list), each with the currencies it
	 * accepts. `withBalances` adds each token wallet's balance, read on-chain. Wallets are added
	 * and removed in the dashboard.
	 */
	async list(params?: WalletListParams, options?: RequestOptions): Promise<Wallet[]> {
		const query = walletListQuery(params);
		return this.core.callItems(
			WalletSchema,
			{ method: 'GET', path: '/wallets', query },
			options
		);
	}

	/**
	 * A member's wallets in the key's mode (`GET /members/:userUuid/wallets`; a bounded list).
	 * Organization key only (403 otherwise, also with `onBehalfOf`); someone who is not a member is
	 * a `NotFoundError`.
	 */
	async listForMember(userUuid: string, options?: RequestOptions): Promise<Wallet[]> {
		checkPathUUID('userUuid', userUuid);
		return this.core.callItems(
			WalletSchema,
			{ method: 'GET', path: path('/members/:/wallets', ['userUuid', userUuid]) },
			options
		);
	}

	/**
	 * The currencies the space's checkouts accept now (`GET /wallets/accepted-currencies`; a
	 * bounded list): check a seller is ready before opening their checkouts (none: their checkouts
	 * answer 409 `merchant_not_ready`). `userUuid` reads a member's (organization key; 403
	 * otherwise).
	 */
	async listAcceptedCurrencies(
		params?: AcceptedCurrenciesParams,
		options?: RequestOptions
	): Promise<Currency[]> {
		const query = acceptedCurrenciesQuery(params);
		return this.core.callItems(
			CurrencySchema,
			{ method: 'GET', path: '/wallets/accepted-currencies', query },
			options
		);
	}
}

/** The most days one export request covers, both ends included: `to <= from + 91 days`. */
const MAX_EXPORT_DAYS = 92;
const DAY_MS = 86_400_000;

/**
 * `[from, to]` split into consecutive windows of at most 92 days, both ends included
 * (`[s, s + 91 d]`, the next one starting the day after), on calendar dates (UTC).
 */
export function exportWindows(from: string, to: string): Array<[string, string]> {
	accountingQuery(from, to, 'json'); // the same checks as one export
	const day = (s: string): number => Date.parse(`${s}T00:00:00Z`);
	const text = (t: number): string => new Date(t).toISOString().slice(0, 10);
	const end = day(to);
	const windows: Array<[string, string]> = [];
	for (let start = day(from); start <= end; ) {
		const stop = Math.min(start + (MAX_EXPORT_DAYS - 1) * DAY_MS, end);
		windows.push([text(start), text(stop)]);
		start = stop + DAY_MS;
	}
	return windows;
}

/** CSV `text` without its first line (the header), line ending included. */
function withoutHeader(text: string): string {
	const nl = text.indexOf('\n');
	return nl < 0 ? '' : text.slice(nl + 1);
}

/** Exports the accounting events (`/accounting/export`). Reach it as `client.accounting`. */
export class AccountingService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The accounting events between two dates, both `YYYY-MM-DD` and included
	 * (`GET /accounting/export?format=json`; a bounded list). The dates are the transactions'
	 * (their block's day, in UTC), so consecutive exports never miss nor repeat an event. Events
	 * are ordered by `txTimeUtc`, then `type`, then `txUuid`. The API allows at most 92 days, both
	 * included (400 `validation_failed` on `to` beyond, `details.max` 92: {@link exportJsonRange}
	 * splits longer ranges); the SDK checks the dates and `from <= to` before sending.
	 */
	async exportJson(
		from: string,
		to: string,
		options?: RequestOptions
	): Promise<AccountingEvent[]> {
		const query = accountingQuery(from, to, 'json');
		return this.core.callItems(
			AccountingEventSchema,
			{ method: 'GET', path: '/accounting/export', query },
			options
		);
	}

	/**
	 * The same export as {@link exportJson} as CSV text (`GET /accounting/export?format=csv`):
	 * the header row (`AccountingEvent`'s keys, in its field order), then one row per event;
	 * nothing in range gives the header only. Amounts are plain numbers; an absent value is an
	 * empty cell; a cell starting with `= + - @`, a tab or a CR gets a leading `'`. Read the
	 * columns by header name. Errors are still JSON, and typed as usual.
	 */
	async exportCsv(from: string, to: string, options?: RequestOptions): Promise<string> {
		const query = accountingQuery(from, to, 'csv');
		return this.core.callText({ method: 'GET', path: '/accounting/export', query }, options);
	}

	/**
	 * {@link exportJson} over any range: checks the dates like `exportJson`, splits the range into
	 * consecutive windows of at most 92 days, both ends included (`[from, from + 91 d]`, the next
	 * one starting the day after; on calendar dates, UTC), requests them in order and returns
	 * every window's events, in order. A range of 92 days or less is one request. `2026-01-01` to
	 * `2026-12-31` is four: `[01-01, 04-02] [04-03, 07-03] [07-04, 10-03] [10-04, 12-31]`. The
	 * first error stops it.
	 */
	async exportJsonRange(
		from: string,
		to: string,
		options?: RequestOptions
	): Promise<AccountingEvent[]> {
		const rows: AccountingEvent[] = [];
		for (const [f, t] of exportWindows(from, to)) {
			rows.push(...(await this.exportJson(f, t, options)));
		}
		return rows;
	}

	/**
	 * {@link exportCsv} over any range, split like {@link exportJsonRange}: the first window's
	 * header line once, then every window's rows, with the line endings the API sent (a window
	 * with only its header adds nothing).
	 */
	async exportCsvRange(from: string, to: string, options?: RequestOptions): Promise<string> {
		let csv = '';
		for (const [f, t] of exportWindows(from, to)) {
			const text = await this.exportCsv(f, t, options);
			if (csv === '') {
				csv = text;
				continue;
			}
			const rows = withoutHeader(text);
			if (rows === '') continue;
			if (!csv.endsWith('\n')) {
				const nl = csv.indexOf('\n'); // the header's line ending
				csv += nl > 0 && csv[nl - 1] === '\r' ? '\r\n' : '\n';
			}
			csv += rows;
		}
		return csv;
	}
}

/**
 * Reads the currency catalog (`/currencies…`, public routes; the key is sent anyway). Reach it as
 * `client.currencies`.
 */
export class CurrenciesService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The currency catalog (`GET /currencies`, public; a bounded list): the live currencies, or
	 * the test networks' with `test` (whatever the key's mode); `main` keeps only the chains'
	 * native coins (ETH, BASE, SOL). Rate limited to 60 requests a minute per IP: cache the list.
	 */
	async list(params?: CurrencyListParams, options?: RequestOptions): Promise<Currency[]> {
		const query = currencyListQuery(params);
		return this.core.callItems(
			CurrencySchema,
			{ method: 'GET', path: '/currencies', query },
			options
		);
	}

	/**
	 * A currency by its id (`GET /currencies/:id`, public), e.g. a token's `mainCurrencyId`. Ids
	 * are unique across test and live.
	 */
	async get(id: number, options?: RequestOptions): Promise<Currency> {
		if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
			throw fieldError('id', 'must be a currency id (above 0)');
		}
		return this.core.call(
			CurrencySchema,
			{ method: 'GET', path: `/currencies/${id}` },
			options
		);
	}
}
