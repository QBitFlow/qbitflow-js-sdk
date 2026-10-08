/**
 * Receives QBitFlow webhooks with node:http and the SDK's webhook router: the router verifies each
 * delivery's signature over the raw body, parses the event, runs the handlers registered for its
 * type and answers QBitFlow (200, 400 for a bad signature, 500 when a handler throws: QBitFlow
 * retries it later).
 *
 *     QBITFLOW_WEBHOOK_SECRET=whsec_… [QBITFLOW_API_KEY=sk_…] [QBITFLOW_BASE_URL=…] npx tsx webhook-handler.ts
 *
 * The secret is the one webhooks.endpoints.create returned (shown once; see webhooks.ts). The API
 * key is only used for follow-up reads. With Express, mount the same handler behind
 * express.raw({ type: 'application/json' }) (see README.md); with Next.js, Hono, Bun, Deno or
 * Cloudflare Workers, use router.fetchHandler().
 */
import { createServer } from 'node:http';

import { formatAmount, hasAccess, QBitFlow, webhooks } from 'qbitflow';

if (!process.env.QBITFLOW_WEBHOOK_SECRET) throw new Error('set QBITFLOW_WEBHOOK_SECRET');
// Verification needs only the secret: the client is for follow-up reads.
const client = process.env.QBITFLOW_API_KEY ? QBitFlow.fromEnv() : undefined;

// Deduplicates on the event's id: deliveries are at least once (a retry carries the same id).
// Use your database in production.
const fulfilled = new Set<string>();

/** Fulfils an order once, whatever the number of deliveries. */
async function fulfilOrder(reference: string | undefined, eventId: string): Promise<void> {
	if (fulfilled.has(eventId)) return; // a retry of an event already handled
	console.log(`fulfil order "${reference ?? ''}" (event ${eventId})`);
	fulfilled.add(eventId);
}

// docs:start webhook-handler
const router = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!, {
		// Every 400 (bad signature or body: event null) and 500 (a handler threw). The router
		// answers without the details: log them here.
		onError: (event, err) => console.error('webhook rejected:', event?.id, err.message),
	})
	.on('payment.completed', async (payment, event) => {
		await fulfilOrder(payment.reference, event.id); // idempotent: deduplicates on event.id
	});

// nodeHandler() reads the raw body itself (at most 1 MiB): mount it before any body parser.
const handleWebhook = router.nodeHandler();
createServer((req, res) => {
	if (req.url === '/webhooks/qbitflow') void handleWebhook(req, res);
	else res.writeHead(404).end();
}).listen(8080);
// docs:end webhook-handler

console.log('listening on :8080, POST /webhooks/qbitflow');

// More handlers on the same router. Several per type run in registration order.
router
	.on('payment.completed', async (payment, event) => {
		const exact = payment.currency
			? ` (${formatAmount(payment.amountMinUnits, payment.currency.decimals)} ${payment.currency.symbol})`
			: '';
		console.log(`payment ${payment.uuid}: ${payment.amount} USD${exact}`);
		// A member's payment names them in event.userUuid: read more in their space with
		// onBehalfOf.
		if (event.userUuid && client) {
			const full = await client.onBehalfOf(event.userUuid).payments.get(payment.uuid);
			console.log(`  paid by ${full.from}`);
		}
	})
	.on('subscription.created', (sub) => {
		console.log(
			`subscription ${sub.uuid} created (${sub.status}), access: ${hasAccess(sub)} until ${sub.currentPeriodEnd ?? '—'}`
		);
	})
	.on('subscription.billed', (bill) => {
		console.log(
			`subscription ${bill.subscriptionUuid} billed: ${bill.amount} USD (bill ${bill.uuid})`
		);
	})
	.on('subscription.statusChanged', (sub) => {
		console.log(
			`subscription ${sub.uuid}: ${sub.previousStatus} → ${sub.status}, access: ${hasAccess(sub)}`
		);
	})
	.on('subscription.billingFailed', (sub) => {
		console.log(
			`subscription ${sub.uuid}: billing failed (${sub.reason}), ${sub.remainingAttempts} attempts left`
		);
	})
	.on('refund.completed', (refund) => {
		console.log(`refund ${refund.uuid} of ${refund.txUuid} sent`);
	})
	.on('member.joined', (member) => {
		console.log(
			`member ${member.email} joined (invitation ${member.invitationUuid}): sell with onBehalfOf('${member.userUuid}')`
		);
	})
	.on('checkout.expired', (session) => {
		if (webhooks.isSubscriptionSession(session)) {
			console.log(`subscription checkout ${session.uuid} expired`);
		} else {
			console.log(`payment checkout ${session.uuid} expired: release the order`);
		}
	})
	.on('webhook.test', (test) => {
		console.log(`test event for endpoint ${test.endpointUuid}: ${test.message}`);
	})
	// A type newer than this SDK: acknowledged (200) like every type without a handler.
	.onUnknown((event) => {
		console.log(`ignored ${String(event.type)}`);
	});
