/**
 * Opens a subscription checkout session for order-1043 (monthly, with a 7-day trial), lists the
 * active subscriptions, reads one with its access, walks its bills, and optionally bills it now
 * (test mode) or cancels it at the end of its paid period.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [SUBSCRIPTION_UUID=sub@…] [TEST_BILL=1] [CANCEL=1] npx tsx subscriptions.ts
 */
import {
	ConflictError,
	DurationUnit,
	hasAccess,
	Placeholders,
	QBitFlow,
	SubscriptionStatus,
} from 'qbitflow';

const client = QBitFlow.fromEnv();

/** Opens the subscription checkout. */
async function createCheckout(client: QBitFlow): Promise<void> {
	// docs:start checkout-create-subscription
	// The subscription exists, with the session's id, once the customer signed (here: started the
	// trial). Act on the subscription.created webhook.
	const session = await client.checkoutSessions.createSubscription({
		productName: 'T-shirt',
		description: 'Blue, size M',
		price: 4.99, // USD per period
		frequency: { value: 1, unit: DurationUnit.Months },
		trialPeriod: { value: 7, unit: DurationUnit.Days },
		reference: 'order-1043',
		successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
		cancelUrl: 'https://shop.example.com/orders/cancel',
	});
	console.log(`Redirect the customer to ${session.link}`);
	// docs:end checkout-create-subscription
}

try {
	await createCheckout(client);
} catch (err) {
	if (!(err instanceof ConflictError && err.code === 'unique_violation')) throw err;
	console.log('order-1043 already has a checkout or a subscription'); // a run before this one
}

// The active subscriptions created in the last 90 days.
const page = await client.subscriptions.list({
	status: SubscriptionStatus.Active,
	createdAfter: new Date(Date.now() - 90 * 24 * 3600 * 1000),
	limit: 10,
});
for (const sub of page.items) {
	console.log(`${sub.uuid} ${sub.status} (reference "${sub.reference ?? ''}")`);
}
const subscriptionUuid = process.env.SUBSCRIPTION_UUID || page.items[0]?.uuid;
if (!subscriptionUuid) {
	console.log('no active subscription to show: set SUBSCRIPTION_UUID=sub@…');
	process.exit(0);
}

{
	// docs:start subscriptions-get
	// Any status, cancelled included. Before its checkout completes, it is a 404.
	const subscription = await client.subscriptions.get(subscriptionUuid);
	console.log(`${subscription.uuid}: ${subscription.status}`);
	console.log(`paid until ${subscription.currentPeriodEnd ?? '—'}`);
	// docs:end subscriptions-get
}

{
	// docs:start has-access
	// Grant access while now < currentPeriodEnd, whatever the status: a stopped or paused
	// subscription has paid for its period.
	const subscription = await client.subscriptions.get(subscriptionUuid);
	if (hasAccess(subscription)) {
		console.log('serve the premium content');
	} else {
		console.log('access ended: show the renewal page');
	}
	// docs:end has-access
}

// Every bill, newest first (the iterator fetches the pages lazily).
for await (const bill of client.subscriptions.iterateBills(subscriptionUuid, { limit: 50 })) {
	console.log(
		`  bill ${bill.uuid}: ${bill.amount} USD for ${bill.periodStart ?? '—'} → ${bill.periodEnd ?? '—'}`
	);
}

if (process.env.TEST_BILL === '1') {
	// docs:start subscriptions-test-bill
	// Test mode only: runs the next billing now, with live's statuses and webhooks. A ConflictError
	// payment_not_due before nextBillingDate.
	const state = await client.subscriptions.executeTestBilling(subscriptionUuid);
	console.log(`billing ${state.stage}: ${state.outcome ?? 'running'} ${state.failureCode ?? ''}`);
	// docs:end subscriptions-test-bill
}

if (process.env.CANCEL !== '1') {
	console.log(`set CANCEL=1 to stop ${subscriptionUuid} at the end of its period`);
	process.exit(0);
}

// docs:start subscriptions-cancel
// immediate: false stops it now (never billed again) and cancels it at the end of the period
// paid for. A ConflictError when it is already stopped or inactive.
const { subscription, pending } = await client.subscriptions.cancel(subscriptionUuid, {
	immediate: false,
});
if (pending) {
	// HTTP 202: the on-chain cancellation is still confirming. It goes on regardless:
	// subscription.statusChanged tells the end.
	console.log('cancellation confirming');
} else {
	console.log(`now ${subscription.status}`); // stopped
}
// docs:end subscriptions-cancel
