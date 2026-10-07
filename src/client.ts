/**
 * The QBitFlow client.
 *
 * @module
 */

import { Core } from './core.js';
import { fieldError } from './errors.js';
import type { Me } from './models/members.js';
import { MeSchema } from './schemas.js';
import { CheckoutSessionsService } from './services/checkout.js';
import { CustomersService } from './services/customers.js';
import { InvitationsService, MembersService } from './services/members.js';
import { AccountingService, CurrenciesService, WalletsService } from './services/misc.js';
import { FailuresService, PaymentsService } from './services/payments.js';
import { ProductsService } from './services/products.js';
import { RefundsService } from './services/refunds.js';
import { SubscriptionsService } from './services/subscriptions.js';
import { WebhooksService } from './services/webhooks.js';
import { type FetchLike, type RequestOptions, Transport } from './transport.js';
import { checkOnBehalfOf, isHttpUrl } from './validate.js';

/** The API root used when `baseUrl` is not given. */
export const DEFAULT_BASE_URL = 'https://api.qbitflow.app/v2';
/** How long each HTTP attempt may take when `timeout` is not given, in ms. */
export const DEFAULT_TIMEOUT = 30_000;
/** How many times a retryable call is re-sent when `maxRetries` is not given. */
export const DEFAULT_MAX_RETRIES = 3;

/** The client's options (all optional). */
export interface ClientOptions {
	/** The API root (default `https://api.qbitflow.app/v2`): an absolute http(s) URL; a trailing slash is stripped. */
	baseUrl?: string;
	/** Bounds each HTTP attempt, in milliseconds (default 30000); a retried call may take longer in total. */
	timeout?: number;
	/**
	 * How many times a retryable call (a read, or one of the 7 idempotent creates) is re-sent
	 * after a transient failure (default 3); 0 disables retries.
	 */
	maxRetries?: number;
	/** Acts in a member's space by default: every request sends `On-Behalf-Of` (a member's `userUuid`). */
	onBehalfOf?: string;
	/** The `fetch` to use (default: the global one), e.g. for tests or other runtimes. */
	fetch?: FetchLike;
}

/** The client's configuration: the API key and the {@link ClientOptions}. */
export interface ClientConfig extends ClientOptions {
	/** The API key (`sk_…`), sent as `X-API-Key`. */
	apiKey: string;
}

/** @internal Gives tests the shared transport (its sleep, clock and key generator). */
export const TRANSPORT = Symbol('qbitflow.transport');

/** @internal Marks the hidden constructor argument of `onBehalfOf`. */
const SCOPED = Symbol('qbitflow.scoped');

interface Scoped {
	[SCOPED]: Core;
}

function buildTransport(config: ClientConfig): Transport {
	if (config === null || typeof config !== 'object') throw fieldError('apiKey', 'is required');
	const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
	if (apiKey === '') throw fieldError('apiKey', 'is required');
	if (!apiKey.startsWith('sk_')) throw fieldError('apiKey', 'must be a QBitFlow API key (sk_…)');

	let baseUrl = DEFAULT_BASE_URL;
	if (config.baseUrl !== undefined) {
		baseUrl =
			typeof config.baseUrl === 'string' ? config.baseUrl.trim().replace(/\/+$/, '') : '';
		if (!isHttpUrl(baseUrl))
			throw fieldError('baseUrl', 'must be an absolute http or https URL');
	}

	const timeout = config.timeout ?? DEFAULT_TIMEOUT;
	if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
		throw fieldError('timeout', 'must be a positive number of milliseconds');
	}

	const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
	if (typeof maxRetries !== 'number' || !Number.isInteger(maxRetries) || maxRetries < 0) {
		throw fieldError('maxRetries', 'must be a non-negative integer');
	}

	let fetchImpl = config.fetch;
	if (fetchImpl === undefined) {
		if (typeof globalThis.fetch !== 'function') {
			throw fieldError('fetch', 'is required: this runtime has no global fetch');
		}
		fetchImpl = (url, init) => globalThis.fetch(url, init);
	} else if (typeof fetchImpl !== 'function') {
		throw fieldError('fetch', 'must be a function');
	}
	return new Transport(apiKey, baseUrl, timeout, maxRetries, fetchImpl);
}

/**
 * The QBitFlow API client. Create one and share it: each property groups the methods of one API
 * area.
 *
 * ```ts
 * const client = new QBitFlow(process.env.QBITFLOW_API_KEY!);
 * const me = await client.me();
 * const session = await client.checkoutSessions.createPayment({ productName: 'T-shirt', price: 25 });
 * ```
 *
 * The constructor sends nothing: call {@link QBitFlow.me} to check the key online. A bad key or
 * option throws a `ValidationError`.
 */
export class QBitFlow {
	/** Manages the products (`/product…`). */
	readonly products: ProductsService;
	/** Manages the customers (`/customer…`). */
	readonly customers: CustomersService;
	/** Creates checkout sessions and reads or expires them (`/transaction/session-checkout…`). */
	readonly checkoutSessions: CheckoutSessionsService;
	/** Reads the one-time payments and the combined payment feed. */
	readonly payments: PaymentsService;
	/** Reads the failed payment attempts. */
	readonly failures: FailuresService;
	/** Reads, bills and cancels subscriptions. */
	readonly subscriptions: SubscriptionsService;
	/** Lists and initiates refunds. */
	readonly refunds: RefundsService;
	/** Manages the organization's members and their held funds (organization key). */
	readonly members: MembersService;
	/** Invites members (organization key). */
	readonly invitations: InvitationsService;
	/** Reads the wallets and the currencies they accept. */
	readonly wallets: WalletsService;
	/** Exports the accounting events. */
	readonly accounting: AccountingService;
	/** Verifies webhooks and manages the endpoints (`endpoints`) and the event log (`events`). */
	readonly webhooks: WebhooksService;
	/** Reads the currency catalog (public). */
	readonly currencies: CurrenciesService;

	readonly #core: Core;

	/**
	 * @param apiKey - The API key (`sk_…`): non-blank, starting with `sk_`; the rest is opaque.
	 * @param options - `baseUrl`, `timeout` (ms), `maxRetries`, `onBehalfOf`, `fetch`.
	 */
	constructor(apiKey: string, options?: ClientOptions);
	/** @param config - The API key and the options. */
	constructor(config: ClientConfig);
	constructor(apiKeyOrConfig: string | ClientConfig | Scoped, options?: ClientOptions) {
		let core: Core;
		if (
			apiKeyOrConfig !== null &&
			typeof apiKeyOrConfig === 'object' &&
			SCOPED in apiKeyOrConfig
		) {
			core = (apiKeyOrConfig as Scoped)[SCOPED];
		} else {
			const config: ClientConfig =
				typeof apiKeyOrConfig === 'string' ||
				apiKeyOrConfig === undefined ||
				apiKeyOrConfig === null
					? { ...options, apiKey: apiKeyOrConfig as string }
					: (apiKeyOrConfig as ClientConfig);
			const transport = buildTransport(config);
			const onBehalfOf = config.onBehalfOf ?? '';
			checkOnBehalfOf(onBehalfOf);
			core = new Core(transport, onBehalfOf);
		}
		this.#core = core;
		this.products = new ProductsService(core);
		this.customers = new CustomersService(core);
		this.checkoutSessions = new CheckoutSessionsService(core);
		this.payments = new PaymentsService(core);
		this.failures = new FailuresService(core);
		this.subscriptions = new SubscriptionsService(core);
		this.refunds = new RefundsService(core);
		this.members = new MembersService(core);
		this.invitations = new InvitationsService(core);
		this.wallets = new WalletsService(core);
		this.accounting = new AccountingService(core);
		this.webhooks = new WebhooksService(core);
		this.currencies = new CurrenciesService(core);
	}

	/** @internal The shared transport (test hooks). */
	get [TRANSPORT](): Transport {
		return this.#core.transport;
	}

	/**
	 * A client that acts in a member's space: every request sends `On-Behalf-Of: userUuid` (a
	 * member's `userUuid`; organization key only). It shares this client's configuration; `''`
	 * returns one at the organization level. An invalid UUID (or the nil UUID) throws a
	 * `ValidationError` at once.
	 */
	onBehalfOf(userUuid: string): QBitFlow {
		checkOnBehalfOf(userUuid);
		return new QBitFlow({
			[SCOPED]: new Core(this.#core.transport, userUuid),
		} as unknown as ClientConfig);
	}

	/**
	 * What the API key is (`GET /me`): its role, its space (organization or member, test or live)
	 * and the member it acts for. The recommended start-up check, e.g. assert `me.space?.test` in
	 * a test environment.
	 */
	async me(options?: RequestOptions): Promise<Me> {
		return this.#core.call(MeSchema, { method: 'GET', path: '/me' }, options);
	}
}
