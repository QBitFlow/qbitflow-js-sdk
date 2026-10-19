/**
 * Refunds half of a payment (a pending refund: no money moves until you sign it in the
 * dashboard), then lists the pending refunds and reads one.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [PAYMENT_UUID=pay@…] npx tsx refunds.ts
 *
 * Without PAYMENT_UUID, it only lists and reads.
 */
import { ConflictError, QBitFlow, RefundStatus } from 'qbitflow';

const client = QBitFlow.fromEnv();

/** Starts a refund of half of the payment. */
async function refundHalf(client: QBitFlow, paymentUuid: string): Promise<void> {
	// docs:start refunds-create
	// A pending refund: no money moves until you sign the transfer in the dashboard, from the
	// wallet that was paid. refund.approved tells you when it is sent.
	const refund = await client.refunds.create({
		txUuid: paymentUuid, // a payment (pay@…) or a bill (sub-hist@…)
		refundPercent: '50', // a percent string, of what the customer paid; left out: '100'
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
// The active ones: pending, waiting for an answer (no status: every status).
const page = await client.refunds.list({ status: [RefundStatus.Pending] });
for (const refund of page.items) {
	const { uuid, txUuid, initiatedBy, reason, amount, currency } = refund;
	console.log(`${uuid} of ${txUuid} (${initiatedBy}): ${amount} ${currency.symbol}, ${reason}`);
}
// docs:end refunds-list

const refundUuid = page.items[0]?.uuid;
if (refundUuid) {
	// docs:start refunds-get
	const refund = await client.refunds.get(refundUuid); // refund@…
	// pending, approved, rejected or cancelled (a merchant's draft dropped before it was sent).
	const { uuid, status, refundPercent, amount, currency } = refund;
	console.log(`${uuid}: ${status}, ${refundPercent}% = ${amount} ${currency.symbol}`);
	// docs:end refunds-get
}
