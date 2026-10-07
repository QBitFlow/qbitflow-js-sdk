/**
 * Receives QBitFlow webhooks with node:http: it verifies each delivery's signature over the raw
 * body, parses the event, and acts on the types it cares about.
 *
 *     QBITFLOW_WEBHOOK_SECRET=whsec_… [QBITFLOW_API_KEY=sk_…] [QBITFLOW_BASE_URL=…] npx tsx webhook-handler.ts
 *
 * The secret is the one webhooks.endpoints.create returned (shown once). The API key is only used
 * for follow-up reads. With Express, mount express.raw({ type: 'application/json' }) on this route
 * and pass req.body (a Buffer) to webhooks.constructEvent the same way.
 */
import { createServer, type IncomingMessage } from 'node:http';

import { type Event, QBitFlow, ValidationError, WebhookSignatureError, webhooks } from 'qbitflow';

const MAX_BODY = 1 << 20; // 1 MiB: QBitFlow's events are far smaller

const secret = process.env.QBITFLOW_WEBHOOK_SECRET;
if (!secret) throw new Error('set QBITFLOW_WEBHOOK_SECRET');
// Verification needs only the secret: the client is for follow-up reads.
const client = process.env.QBITFLOW_API_KEY
	? new QBitFlow(process.env.QBITFLOW_API_KEY, {
			baseUrl: process.env.QBITFLOW_BASE_URL || undefined,
		})
	: undefined;

// Deduplicates on the event's id: deliveries are at least once (a retry carries the same id).
// Use your database in production.
const seen = new Set<string>();

/** Reads the raw body: the bytes as received, never JSON.parse'd and re-serialized. */
async function readBody(req: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > MAX_BODY) throw new Error('body too large');
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks);
}

async function handle(event: Event): Promise<void> {
	// event.type narrows event.data to its model in each case.
	switch (event.type) {
		case 'payment.completed': {
			const payment = event.data;
			console.log(
				`payment ${payment.uuid} completed: order "${payment.reference ?? ''}", ${payment.amount} USD`
			);
			// Fulfil the order here. A member's payment names them in event.userUuid: read more in
			// their space with onBehalfOf.
			if (event.userUuid && client) {
				const full = await client.onBehalfOf(event.userUuid).payments.get(payment.uuid);
				console.log(`  paid by ${full.from}`);
			}
			break;
		}
		case 'subscription.created':
			console.log(
				`subscription ${event.data.uuid} created (${event.data.status}), access until ${event.data.currentPeriodEnd ?? '—'}`
			);
			break;
		case 'subscription.billed':
			console.log(
				`subscription ${event.data.subscriptionUuid} billed: ${event.data.amount} USD (bill ${event.data.uuid})`
			);
			break;
		case 'subscription.statusChanged':
			console.log(
				`subscription ${event.data.uuid}: ${event.data.previousStatus} → ${event.data.status}`
			);
			break;
		case 'subscription.billingFailed':
			console.log(
				`subscription ${event.data.uuid}: billing failed (${event.data.reason}), ${event.data.remainingAttempts} attempts left`
			);
			break;
		case 'refund.completed':
			console.log(`refund ${event.data.uuid} of ${event.data.txUuid} sent`);
			break;
		case 'member.joined':
			console.log(
				`member ${event.data.email} joined (invitation ${event.data.invitationUuid}): sell with onBehalfOf('${event.data.userUuid}')`
			);
			break;
		case 'checkout.expired':
			if (webhooks.isSubscriptionSession(event.data)) {
				console.log(`subscription checkout ${event.data.uuid} expired`);
			} else {
				console.log(`payment checkout ${event.data.uuid} expired: release the order`);
			}
			break;
		case 'webhook.test':
			console.log(
				`test event for endpoint ${event.data.endpointUuid}: ${event.data.message}`
			);
			break;
		default:
			// A type this handler ignores, or one newer than this SDK (webhooks.isUnknownEvent):
			// acknowledge it.
			console.log(`ignored ${String(event.type)}`);
	}
}

const server = createServer(async (req, res) => {
	if (req.method !== 'POST' || req.url !== '/webhooks/qbitflow') {
		res.writeHead(404).end();
		return;
	}

	let event: Event;
	try {
		const rawBody = await readBody(req);
		// Checks the QBitFlow-Signature header (timestamp and HMAC), then parses the body.
		event = webhooks.constructEvent(rawBody, req.headers['qbitflow-signature'], secret);
	} catch (err) {
		if (err instanceof WebhookSignatureError) console.warn(`rejected delivery: ${err.reason}`);
		// A ValidationError: not a v2 event (an endpoint still on v1: move it to v2 in the dashboard).
		else if (err instanceof ValidationError) console.warn(`not a v2 event: ${err.message}`);
		res.writeHead(400).end();
		return;
	}

	if (seen.has(event.id)) {
		res.writeHead(200).end(); // a retry of an event already handled
		return;
	}
	seen.add(event.id);
	try {
		await handle(event);
	} catch (err) {
		// A non-2xx makes QBitFlow deliver it again later.
		console.error(`event ${event.id} (${event.type}):`, err);
		seen.delete(event.id);
		res.writeHead(500).end();
		return;
	}
	// Answer 2xx fast, to the events you ignore too.
	res.writeHead(200).end();
});

server.listen(8080, () => console.log('listening on :8080, POST /webhooks/qbitflow'));
