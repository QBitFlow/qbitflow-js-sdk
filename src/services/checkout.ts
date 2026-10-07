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
import { checkPathTxId } from '../validate.js';

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
