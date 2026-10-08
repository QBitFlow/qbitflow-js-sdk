/**
 * The lower level under the webhook router: verifies a delivery's QBitFlow-Signature header over
 * its raw body and parses the event with webhooks.constructEvent. Runs offline: it signs sample
 * bodies with webhooks.sign (as QBitFlow would), then feeds them to the handler, a tampered one
 * included.
 *
 *     QBITFLOW_WEBHOOK_SECRET=whsec_… npx tsx webhook-verify.ts
 *
 * In an HTTP server, rawBody is the request's body exactly as received (never JSON.parse and
 * re-serialize it) and signatureHeader its QBitFlow-Signature header.
 */
import { ValidationError, webhooks, WebhookSignatureError } from 'qbitflow';

const signingSecret = process.env.QBITFLOW_WEBHOOK_SECRET;
if (!signingSecret) throw new Error('set QBITFLOW_WEBHOOK_SECRET (any whsec_… value works here)');

/** Handles one delivery; returns the HTTP status to answer QBitFlow with. */
function handleDelivery(rawBody: string | Buffer, signatureHeader: string | undefined): number {
	// docs:start webhook-verify
	const secret = process.env.QBITFLOW_WEBHOOK_SECRET!;
	try {
		// rawBody: the body exactly as received; signatureHeader: its QBitFlow-Signature header.
		const event = webhooks.constructEvent(rawBody, signatureHeader, secret);
		if (event.type === 'payment.completed') {
			console.log(`fulfil order ${event.data.reference}`); // event.data is a PaymentCompleted
		}
		return 200; // acknowledge every event, the types you ignore included
	} catch (err) {
		if (err instanceof WebhookSignatureError) {
			console.log(`rejected: ${err.reason}`); // e.g. noMatchingSignature
			return 400;
		}
		if (err instanceof ValidationError) {
			console.log(`not a v2 event: ${err.message}`);
			return 400;
		}
		throw err;
	}
	// docs:end webhook-verify
}

const body = JSON.stringify({
	id: 'evt_example_1',
	type: 'payment.completed',
	version: 'v2',
	createdAt: new Date().toISOString(),
	test: true,
	data: {
		uuid: 'pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f',
		reference: 'order-1042',
		amount: 4.99,
	},
});
const header = webhooks.sign(body, signingSecret);

console.log('genuine delivery →', handleDelivery(body, header)); // 200
console.log('tampered body →', handleDelivery(body.replace('4.99', '0.01'), header)); // 400
console.log('no header →', handleDelivery(body, undefined)); // 400
