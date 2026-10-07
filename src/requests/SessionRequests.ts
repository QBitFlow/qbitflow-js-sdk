import { custom, Schema } from '../decode.js';
import { ValidationException } from '../exceptions/index.js';
import {
	LinkResponseSchema,
	OneTimePaymentSessionSchema,
	SessionCheckoutSchema,
	SubscriptionSessionSchema,
} from '../schemas.js';
import {
	CreatePaymentSessionDto,
	CreateSubscriptionSessionDto,
	isPaymentSession,
	isSubscriptionSession,
	LinkResponse,
	OneTimePaymentSession,
	SubscriptionSession,
} from '../types/index.js';
import { prepareSessionBody, requireNonEmpty } from '../utils/index.js';
import { Request } from './Request.js';

/** The session shape a getter expects. */
type SessionKind = 'payment' | 'subscription';

/**
 * A session schema that also checks the `txType` discriminator: asking the payment service
 * for a subscription session (or the other way round) is a {@link ValidationException} that
 * names the right service.
 */
function sessionOfKind(kind: 'payment', uuid: string): Schema<OneTimePaymentSession>;
function sessionOfKind(kind: 'subscription', uuid: string): Schema<SubscriptionSession>;
function sessionOfKind(
	kind: SessionKind,
	uuid: string
): Schema<OneTimePaymentSession | SubscriptionSession> {
	return custom('a session object', (value, path, ctx) => {
		const session = SessionCheckoutSchema.decode(value, path, ctx);
		if (kind === 'payment') {
			if (isSubscriptionSession(session)) {
				throw new ValidationException(
					`Session ${uuid} is a subscription session (txType "${session.txType}"); use client.subscriptions.getSession()`
				);
			}
			return OneTimePaymentSessionSchema.decode(value, path, ctx);
		}
		if (isPaymentSession(session)) {
			throw new ValidationException(
				`Session ${uuid} is a one-time payment session (txType "${session.txType}"); use client.oneTimePayments.getSession()`
			);
		}
		return SubscriptionSessionSchema.decode(value, path, ctx);
	});
}

/**
 * Internal session management — used by PaymentRequests and SubscriptionRequests
 */
export class SessionRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/session-checkout';

	/**
	 * Create a one-time payment session
	 * @param data - Payment session data
	 * @returns Payment link response
	 * @throws {ValidationException} When the payload breaks the API's rules
	 */
	async createForPayment(data: CreatePaymentSessionDto): Promise<LinkResponse> {
		const body = prepareSessionBody(data, 'payment');
		return this.postJson(LinkResponseSchema, `${SessionRequests.BASE_ROUTE}/new/payment`, body);
	}

	/**
	 * Create a subscription session
	 * @param data - Subscription session data
	 * @returns Payment link response
	 * @throws {ValidationException} When the payload breaks the API's rules
	 */
	async createForSubscription(data: CreateSubscriptionSessionDto): Promise<LinkResponse> {
		const body = prepareSessionBody(data, 'subscription');
		return this.postJson(
			LinkResponseSchema,
			`${SessionRequests.BASE_ROUTE}/new/subscription`,
			body
		);
	}

	/**
	 * Get session details by UUID (public route) and check that it is of the expected kind.
	 * @param kind - `'payment'` or `'subscription'`
	 * @param sessionUuid - Session UUID
	 * @param closeToExpireError - Whether the API should error when the session is close to
	 *   expiration. Omitted = API default (`true`).
	 * @throws {ValidationException} When `sessionUuid` is empty or the session is of the other kind
	 */
	async get(
		kind: 'payment',
		sessionUuid: string,
		closeToExpireError?: boolean
	): Promise<OneTimePaymentSession>;
	async get(
		kind: 'subscription',
		sessionUuid: string,
		closeToExpireError?: boolean
	): Promise<SubscriptionSession>;
	async get(
		kind: SessionKind,
		sessionUuid: string,
		closeToExpireError?: boolean
	): Promise<OneTimePaymentSession | SubscriptionSession> {
		requireNonEmpty('sessionUuid', sessionUuid);
		const params = closeToExpireError !== undefined ? { closeToExpireError } : undefined;
		const endpoint = `${SessionRequests.BASE_ROUTE}/${encodeURIComponent(sessionUuid)}`;
		return kind === 'payment'
			? this.getJson(sessionOfKind('payment', sessionUuid), endpoint, params)
			: this.getJson(sessionOfKind('subscription', sessionUuid), endpoint, params);
	}
}
