import { type Core, path } from '../core.js';
import type {
	CheckoutSession,
	CheckoutSessionStatus,
	CreatePaymentSessionParams,
	CreateSubscriptionSessionParams,
} from '../models/checkout.js';
import { createPaymentSessionBody, createSubscriptionSessionBody } from '../params.js';
import { CheckoutSessionSchema, CheckoutSessionStatusSchema } from '../schemas.js';
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
 * expires them (`/transaction/session-checkout…`). Reach it as `client.checkoutSessions`.
 */
export class CheckoutSessionsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * Opens a one-time payment checkout session (`POST /transaction/session-checkout/new/payment`,
	 * 201): its `link`, its `pay@…` id and its expiry. Sends an `Idempotency-Key` and is retried on
	 * transient failures.
	 *
	 * Send the customer to `link`. The payment exists, with the same id, once the customer's
	 * transaction is confirmed: fulfil on the `payment.completed` webhook (or `getStatus`
	 * `completed`), give up on `checkout.expired`. `successUrl` and `cancelUrl` may carry
	 * `{{UUID}}` and `{{TRANSACTION_TYPE}}`, filled in on redirect.
	 *
	 * Errors: 400 `validation_failed` (test mode caps the price at $5; live mode needs https URLs);
	 * 404 for an unknown product or customer; 409 `merchant_not_ready` (`details.reason`).
	 */
	async createPayment(
		params: CreatePaymentSessionParams,
		options?: RequestOptions
	): Promise<CheckoutSession> {
		const body = createPaymentSessionBody(params);
		return this.core.call(
			CheckoutSessionSchema,
			{
				method: 'POST',
				path: '/transaction/session-checkout/new/payment',
				body,
				idempotent: true,
			},
			options
		);
	}

	/**
	 * Opens a subscription checkout session (`POST /transaction/session-checkout/new/subscription`,
	 * 201): its `link`, its `sub@…` id and its expiry. Sends an `Idempotency-Key` and is retried
	 * on transient failures. The subscription exists once the customer signed (a free trial) or
	 * paid: act on `subscription.created`. Terms left out come from a subscription product.
	 */
	async createSubscription(
		params: CreateSubscriptionSessionParams,
		options?: RequestOptions
	): Promise<CheckoutSession> {
		const body = createSubscriptionSessionBody(params);
		return this.core.call(
			CheckoutSessionSchema,
			{
				method: 'POST',
				path: '/transaction/session-checkout/new/subscription',
				body,
				idempotent: true,
			},
			options
		);
	}

	/**
	 * Where a checkout session stands (`GET /transaction/session-checkout/:uuid/status`; the
	 * session's `pay@…` or `sub@…` id): `created`, `waitingConfirmation`, `completed` or `expired`
	 * (the only final ones). A failed attempt is `created` with `lastAttempt` set: never cancel an
	 * order on it.
	 */
	async getStatus(uuid: string, options?: RequestOptions): Promise<CheckoutSessionStatus> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			CheckoutSessionStatusSchema,
			{ method: 'GET', path: path('/transaction/session-checkout/:/status', ['uuid', uuid]) },
			options
		);
	}

	/**
	 * Polls {@link getStatus} until the session is `completed` or `expired`, and returns that
	 * status. When `timeout` (ms, default 10 minutes; 0 or less: the default) elapses first, it
	 * returns the last status seen, which is not final: check `.status`. Polls every `interval` ms
	 * (default 3000, at least 1000); the last pause is shortened to the time left, then one final
	 * poll is made at the deadline. Each poll takes the request options (`onBehalfOf`,
	 * `requestId`). `getStatus`'s errors propagate (a `NotFoundError` included); `signal` stops the
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
			const status = await this.getStatus(uuid, requestOptions);
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
	 * Ends a checkout session now (`POST /transaction/session-checkout/:uuid/expire`) and returns
	 * its status (`checkout.expired` follows). Not retried. Errors: 409 `tx_already_sent` once
	 * the customer paid or is paying.
	 */
	async expire(uuid: string, options?: RequestOptions): Promise<CheckoutSessionStatus> {
		checkPathTxId('uuid', uuid);
		return this.core.call(
			CheckoutSessionStatusSchema,
			{
				method: 'POST',
				path: path('/transaction/session-checkout/:/expire', ['uuid', uuid]),
			},
			options
		);
	}
}
