/**
 * Opens a one-time payment checkout session for order-1042, reads its status, optionally waits for
 * it to finish, and expires it when it is still open.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [WAIT=1] npx tsx checkout.ts
 *
 * In production, fulfil the order on the payment.completed webhook (see webhook-handler.ts);
 * getStatus and waitForCompletion are for success pages, scripts and back-office jobs.
 */
import { CheckoutSessionStatusValue, Placeholders, QBitFlow } from 'qbitflow';

// QBITFLOW_API_KEY, and QBITFLOW_BASE_URL when set. A bad key format throws a ValidationError
// here; nothing is sent.
const client = QBitFlow.fromEnv();

// docs:start checkout-create-payment
// An inline product: nothing needs to exist in your catalog. QBitFlow replaces {{UUID}} with the
// session's id on the redirect.
const session = await client.checkoutSessions.createPayment({
	productName: 'T-shirt',
	description: 'Blue, size M',
	price: 4.99, // USD
	reference: 'order-1042', // your order id: unique per space
	successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/orders/cancel',
});

// Redirect the customer to the hosted checkout page.
console.log(`Redirect the customer to ${session.link}`);
// docs:end checkout-create-payment

const sessionUuid = session.uuid;

// docs:start checkout-status
const status = await client.checkoutSessions.getStatus(sessionUuid);
switch (status.status) {
	case CheckoutSessionStatusValue.Completed:
		console.log(`paid, tx ${status.txHash}`);
		break;
	case CheckoutSessionStatusValue.Expired:
		console.log('expired unpaid');
		break;
	case CheckoutSessionStatusValue.WaitingConfirmation:
		console.log('sent, waiting for the network');
		break;
	default:
		// created: waiting for the customer. A failed attempt (lastAttempt) is not final: the
		// customer can still pay from the same checkout.
		console.log(`open (${status.status}), last attempt: ${status.lastAttempt?.code ?? 'none'}`);
}
// docs:end checkout-status

if (process.env.WAIT === '1') {
	// docs:start wait-for-completion
	// Polls getStatus until the session is completed or expired. When the timeout comes first,
	// it returns the last status seen: check it.
	const final = await client.checkoutSessions.waitForCompletion(sessionUuid, {
		timeout: 10 * 60_000, // ms
		interval: 5_000, // ms, at least 1000
	});
	if (final.status === CheckoutSessionStatusValue.Completed) {
		console.log(`paid, tx ${final.txHash}`);
	} else {
		console.log(`not paid: ${final.status}`); // expired, or still open at the timeout
	}
	// docs:end wait-for-completion
}

// Still waiting for the customer: give up on this demo order.
const latest = await client.checkoutSessions.getStatus(sessionUuid);
if (latest.status !== CheckoutSessionStatusValue.Created) process.exit(0);

// docs:start checkout-expire
// The customer can no longer pay it, and checkout.expired follows. Once they paid or are paying,
// it is a ConflictError tx_already_sent.
const expired = await client.checkoutSessions.expire(sessionUuid);
console.log(`checkout ${expired.status}`); // expired
// docs:end checkout-expire
