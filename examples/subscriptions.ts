/**
 * Opens a subscription checkout session, lists subscriptions with filters, walks a
 * subscription's bills, and cancels one at the end of its paid period.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [CANCEL=1] npx tsx subscriptions.ts
 */
import {
	ConflictError,
	DurationUnit,
	QBitFlow,
	type Subscription,
	SubscriptionStatus,
} from 'qbitflow';

function newClient(): QBitFlow {
	const apiKey = process.env.QBITFLOW_API_KEY;
	if (!apiKey) throw new Error('set QBITFLOW_API_KEY');
	return new QBitFlow(apiKey, { baseUrl: process.env.QBITFLOW_BASE_URL || undefined });
}

/** The access rule: grant access while now < currentPeriodEnd, whatever the status. */
function hasAccess(sub: Subscription, now: Date = new Date()): boolean {
	return sub.currentPeriodEnd !== undefined && now.getTime() < Date.parse(sub.currentPeriodEnd);
}

const client = newClient();

// 1. A monthly plan with a 14-day trial, as an inline product. The Subscription exists, with the
//    session's id, once the customer signed (a trial) or paid: act on the subscription.created
//    webhook.
const session = await client.checkoutSessions.createSubscription({
	productName: 'Pro plan',
	price: 4.99,
	frequency: { value: 1, unit: DurationUnit.Months },
	trialPeriod: { value: 14, unit: DurationUnit.Days },
	customerReference: 'crm-42',
	successUrl: 'https://app.example.com/billing?subscription={{UUID}}',
});
console.log(`Send the customer to ${session.link} (subscription ${session.uuid} once signed)`);

// 2. The active subscriptions created in the last 90 days.
const page = await client.subscriptions.list({
	status: SubscriptionStatus.Active,
	createdAfter: new Date(Date.now() - 90 * 24 * 3600 * 1000),
	limit: 10,
});
for (const sub of page.items) {
	console.log(
		`${sub.uuid} ${sub.status} (customer ref "${sub.customerReference ?? ''}") access=${hasAccess(sub)}`
	);
}
const sub = page.items[0];
if (!sub) {
	console.log('no active subscription to show bills for');
	process.exit(0);
}

// 3. Every bill of the first one, newest first (the iterator fetches the pages lazily).
for await (const bill of client.subscriptions.iterateBills(sub.uuid, { limit: 50 })) {
	console.log(
		`  bill ${bill.uuid}: ${bill.amount} USD for ${bill.periodStart ?? '—'} → ${bill.periodEnd ?? '—'}`
	);
}

// 4. Stop it at the end of the paid period (immediate: false): never billed again, cancelled when
//    the period ends. A 202 (pending) means the on-chain cancel is still confirming:
//    subscription.statusChanged tells the end.
if (process.env.CANCEL !== '1') {
	console.log(`set CANCEL=1 to stop ${sub.uuid} at the end of its period`);
	process.exit(0);
}
try {
	const { subscription, pending } = await client.subscriptions.cancel(sub.uuid, {
		immediate: false,
	});
	console.log(pending ? 'stopping: still confirming on-chain' : `now ${subscription.status}`);
} catch (err) {
	if (!(err instanceof ConflictError)) throw err;
	console.log(`not stopped: ${err.rawMessage} (${err.code})`); // e.g. already stopped
}
