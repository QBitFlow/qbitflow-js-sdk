/**
 * Lists the recent payment.completed webhook events, and optionally registers a webhook endpoint
 * and stores its signing secret.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [CREATE_ENDPOINT=1] npx tsx webhooks.ts
 *
 * CREATE_ENDPOINT=1 registers https://shop.example.com/webhooks/qbitflow and writes its secret to
 * ./qbitflow-webhook-secret (mode 0600). Point an endpoint at your own receiver (see
 * webhook-handler.ts) with the dashboard, or by changing the url below.
 */
import { writeFile } from 'node:fs/promises';

import { EventType, QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

/** Stands for your secret store: the secret is a credential, never log it. */
async function storeSecret(name: string, value: string): Promise<void> {
	await writeFile(`./${name.toLowerCase().replaceAll('_', '-')}`, value, { mode: 0o600 });
	console.log(`${name} stored`);
}

if (process.env.CREATE_ENDPOINT === '1') {
	// docs:start webhook-endpoint-create
	const endpoint = await client.webhooks.endpoints.create({
		url: 'https://shop.example.com/webhooks/qbitflow',
		// Left out: every type, including the ones added later.
		events: [
			EventType.PaymentCompleted,
			EventType.CheckoutExpired,
			EventType.SubscriptionStatusChanged,
		],
		description: 'Order fulfilment',
	});
	// The whsec_… signing secret is returned only this once: store it now.
	await storeSecret('QBITFLOW_WEBHOOK_SECRET', endpoint.secret);
	console.log(`endpoint ${endpoint.uuid} created`);
	// docs:end webhook-endpoint-create
}

// docs:start events-list
// Newest first; one page (iterate walks them all).
const page = await client.webhooks.events.list({ type: EventType.PaymentCompleted, limit: 10 });
for (const event of page.items) {
	console.log(`${event.id} ${event.type} at ${event.createdAt}`);
}
// docs:end events-list
