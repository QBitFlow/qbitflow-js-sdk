import { SuccessResponse } from "../types";
import { Request } from "./Request";



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
	 * Verify the authenticity of a webhook request
	 * @param payload - The raw JSON payload received from the webhook
	 * @param signature - The signature header sent by QBitFlow
	 * @param timestamp - The timestamp header sent by QBitFlow
	 * @returns True if the webhook is valid, false otherwise
	 */
	async verify(payload: any, signature: string, timestamp: string): Promise<boolean> {
		try {
			await this.postReq<SuccessResponse>(`${WebhookRequests.BASE_ROUTE}/verify`, {
			payload,
			receivedSignature: signature,
			receivedTimestamp: timestamp,
		});
		return true;
		} catch {
			return false;
		}
	}
}