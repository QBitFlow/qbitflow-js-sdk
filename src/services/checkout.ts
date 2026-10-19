import { type Core, path } from '../core.js';
import type {
	CheckoutSessionStatus,
	CreatedCheckoutSession,
	CreatePaymentSessionParams,
	CreateSubscriptionSessionParams,
} from '../models/checkout.js';
import { createPaymentSessionBody, createSubscriptionSessionBody } from '../params.js';
import { CheckoutSessionStatusSchema, CreatedCheckoutSessionSchema } from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { fieldError, NetworkError } from '../errors.js';
import { checkPathTxId } from '../validate.js';

/**
 * Options of {@link CheckoutSessionsService.waitForCompletion}, with the request options of each
 * poll (`onBehalfOf`, `requestId`, `signal`).
 */
export interface WaitOptions extends RequestOptions {
	/** How long to poll, in ms (default 600000: 10 minutes; 0 or less: the default). */
	timeout?: number;
	/** The pause between two polls, in ms (default 3000; less than 1000: 1000). */
	interval?: number;
	/** Stops the wait and the request in flight: a `NetworkError`, its `cause` the signal's reason. */
	signal?: AbortSignal;
}

const DEFAULT_WAIT_TIMEOUT_MS = 600_000;
const DEFAULT_WAIT_INTERVAL_MS = 3_000;
const MIN_WAIT_INTERVAL_MS = 1_000;

function waitDuration(field: string, value: unknown, fallback: number): number {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw fieldError(field, 'must be a number of milliseconds');
	}
	return value;
}

/**
 * Creates checkout sessions (one-time payments and subscriptions), reads their status and
 * expires them (`/checkout-sessions…`). Reach it as `client.checkoutSessions`.
 */
export class CheckoutSessionsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * Opens a one-time payment checkout session (`POST /checkout-sessions/payment`, 201) and
	 * returns its `link`, its `pay@…` id and its expiry. Sends an `Idempotency-Key` and is retried
	 * on transient failures.
	 *
	 * Send the customer to `link`. The payment exists, with the same id, once the customer's
	 * transaction is confirmed: fulfil on the `payment.completed` webhook (or {@link get}
	 * `completed`), give up on `checkout.expired`. `successUrl` and `cancelUrl` may carry
	 * `Placeholders.UUID` and `Placeholders.TRANSACTION_TYPE`, filled in on redirect.
	 *
	 * `fees` (optional) adds lines to the price (a tax, shipping, QBitFlow's processing fee): the
	 * customer pays the price plus every line (the payment's `amountUsd`), and the network fee on
	 * top of that. `metadata` is copied onto the payment and into its webhooks.
	 *
	 * Errors: 400 `validation_failed` (test mode caps the amount, fees included, at `"5"`,
	 * `details.max`; live mode needs https URLs); 404 for an unknown product or customer; 409
	 * `unique_violation` on `reference`; 409 `merchant_not_ready` (`details.reason`) when the
	 * space's wallets accept no currency; 410 `merchant_closed` for a removed member's or a closed
	 * organization's space.
	 */
	async createPayment(
		params: CreatePaymentSessionParams,
		options?: RequestOptions
	): Promise<CreatedCheckoutSession> {
		const body = createPaymentSessionBody(params);
		return this.core.call(
			CreatedCheckoutSessionSchema,
			{ method: 'POST', path: '/checkout-sessions/payment', body, idempotent: true },
			options
		);
	}

	/**
	 * Opens a subscription checkout session (`POST /checkout-sessions/subscription`, 201) and
	 * returns its `link`, its `sub@…` id and its expiry. Sends an `Idempotency-Key` and is retried
	 * on transient failures.
	 *
	 * The subscription exists, with the same id, once the customer signed (a free trial) or paid:
	 * act on `subscription.created`. Terms left out come from a subscription product.
	 *
	 * `fees` (optional) adds lines to the price, as for {@link createPayment}, locked with it:
	 * every bill charges the price plus every line (the subscription's `priceUsd` plus `fees`),
	 * and the network fee on top of that.
	 *
	 * Errors as {@link createPayment}, plus 400 on `frequency` / `trialPeriod` (the frequency
	 * minimum is 1 hour live, 5 minutes test) and on `priceUsd` for a live subscription at `"0.25"`
	 * or less (`details.min`); a member's key needs the `members.subscriptions` policy (403
	 * `policy_disabled`).
	 */
	async createSubscription(
		params: CreateSubscriptionSessionParams,
		options?: RequestOptions
	): Promise<CreatedCheckoutSession> {
		const body = createSubscriptionSessionBody(params);
		return this.core.call(
			CreatedCheckoutSessionSchema,
			{ method: 'POST', path: '/checkout-sessions/subscription', body, idempotent: true },
			options
		);
	}

	/**
	 * Where a checkout session stands (`GET /checkout-sessions/:uuid`; `uuid` is the session's
	 * `pay@…` or `sub@…` id, or its bare UUID): `created` (waiting for its customer),
	 * `waitingConfirmation`, `completed` or `expired` (the only final ones). It covers both
	 * phases: the session, then the payment or subscription it created.
	 *
	 * A failed attempt is `created` with `lastAttempt` set: the customer may still pay from the
	 * same checkout, so never cancel an order on it. An expired session answers `expired` for as
	 * long as QBitFlow keeps the record, then 404 like an unknown id or another space's session.
	 */
	async get(uuid: string, options?: RequestOptions): Promise<CheckoutSessionStatus> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			CheckoutSessionStatusSchema,
			{ method: 'GET', path: path('/checkout-sessions/:', ['uuid', uuid]) },
			options
		);
	}

	/**
	 * Polls {@link get} until the session is `completed` or `expired`, and returns that
	 * status. When `timeout` (ms, default 10 minutes; 0 or less: the default) elapses first, it
	 * returns the last status seen, which is not final: check `.status`. Polls every `interval` ms
	 * (default 3000, at least 1000); the last pause is shortened to the time left, then one final
	 * poll is made at the deadline. Each poll takes the request options (`onBehalfOf`,
	 * `requestId`). `get`'s errors propagate (a `NotFoundError` included); `signal` stops the
	 * wait (a `NetworkError`, as for a cancelled request). A `timeout` or `interval` that is not a
	 * number is a `ValidationError`.
	 *
	 * For scripts, tests and back-office jobs: fulfil orders on the `payment.completed` webhook,
	 * never on a poll in a request handler.
	 */
	async waitForCompletion(
		uuid: string,
		options: WaitOptions = {}
	): Promise<CheckoutSessionStatus> {
		checkPathTxId('uuid', uuid);
		const { timeout: t, interval: i, ...requestOptions } = options ?? {};
		let timeout = waitDuration('timeout', t, DEFAULT_WAIT_TIMEOUT_MS);
		if (timeout <= 0) timeout = DEFAULT_WAIT_TIMEOUT_MS;
		const interval = Math.max(
			MIN_WAIT_INTERVAL_MS,
			waitDuration('interval', i, DEFAULT_WAIT_INTERVAL_MS)
		);
		const signal = requestOptions.signal;
		const { transport } = this.core;
		const deadline = transport.now() + timeout;
		for (;;) {
			const status = await this.get(uuid, requestOptions);
			if (status.status === 'completed' || status.status === 'expired') return status;
			const remaining = deadline - transport.now();
			if (remaining <= 0) return status;
			try {
				await transport.sleep(Math.min(interval, remaining), signal);
			} catch (err) {
				throw new NetworkError({ message: 'wait cancelled', cause: err });
			}
		}
	}

	/**
	 * Ends a checkout session now (`POST /checkout-sessions/:uuid/expire`) and returns its status,
	 * `expired`, with `expiresAt` the time it was expired (`checkout.expired` follows). Not
	 * retried.
	 *
	 * Errors: 409 `tx_already_sent` once the customer paid or is paying.
	 */
	async expire(uuid: string, options?: RequestOptions): Promise<CheckoutSessionStatus> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			CheckoutSessionStatusSchema,
			{ method: 'POST', path: path('/checkout-sessions/:/expire', ['uuid', uuid]) },
			options
		);
	}
}
