/**
 * Decode webhook bodies into fully-typed payloads.
 *
 * Verify the signature first (`verifyWebhookSignature` or `client.webhooks.verify`), then
 * decode the body with these helpers. They apply the same decoding policy as every API
 * response: a field the server left out (or sent as `null`) where the type is non-nullable
 * arrives as its zero value, a nullable field is always present as its value or `null`, and a
 * field of the wrong JSON type is rejected.
 */

import { decodeWith } from '../decode.js';
import { SessionWebhookSchema, SubscriptionWebhookSchema } from '../schemas.js';
import type { SessionWebhookResponse } from '../types/session.js';
import type { SubscriptionWebhook } from '../types/subscription.js';
import { decodeJsonInput } from './canonical.js';

/**
 * Decode a transaction webhook (the body QBitFlow POSTs to your Transaction webhook URL).
 *
 * `session` is decoded by its `txType`: a `SubscriptionSession` for `createSubscription`, a
 * `OneTimePaymentSession` otherwise — narrow it with `isSubscriptionSession()`.
 *
 * @param body - The raw body (a string, Buffer, Uint8Array or ArrayBuffer) or the already-parsed JSON
 * @returns The typed payload
 * @throws {ValidationException} When the body is missing or is not valid JSON
 * @throws {ServerException} When a field has the wrong JSON type (the message names it)
 *
 * @example
 * ```typescript
 * const event = parseSessionWebhook(req.body);
 * if (event.status?.status === TransactionStatusValue.COMPLETED) {
 *   console.log('paid', event.session.productName, event.session.reference);
 * }
 * ```
 */
export function parseSessionWebhook(body: unknown): SessionWebhookResponse {
	return decodeWith(SessionWebhookSchema, decodeJsonInput(body));
}

/**
 * Decode a subscription webhook (the body QBitFlow POSTs to your Subscription status webhook
 * URL). `data` is decoded by `type`; for a `type` this SDK does not know yet, `type` is the raw
 * string and `data` the raw JSON.
 *
 * @param body - The raw body (a string, Buffer, Uint8Array or ArrayBuffer) or the already-parsed JSON
 * @returns The typed payload — narrow it with `isSubscriptionStatusTransitionWebhook()` /
 *   `isSubscriptionBillingWebhook()`
 * @throws {ValidationException} When the body is missing or is not valid JSON
 * @throws {ServerException} When a field has the wrong JSON type (the message names it)
 */
export function parseSubscriptionWebhook(body: unknown): SubscriptionWebhook {
	return decodeWith(SubscriptionWebhookSchema, decodeJsonInput(body));
}
