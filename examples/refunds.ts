/**
 * Lists the pending refunds (customers' requests) and reads one.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx refunds.ts
 *
 * Refunds are read only in the SDK: they are answered, or sent, from the dashboard.
 */
import { QBitFlow, RefundStatus } from 'qbitflow';

const client = QBitFlow.fromEnv();

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
	// pending (a customer's request), approved or rejected.
	const { uuid, status, refundPercent, amount, currency } = refund;
	console.log(`${uuid}: ${status}, ${refundPercent}% = ${amount} ${currency.symbol}`);
	// docs:end refunds-get
}
