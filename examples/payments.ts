/**
 * Reads payments: one page with a filter, one payment by its id and by your order reference
 * (order-1042), every payment of the last 30 days with the iterator, the feed of payments and
 * bills together, and exact amount display.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [PAYMENT_UUID=pay@…] npx tsx payments.ts
 *
 * Without PAYMENT_UUID, the first payment listed is read.
 */
import { formatAmount, NotFoundError, parseAmount, QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

// docs:start payments-list
const page = await client.payments.list({
	createdAfter: new Date(Date.now() - 30 * 24 * 3600 * 1000), // the last 30 days
	limit: 10,
});
for (const payment of page.items) {
	// Amounts are decimal strings: the token's (amount, in currency) and USD (amountUsd).
	const { uuid, reference, amount, currency, amountUsd } = payment;
	console.log(`${uuid} "${reference ?? ''}": ${amount} ${currency.symbol} (${amountUsd} USD)`);
}
if (page.hasMore) {
	// Pass it back, verbatim, as the cursor param for the next page.
	console.log(`next cursor: ${page.nextCursor}`);
}
// docs:end payments-list

/** Reads a payment by its id, and order-1042's payment. */
async function getPayment(client: QBitFlow, paymentUuid: string): Promise<void> {
	// docs:start payments-get
	const payment = await client.payments.get(paymentUuid); // pay@…, the checkout session's id
	console.log(payment.uuid, payment.reference, payment.amountUsd, 'USD', payment.metadata);

	// Runs GET /payments?reference= and returns its one payment: a NotFoundError (404,
	// not_found) until the customer paid.
	const byReference = await client.payments.getByReference('order-1042');
	console.log(`order-1042 was paid by ${byReference.from}`);
	// docs:end payments-get
}

const paymentUuid = process.env.PAYMENT_UUID || page.items[0]?.uuid;
if (paymentUuid) {
	try {
		await getPayment(client, paymentUuid);
	} catch (err) {
		if (!(err instanceof NotFoundError)) throw err;
		console.log(`not found: ${err.message}`); // e.g. order-1042 is not paid yet
	}
}

// docs:start pagination-iterate
// Every payment of the last 30 days: the iterator fetches the pages one at a time, as the loop
// consumes them, and stops when you break (or after the page whose hasMore is false).
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
let count = 0;
for await (const payment of client.payments.iterate({ createdAfter: since, limit: 50 })) {
	count++;
	console.log(payment.uuid, payment.amountUsd, 'USD');
}
console.log(`${count} payments over the last 30 days`);
// docs:end pagination-iterate

// docs:start transactions-list
// One feed of one-time payments and subscription bills, newest first; each row reads like its
// resource. `type` filters it to one kind (TransactionKind.Payment or TransactionKind.Bill).
const feed = await client.transactions.list({ limit: 20 });
for (const tx of feed.items) {
	console.log(tx.type, tx.uuid, tx.amountUsd, 'USD');
}
// docs:end transactions-list

// docs:start amounts-display
// Token amounts come both ways, as decimal strings: payment.amount ('4.99') and
// payment.amountMinUnits ('4990000', with payment.currency.decimals). Convert between them with
// string arithmetic, never floats.
const shown = formatAmount('4990000', 6); // '4.99' (USDC has 6 decimals)
const minUnits = parseAmount('4.99', 6); // '4990000'
console.log(`${shown} USDC = ${minUnits} minimal units`);
// docs:end amounts-display
