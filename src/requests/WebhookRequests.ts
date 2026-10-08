import { ValidationException } from "../exceptions";
import { SuccessResponse } from "../types";
import { Request } from "./Request";

// Frontend test webhook ID for testing purposes and ensure that the webhook can be reached
export const TEST_WEBHOOK_ID = "test-webhook-id"

// HMAC headers
const HEADER_SIGNATURE = "X-Webhook-Signature-256"
const HEADER_TIMESTAMP = "X-Webhook-Timestamp"
const HEADER_WEBHOOK_ID = "X-Webhook-ID"

export class WebhookRequests extends Request {
	private static readonly BASE_ROUTE = '/webhooks';

	/**	
	 * The header name for the HMAC signature sent by QBitFlow. You can use this to extract the signature from the request headers when verifying the webhook.
	 */
	get signatureHeader() {
		return HEADER_SIGNATURE;
	}

	/**	
	 * The header name for the timestamp sent by QBitFlow. You can use this to extract the timestamp from the request headers when verifying the webhook.
	 */
	get timestampHeader() {
		return HEADER_TIMESTAMP;
	}

	/**
	 * The header name for the unique webhook ID sent by QBitFlow. This can be used for logging or debugging purposes to identify specific webhook events.
	 */
	get webhookIdHeader() {
		return HEADER_WEBHOOK_ID;
	}

	/**
	 * The webhook ID used by the dashboard "Test webhook" action to check endpoint reachability.
	 * When the incoming webhook ID matches this value, the payload is a fake test event —
	 * respond with HTTP 200 immediately and skip normal payload processing.
	 */
	get testWebhookId() {
		return TEST_WEBHOOK_ID;
	}

	/**
	 * Verify the authenticity of a webhook request.
	 *
	 * The API answers `200` when the signature is valid and `400` when it is not, so only
	 * a `400` is reported as `false`. Everything else — an unreachable API, a `500`, an
	 * expired API key (`401`), an insufficient role (`403`) — is thrown.
	 *
	 * That distinction matters: treating a failure as "not verified" would make an outage
	 * indistinguishable from a forged signature, and a handler that drops unverified
	 * events would silently discard real payments for as long as the outage lasts. Let
	 * these throw and the caller can return a `5xx`, so QBitFlow retries the delivery.
	 *
	 * @param payload - The raw JSON payload received from the webhook
	 * @param signature - The signature header sent by QBitFlow
	 * @param timestamp - The timestamp header sent by QBitFlow
	 * @returns True if the webhook is valid, false if the signature was rejected
	 * @throws {UnauthorizedException} The API key is invalid or expired
	 * @throws {ForbiddenException} The API key's role is below `user`
	 * @throws {ServerException} The API failed to answer the verification request
	 * @throws {NetworkException} The API could not be reached
	 */
	async verify(payload: any, signature: string, timestamp: string): Promise<boolean> {
		try {
			await this.postReq<SuccessResponse>(`${ WebhookRequests.BASE_ROUTE }/verify`, {
				payload,
				receivedSignature: signature,
				receivedTimestamp: timestamp,
			});
			return true;
		} catch (error) {
			// A 400 is the API's "signature rejected" answer. The SDK always sends all
			// three required fields, so a 400 cannot mean a malformed request here.
			if (error instanceof ValidationException) {
				return false;
			}

			throw error;
		}
	}
}