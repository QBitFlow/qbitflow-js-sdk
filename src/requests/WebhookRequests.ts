import { ValidationException } from '../exceptions/index.js';
import { SuccessResponseSchema } from '../schemas.js';
import { decodeJsonInput, encodeCanonical } from '../webhooks/canonical.js';
import {
	HEADER_SIGNATURE,
	HEADER_TIMESTAMP,
	HEADER_WEBHOOK_ID,
	TEST_WEBHOOK_ID,
} from '../webhooks/verify.js';
import { Request } from './Request.js';

/**
 * Remote webhook verification — asks the API to check a signature so you never hold the
 * webhook secret. For verification without a network call see `verifyWebhookSignature`.
 */
export class WebhookRequests extends Request {
	private static readonly BASE_ROUTE = '/webhooks';

	/**
	 * The header name for the HMAC signature sent by QBitFlow (`X-Webhook-Signature-256`).
	 */
	get signatureHeader(): string {
		return HEADER_SIGNATURE;
	}

	/**
	 * The header name for the timestamp sent by QBitFlow (`X-Webhook-Timestamp`).
	 */
	get timestampHeader(): string {
		return HEADER_TIMESTAMP;
	}

	/**
	 * The header name for the webhook id sent by QBitFlow (`X-Webhook-Id`, the transaction
	 * id such as `pay@<uuid>`). Useful for logging and for spotting the dashboard's test probe.
	 */
	get webhookIdHeader(): string {
		return HEADER_WEBHOOK_ID;
	}

	/**
	 * The webhook id used by the dashboard "Test webhook" action to check endpoint
	 * reachability. Verify the signature first, then — when the incoming id matches this
	 * value — respond 200 and skip normal payload processing.
	 */
	get testWebhookId(): string {
		return TEST_WEBHOOK_ID;
	}

	/**
	 * Verify the authenticity of a webhook request through the API.
	 *
	 * The API answers `200` when the signature is valid and `400` when it is not, so only
	 * an HTTP `400` is reported as `false`. Everything else — an unreachable API, a `5xx`,
	 * an expired API key (`401`), an insufficient role (`403`) — is thrown as its own
	 * typed error.
	 *
	 * That distinction matters: treating a failure as "not verified" would make an outage
	 * indistinguishable from a forged signature, and a handler that drops unverified
	 * events would silently discard real payments for as long as the outage lasts. Let
	 * these throw and the caller can return a `5xx`, so QBitFlow retries the delivery.
	 *
	 * The payload is sent exactly as it was received: raw bodies are parsed, and numbers
	 * (including `-0`), `{}` / `[]` and strings round-trip unchanged, so the API hashes the same
	 * canonical form QBitFlow signed.
	 *
	 * @param payload - The webhook body: raw JSON (a string, Buffer, Uint8Array or ArrayBuffer)
	 *   or the already-parsed value (e.g. `req.body` behind `express.json()`)
	 * @param signature - The `X-Webhook-Signature-256` header value
	 * @param timestamp - The `X-Webhook-Timestamp` header value
	 * @returns True if the webhook is valid, false if the API rejected the signature (400)
	 * @throws {ValidationException} A header is missing, or the payload is missing, is not
	 *   valid JSON or contains a value JSON cannot represent (client-side, no `statusCode`)
	 * @throws {UnauthorizedException} The API key is invalid or expired
	 * @throws {ForbiddenException} The API key's role is below `user`
	 * @throws {ServerException} The API failed to answer the verification request
	 * @throws {NetworkException} The API could not be reached
	 */
	async verify(payload: unknown, signature: string, timestamp: string): Promise<boolean> {
		const body = decodeJsonInput(payload);
		if (!signature) {
			throw new ValidationException('webhook signature is required');
		}
		if (!timestamp) {
			throw new ValidationException('webhook timestamp is required');
		}

		// Encoded canonically rather than with JSON.stringify, which would turn -0 into 0.
		const rawBody = encodeCanonical({
			payload: body,
			receivedSignature: signature,
			receivedTimestamp: timestamp,
		});

		try {
			await this.postJson(
				SuccessResponseSchema,
				`${WebhookRequests.BASE_ROUTE}/verify`,
				undefined,
				{
					rawBody,
				}
			);
			return true;
		} catch (error) {
			// HTTP 400 is the API's "signature mismatch" answer. Anything else propagates.
			if (error instanceof ValidationException && error.statusCode === 400) {
				return false;
			}

			throw error;
		}
	}
}
