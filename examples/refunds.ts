/**
 * Refunds half of a payment (a pending refund: no money moves until you sign it in the
 * dashboard), then lists the active refunds.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [PAYMENT_UUID=pay@…] npx tsx refunds.ts
 *
 * Without PAYMENT_UUID, it only lists.
 */
import { ConflictError, QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

/** Starts a refund of half of the payment. */
async function refundHalf(client: QBitFlow, paymentUuid: string): Promise<void> {
	// docs:start refunds-create
	// A pending refund: no money moves until you sign the transfer in the dashboard, from the
	// wallet that was paid. refund.completed tells you when it is sent.
	const refund = await client.refunds.initiate({
		txUuid: paymentUuid, // a payment (pay@…) or a bill (sub-hist@…)
		refundPercent: 50, // of what the customer paid; left out: 100
		reason: 'Damaged item',
	});
	console.log(`refund ${refund.uuid}: ${refund.status}`); // pending
	// docs:end refunds-create
}

const paymentUuid = process.env.PAYMENT_UUID;
if (paymentUuid) {
	try {
		await refundHalf(client, paymentUuid);
	} catch (err) {
		if (!(err instanceof ConflictError && err.code === 'refund_already_exists')) throw err;
		console.log(`already refunded: ${String(err.details.refundUuid)}`); // one per transaction
	}
}

// docs:start refunds-list
// The refunds waiting for an answer (listInactive / iterateInactive: the answered ones).
const refunds = await client.refunds.list();
for (const refund of refunds) {
	console.log(`${refund.uuid} of ${refund.txUuid}: ${refund.amountUsd} USD, ${refund.reason}`);
}
// docs:end refunds-list
