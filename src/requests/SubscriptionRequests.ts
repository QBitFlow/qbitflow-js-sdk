import { list } from '../decode.js';
import {
	SubscriptionHistorySchema,
	SubscriptionSchema,
	SuccessResponseSchema,
} from '../schemas.js';
import {
	CreateSubscriptionSessionDto,
	LinkResponse,
	Subscription,
	SubscriptionHistory,
	SubscriptionSession,
	SuccessResponse,
} from '../types/index.js';
import { requireNonEmpty } from '../utils/index.js';
import { Request } from './Request.js';
import { SessionRequests } from './SessionRequests.js';
import { Transport } from './Transport.js';

/**
 * Subscription payment requests
 */
export class SubscriptionRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/subscription';
	private readonly sessionRequests: SessionRequests;

	constructor(transport: Transport, headers: Readonly<Record<string, string>> = {}) {
		super(transport, headers);
		this.sessionRequests = new SessionRequests(transport, headers);
	}

	/**
	 * Create a new subscription session.
	 * Provide either a productId / productReference or full product details
	 * (productName + description + price), plus a `frequency`.
	 *
	 * @param options - Subscription session options
	 * @returns Payment link response with UUID and link
	 * @throws {ValidationException} When the payload breaks the API's rules (product
	 *   identification, a missing or invalid `frequency`, `trialPeriod`, `minPeriods`, URLs …)
	 *
	 * @example
	 * ```typescript
	 * const sub = await client.subscriptions.createSession({
	 *   productId: 1,
	 *   frequency: { unit: 'months', value: 1 },
	 *   trialPeriod: { unit: 'days', value: 7 },
	 * });
	 * console.log(sub.link);
	 * ```
	 */
	async createSession(options: CreateSubscriptionSessionDto): Promise<LinkResponse> {
		return this.sessionRequests.createForSubscription(options);
	}

	/**
	 * Get subscription session details by UUID (public route)
	 * @param sessionUuid - Session UUID
	 * @param closeToExpireError - Whether the API should answer with an error when the session
	 *   is close to expiry. Omit for the API default (`true`); pass `false` to always get the
	 *   session data.
	 * @returns Session details
	 * @throws {ValidationException} When `sessionUuid` is empty, or the session is a one-time
	 *   payment session (use `client.oneTimePayments.getSession()` for those)
	 */
	async getSession(
		sessionUuid: string,
		closeToExpireError?: boolean
	): Promise<SubscriptionSession> {
		return this.sessionRequests.get('subscription', sessionUuid, closeToExpireError);
	}

	/**
	 * Get a subscription by UUID (`sub@<uuid>`)
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Subscription details
	 * @throws {ValidationException} When `subscriptionUUID` is empty
	 *
	 * @example
	 * ```typescript
	 * const sub = await client.subscriptions.get('sub@…');
	 * console.log(sub.subscriptionStatus, sub.nextBillingDate, sub.currency.symbol);
	 * ```
	 */
	async get(subscriptionUUID: string): Promise<Subscription> {
		requireNonEmpty('subscriptionUUID', subscriptionUUID);
		return this.getJson(
			SubscriptionSchema,
			`${SubscriptionRequests.BASE_ROUTE}/${encodeURIComponent(subscriptionUUID)}`
		);
	}

	/**
	 * Get a subscription by the reference you assigned when creating it.
	 * Lets you resolve a subscription from your own order/invoice ID without storing QBitFlow's
	 * UUID. The reference is escaped correctly, but the API currently cannot route a reference
	 * containing `/` (it answers 404).
	 *
	 * @param reference - Your own subscription reference
	 * @returns Subscription details
	 * @throws {ValidationException} When `reference` is empty
	 *
	 * @example
	 * ```typescript
	 * const sub = await client.subscriptions.getByReference('sub-1234');
	 * console.log(sub.uuid, sub.subscriptionStatus);
	 * ```
	 */
	async getByReference(reference: string): Promise<Subscription> {
		requireNonEmpty('reference', reference);
		return this.getJson(
			SubscriptionSchema,
			`${SubscriptionRequests.BASE_ROUTE}/reference/subscription/${encodeURIComponent(reference)}`
		);
	}

	/**
	 * Get a subscription's billing history (public route).
	 * @param subscriptionUUID - Subscription UUID
	 * @returns List of subscription billing history records (empty for an unknown id)
	 * @throws {ValidationException} When `subscriptionUUID` is empty
	 *
	 * @example
	 * ```typescript
	 * const history = await client.subscriptions.getPaymentHistory('sub@…');
	 * history.forEach(r => console.log(r.uuid, r.amount, r.createdAt));
	 * ```
	 */
	async getPaymentHistory(subscriptionUUID: string): Promise<SubscriptionHistory[]> {
		requireNonEmpty('subscriptionUUID', subscriptionUUID);
		return this.getJson(
			list(SubscriptionHistorySchema),
			`${SubscriptionRequests.BASE_ROUTE}/history/${encodeURIComponent(subscriptionUUID)}`
		);
	}

	/**
	 * Force-cancel a subscription without the subscriber signing on-chain.
	 * Queues an on-chain cancellation; the subscription's state reflects it once the
	 * transaction settles. Never retried automatically — it is an action, not a read.
	 *
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Success response (`{ message }`)
	 * @throws {ValidationException} When `subscriptionUUID` is empty
	 */
	async forceCancel(subscriptionUUID: string): Promise<SuccessResponse> {
		requireNonEmpty('subscriptionUUID', subscriptionUUID);
		return this.getJson(
			SuccessResponseSchema,
			`${SubscriptionRequests.BASE_ROUTE}/processing/force-cancel/${encodeURIComponent(subscriptionUUID)}`,
			undefined,
			{ retriable: false }
		);
	}

	/**
	 * Manually trigger a billing cycle for a test-mode subscription.
	 * In live mode, billing is executed automatically on schedule. Never retried
	 * automatically — it is an action, not a read.
	 *
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Success response (`{ message }`)
	 * @throws {ValidationException} When `subscriptionUUID` is empty
	 * @throws {ConflictException} When the subscription is not yet due for billing (HTTP 409)
	 */
	async executeTestBilling(subscriptionUUID: string): Promise<SuccessResponse> {
		requireNonEmpty('subscriptionUUID', subscriptionUUID);
		return this.getJson(
			SuccessResponseSchema,
			`${SubscriptionRequests.BASE_ROUTE}/processing/execute-billing/${encodeURIComponent(subscriptionUUID)}`,
			undefined,
			{ retriable: false }
		);
	}
}
