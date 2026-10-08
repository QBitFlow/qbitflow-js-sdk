/**
 * Shows how the SDK reports errors and retries: automatic retries with an idempotency key derived
 * from the order, the error classes with instanceof, isRetryable, a stable Idempotency-Key across
 * processes, and cancelling a call with an AbortSignal.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx errors-and-retries.ts
 *
 * It opens (then expires) a checkout for order-1042, and creates (then deletes) a customer.
 */
import {
	ApiError,
	AuthenticationError,
	ConflictError,
	IdempotencyError,
	isRetryable,
	NetworkError,
	NotFoundError,
	PermissionDeniedError,
	QBitFlow,
	RateLimitError,
	ServerError,
	ValidationError,
} from 'qbitflow';

// docs:start retries-idempotency
// Reads and the 7 creates are retried on network errors, 5xx and 429, waiting 1 s, 2 s, 4 s…
// (default: 3 retries; 0 turns them off). timeout bounds each attempt, in milliseconds.
const client = QBitFlow.fromEnv({ maxRetries: 5, timeout: 15_000 });

// Each create sends an Idempotency-Key, the same on its retries. A key derived from the order
// also covers a job re-run after a crash: the same key returns the first session instead of
// opening a second one.
const orderId = 'order-1042';
const session = await client.checkoutSessions.createPayment(
	{ productName: 'T-shirt', description: 'Blue, size M', price: 4.99, reference: orderId },
	{ idempotencyKey: `checkout-${orderId}` }
);
console.log(`Redirect the customer to ${session.link}`);
// docs:end retries-idempotency

// A demo: expire it, so that order-1042 can be used again (a replayed create answers the same,
// already expired, session).
try {
	await client.checkoutSessions.expire(session.uuid);
} catch (err) {
	if (!(err instanceof ConflictError || err instanceof NotFoundError)) throw err;
}

// docs:start errors-handling
try {
	const payment = await client.payments.getByReference('order-1042');
	console.log(`order-1042 paid: ${payment.amount} USD`);
} catch (err) {
	if (err instanceof NotFoundError) {
		console.log('no payment for order-1042 yet');
	} else if (err instanceof ValidationError) {
		// Refused before sending (status undefined) or by the API (400).
		for (const f of err.fieldErrors) console.log(`${f.field}: ${f.message}`);
	} else if (err instanceof ApiError) {
		// Branch on status and code, never on the message. Quote requestId to support.
		console.log(`QBitFlow error ${err.status} ${err.code} (request ${err.requestId})`);
		if (isRetryable(err)) console.log('transient: try again later');
	} else {
		throw err;
	}
}
// docs:end errors-handling

/** Prints what an error is, the way an application would branch on it. */
function describe(what: string, err: unknown): void {
	if (err === undefined) {
		console.log(`${what}: ok`);
	} else if (err instanceof ValidationError) {
		// status undefined: refused before sending; 400: refused by the API.
		console.log(`${what}: invalid input (status ${err.status ?? 'none'})`);
		for (const f of err.fieldErrors) console.log(`  ${f.field}: ${f.message}`);
	} else if (err instanceof NotFoundError) {
		console.log(`${what}: not found (request ${err.requestId})`);
	} else if (err instanceof ConflictError) {
		// e.g. unique_violation, details.field naming the value taken
		console.log(`${what}: conflict ${err.code}, details ${JSON.stringify(err.details)}`);
	} else if (err instanceof IdempotencyError) {
		console.log(`${what}: idempotency key reused with another request: use a new key`);
	} else if (err instanceof RateLimitError) {
		console.log(`${what}: rate limited: retry after ${err.retryAfter} s`);
	} else if (err instanceof AuthenticationError) {
		console.log(`${what}: bad API key`);
	} else if (err instanceof PermissionDeniedError) {
		console.log(`${what}: not allowed: ${err.code}`); // forbidden, policy_disabled, plan_required
	} else if (err instanceof NetworkError || err instanceof ServerError) {
		console.log(`${what}: transient (retryable: ${isRetryable(err)}): ${err.message}`);
	} else if (err instanceof ApiError) {
		console.log(`${what}: API error ${err.status} ${err.code}`);
	} else {
		console.log(`${what}:`, err);
	}
}

/** Runs a call and returns its error, if any. */
async function attempt(call: () => Promise<unknown>): Promise<unknown> {
	try {
		await call();
		return undefined;
	} catch (err) {
		return err;
	}
}

// 1. Client-side validation: nothing is sent.
describe('invalid params', await attempt(() => client.products.create({ name: 'x', price: -1 })));

// 2. A 404 from the API.
describe(
	'unknown session',
	await attempt(() =>
		client.checkoutSessions.getStatus('pay@019eca82-5680-7b00-8000-00000000dead')
	)
);

// 3. A call cancelled by its signal (here: at once): a NetworkError, cause = the signal's reason.
describe(
	'cancelled',
	await attempt(() => client.payments.list({ limit: 1 }, { signal: AbortSignal.abort() }))
);

// 4. An idempotent create with your own key: the same key replays the first result instead of
//    creating a second customer, even from another process after a crash. Reusing the key with
//    another body is a 422 (IdempotencyError).
const idempotencyKey = `signup-${Date.now()}`;
const params = { name: 'Ada', email: `ada+${idempotencyKey}@example.com` };
const first = await client.customers.create(params, { idempotencyKey, requestId: 'signup-42' });
const again = await client.customers.create(params, { idempotencyKey });
console.log(`same customer both times: ${first.uuid === again.uuid} (${first.uuid})`);
describe(
	'same key, other body',
	await attempt(() => client.customers.create({ ...params, name: 'Grace' }, { idempotencyKey }))
);

// 5. A unique value taken twice: a 409 unique_violation, details.field naming it.
describe(
	'email taken',
	await attempt(() => client.customers.create({ name: 'Ada', email: first.email }))
);

await client.customers.delete(first.uuid); // clean up
