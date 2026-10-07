/**
 * Opens a one-time payment checkout session, polls its status, and expires it.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx checkout.ts
 *
 * In production, fulfil the order on the payment.completed webhook (see webhook-handler.ts);
 * polling getStatus is for scripts and dashboards.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { CheckoutSessionStatusValue, QBitFlow } from 'qbitflow';

function newClient(): QBitFlow {
	const apiKey = process.env.QBITFLOW_API_KEY;
	if (!apiKey) throw new Error('set QBITFLOW_API_KEY');
	// A bad key format or option throws a ValidationError here; nothing is sent.
	return new QBitFlow(apiKey, { baseUrl: process.env.QBITFLOW_BASE_URL || undefined });
}

const client = newClient();

// An inline product (no product needed in the catalog). {{UUID}} is replaced with the session's
// id on redirect.
const session = await client.checkoutSessions.createPayment({
	productName: 'T-shirt',
	description: 'Blue, size M',
	price: 4.99,
	reference: `order-${Date.now()}`,
	successUrl: 'https://shop.example.com/thanks?session={{UUID}}',
	cancelUrl: 'https://shop.example.com/cart',
});
console.log(`Send the customer to ${session.link}`);
console.log(`(session ${session.uuid}, expires at ${session.expiresAt ?? '—'})`);

// Poll a few times. "created" with lastAttempt set is a failed attempt: the customer may still
// pay from the same checkout, so never cancel the order on it.
for (let i = 0; i < 3; i++) {
	const status = await client.checkoutSessions.getStatus(session.uuid);
	console.log(`status: ${status.status}`);
	if (status.lastAttempt) console.log(`  last attempt failed: ${status.lastAttempt.code ?? ''}`);
	if (status.status === CheckoutSessionStatusValue.Completed) {
		const payment = await client.payments.get(session.uuid); // same id as the session
		console.log(
			`paid: ${payment.amount} USD (currency ${payment.currencyId}), tx ${payment.txHash}`
		);
		process.exit(0);
	}
	await sleep(2000);
}

// Give up: expire the session (a ConflictError tx_already_sent once the customer is paying).
const expired = await client.checkoutSessions.expire(session.uuid);
console.log(`expired: ${expired.status}`);
