/**
 * Live checks against a QBitFlow API (mirrors the Go SDK's integration_test.go).
 *
 * The suite reads its target from the environment — it never defaults to a URL:
 *
 * - `QBITFLOW_API_KEY` and `QBITFLOW_BASE_URL` set → it runs against that server;
 * - `QBITFLOW_API_KEY` set without `QBITFLOW_BASE_URL` → it FAILS, naming the missing variable;
 * - neither set → it is skipped, so the offline `npm test` stays green.
 *
 * The read-only group only reads. The write group also needs `QBITFLOW_LIVE_WRITES=1`, and a
 * test-mode key (per `me()`) unless `QBITFLOW_ALLOW_LIVE_MODE_WRITES=1`; it creates a product, a
 * customer, three checkout sessions (a payment's and a subscription's with fees) and a webhook
 * endpoint, and deletes (or expires) each of them; it sets and deletes a metadata key on the
 * latest subscription, if there is one.
 *
 *     set -a; source ../.local.env; set +a   # never print it
 *     npm run test:live
 */

import { QBitFlow } from '../src/client';
import { ConflictError, NotFoundError, PermissionDeniedError } from '../src/errors';
import type { CheckoutFees } from '../src/models/checkout';
import type { Me } from '../src/models/members';

const KEY = process.env.QBITFLOW_API_KEY ?? '';
const BASE = process.env.QBITFLOW_BASE_URL ?? '';
const WRITES = process.env.QBITFLOW_LIVE_WRITES === '1';
const ALLOW_LIVE = process.env.QBITFLOW_ALLOW_LIVE_MODE_WRITES === '1';

const live = KEY ? describe : describe.skip;
jest.setTimeout(120_000);

function liveClient(): QBitFlow {
	if (!BASE) {
		throw new Error(
			'QBITFLOW_API_KEY is set but QBITFLOW_BASE_URL is not: set the API base URL explicitly (see tests/README.md).'
		);
	}
	return new QBitFlow({ apiKey: KEY, baseUrl: BASE });
}

const isOrganizationKey = (me: Me): boolean => me.role === 'admin' && !me.onBehalfOfUserUuid;
const suffix = (): string => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** Runs `f`; a 404 (already gone) is fine. */
async function cleanup(f: () => Promise<unknown>): Promise<void> {
	try {
		await f();
	} catch (err) {
		if (!(err instanceof NotFoundError)) throw err;
	}
}

live('live: read-only', () => {
	let c: QBitFlow;
	let me: Me;

	beforeAll(async () => {
		c = liveClient();
		me = await c.me();
		expect(me.space?.uuid).toBeTruthy();
	});

	it('products: list, getByReference', async () => {
		const page = await c.products.list({ includeHidden: true, limit: 2 });
		expect(page.items.length).toBeLessThanOrEqual(2);
		expect(page.hasMore).toBe(page.nextCursor !== undefined);
		const first = page.items[0];
		if (first?.reference) {
			expect((await c.products.getByReference(first.reference)).uuid).toBe(first.uuid);
		}
		await expect(c.products.getByReference('sdk-js-no-such-reference')).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('customers', async () => {
		const page = await c.customers.list({ limit: 2 });
		expect(page.items.length).toBeLessThanOrEqual(2);
		let n = 0;
		for await (const cust of c.customers.iterate({ limit: 2 })) {
			expect(cust.uuid).toBeTruthy();
			if (++n === 3) break; // the first page and one more row at most
		}
	});

	it('payments, transactions and failures', async () => {
		const payments = await c.payments.list({ limit: 5 });
		if (payments.items.length > 0) {
			const p = await c.payments.get(payments.items[0].uuid);
			expect(p.uuid).toBe(payments.items[0].uuid);
			expect(p.currency.code).toBeTruthy();
			expect(p.amountUsd).toBeTruthy();
		}
		const txs = await c.transactions.list({
			limit: 5,
			createdAfter: new Date(Date.now() - 30 * 86_400_000),
		});
		for (const tx of txs.items) expect(['payment', 'bill']).toContain(tx.type);
		await c.transactions.list({ limit: 5, type: 'bill' });
		await c.failures.list({ limit: 5 });
	});

	it('subscriptions and their bills', async () => {
		const subs = await c.subscriptions.list({ limit: 5 });
		const sub = subs.items[0];
		if (!sub) return;
		await c.subscriptions.get(sub.uuid);
		const bills = await c.subscriptions.listBills(sub.uuid, { limit: 2 });
		if (bills.items.length > 0) {
			const bill = await c.subscriptions.getBill(bills.items[0].uuid);
			expect(bill.subscriptionUuid).toBe(sub.uuid);
		}
	});

	it('refunds: list by status, get', async () => {
		const pending = await c.refunds.list({ status: ['pending'] });
		for (const r of pending.items) expect(r.status).toBe('pending');
		const answered = await c.refunds.list({ limit: 5, status: ['approved', 'rejected'] });
		if (answered.items.length > 0) {
			expect((await c.refunds.get(answered.items[0].uuid)).uuid).toBe(answered.items[0].uuid);
		}
	});

	it('members (organization key only)', async () => {
		if (!isOrganizationKey(me)) return;
		await c.members.list({ limit: 5 });
		await c.members.listHeldFunds();
		await c.invitations.list({ limit: 5 });
		// The organization's own space holds nothing for itself.
		expect((await c.members.getOwnHeldFunds()).ledgers).toEqual([]);
	});

	it('wallets', async () => {
		await c.wallets.list({ withBalances: true });
		await c.wallets.listAcceptedCurrencies();
	});

	it('currencies', async () => {
		const test = me.space?.test ?? false;
		const currencies = await c.currencies.list({ test });
		const natives = await c.currencies.list({ test, main: true });
		for (const n of natives) {
			expect(n.address).toBeUndefined();
			expect(n.mainCurrencyId).toBeUndefined();
		}
		if (currencies.length > 0) {
			expect((await c.currencies.get(currencies[0].id)).id).toBe(currencies[0].id);
		}
	});

	it('accounting', async () => {
		const to = new Date();
		const from = new Date(to.getTime() - 30 * 86_400_000);
		await c.accounting.exportJson(isoDate(from), isoDate(to));
		expect(await c.accounting.exportCsv(isoDate(from), isoDate(to))).not.toBe('');
	});

	it('accounting over more than 92 days (exportJsonRange / exportCsvRange)', async () => {
		const to = new Date();
		const from = new Date(to.getTime() - 200 * 86_400_000); // 3 windows
		expect(Array.isArray(await c.accounting.exportJsonRange(isoDate(from), isoDate(to)))).toBe(
			true
		);
		const csv = await c.accounting.exportCsvRange(isoDate(from), isoDate(to));
		const header = csv.split(/\r?\n/)[0];
		expect(csv.split(/\r?\n/).filter((line) => line === header)).toHaveLength(1);
	});

	it('webhooks', async () => {
		await c.webhooks.endpoints.list({ limit: 5 });
		const page = await c.webhooks.events.list({ limit: 5 });
		if (page.items.length > 0) await c.webhooks.events.get(page.items[0].id);
	});

	it('checkoutSessions.get of an unknown session is a NotFoundError', async () => {
		await expect(
			c.checkoutSessions.get('pay@019eca82-5680-7b00-8000-00000000dead')
		).rejects.toBeInstanceOf(NotFoundError);
	});
});

const liveWrites = KEY && WRITES ? describe : describe.skip;

liveWrites('live: writes', () => {
	let c: QBitFlow;
	let allowed = false;

	beforeAll(async () => {
		c = liveClient();
		const me = await c.me();
		allowed = me.space?.test === true || ALLOW_LIVE;
		if (!allowed)
			console.warn(
				'write checks skipped: a live-mode key needs QBITFLOW_ALLOW_LIVE_MODE_WRITES=1'
			);
	});

	it('product: create, get, getByReference, update, delete', async () => {
		if (!allowed) return;
		const reference = `sdk-js-test-${suffix()}`;
		const p = await c.products.create({
			name: 'SDK JS test',
			priceUsd: '1',
			reference,
			metadata: { sdk: 'js', run: suffix() },
		});
		try {
			const got = await c.products.get(p.uuid);
			expect([got.reference, got.priceUsd, got.metadata.sdk]).toEqual([reference, '1', 'js']);
			expect((await c.products.getByReference(reference)).uuid).toBe(p.uuid);
			const updated = await c.products.update(p.uuid, {
				priceUsd: '2.50',
				description: 'Updated by the JS SDK',
				metadata: { run: '', tier: 'gold' },
			});
			// The price comes back in its canonical form; the metadata is merged.
			expect(updated.priceUsd).toBe('2.5');
			expect(updated.description).toBeTruthy();
			expect(updated.metadata).toEqual({ sdk: 'js', tier: 'gold' });
			await c.products.delete(p.uuid);
			await expect(c.products.get(p.uuid)).rejects.toBeInstanceOf(NotFoundError);
		} finally {
			await cleanup(() => c.products.delete(p.uuid));
		}
	});

	it('customer: create, getByReference, list by email, clear fields, delete', async () => {
		if (!allowed) return;
		const s = suffix();
		const cust = await c.customers.create({
			firstName: 'Ada',
			lastName: 'Test',
			email: `sdk-js-test-${s}@example.com`,
			phoneNumber: '+33 6 12 34 56 78',
			reference: `sdk-js-${s}`,
			metadata: { crm: '42' },
		});
		try {
			expect([cust.firstName, cust.verified, cust.metadata.crm]).toEqual(['Ada', true, '42']);
			expect(cust.phoneNumber).toBeTruthy();
			expect((await c.customers.getByReference(`sdk-js-${s}`)).uuid).toBe(cust.uuid);
			const byEmail = await c.customers.list({ email: cust.email });
			expect(byEmail.items.map((x) => x.uuid)).toEqual([cust.uuid]);
			const updated = await c.customers.update(cust.uuid, {
				lastName: '',
				phoneNumber: '',
				metadata: { crm: '' },
			});
			expect(updated.phoneNumber).toBeUndefined();
			expect(updated.lastName).toBeUndefined();
			expect(updated.metadata).toEqual({});
			expect(updated.email).toBe(cust.email);
			await c.customers.delete(cust.uuid);
		} finally {
			await cleanup(() => c.customers.delete(cust.uuid));
		}
	});

	it('checkout session: create, status, expire', async () => {
		if (!allowed) return;
		let session;
		try {
			session = await c.checkoutSessions.createPayment({
				productName: 'SDK JS test',
				priceUsd: '1',
				reference: `sdk-js-order-${suffix()}`,
				metadata: { orderId: 'sdk-js' },
				successUrl: 'https://example.com/ok?id={{UUID}}',
				cancelUrl: 'https://example.com/cancel',
			});
		} catch (err) {
			if (err instanceof ConflictError && err.code === 'merchant_not_ready') return; // no currency accepted
			throw err;
		}
		try {
			expect(session.link).toBeTruthy();
			expect(session.expiresAt).toBeTruthy();
			const status = await c.checkoutSessions.get(session.uuid);
			expect(status.status).toBe('created');
			expect(status.expiresAt).toBeTruthy();
			// Nobody pays: the wait times out on the last status seen (not final).
			const waited = await c.checkoutSessions.waitForCompletion(session.uuid, {
				timeout: 2_500,
				interval: 1_000,
			});
			expect(waited.status).toBe('created');
			expect((await c.checkoutSessions.expire(session.uuid)).status).toBe('expired');
			// Final now: returned at once.
			expect((await c.checkoutSessions.waitForCompletion(session.uuid)).status).toBe(
				'expired'
			);
			// The payment does not exist (the session expired unpaid): its reference finds nothing.
			await expect(
				c.payments.getByReference(`sdk-js-order-none-${suffix()}`)
			).rejects.toBeInstanceOf(NotFoundError);
		} finally {
			await c.checkoutSessions.expire(session.uuid).catch((err: unknown) => {
				if (!(err instanceof ConflictError) && !(err instanceof NotFoundError)) throw err; // already final
			});
		}
	});

	it('checkout sessions with fees: create, status, expire', async () => {
		if (!allowed) return;
		let session;
		const fees: CheckoutFees = {
			items: [{ label: 'Shipping', description: 'Standard, 3 to 5 days', amountUsd: '0.75' }],
			processingFee: true,
		};
		try {
			// The documentation's fees checkout: $3.99 + $0.75 shipping + the processing fee, under
			// the test-mode cap of $5 (fees included).
			session = await c.checkoutSessions.createPayment({
				productName: 'T-shirt',
				description: 'Blue, size M',
				priceUsd: '3.99',
				reference: `order-1044-${suffix()}`,
				successUrl: 'https://shop.example.com/orders/success?uuid={{UUID}}',
				cancelUrl: 'https://shop.example.com/orders/cancel',
				fees,
			});
		} catch (err) {
			if (err instanceof ConflictError && err.code === 'merchant_not_ready') return; // no currency accepted
			throw err;
		}
		try {
			expect(session.uuid.startsWith('pay@')).toBe(true);
			expect(session.link).toBeTruthy();
			expect((await c.checkoutSessions.get(session.uuid)).status).toBe('created');
			expect((await c.checkoutSessions.expire(session.uuid)).status).toBe('expired');
		} finally {
			await c.checkoutSessions.expire(session.uuid).catch((err: unknown) => {
				if (!(err instanceof ConflictError) && !(err instanceof NotFoundError)) throw err; // already final
			});
		}

		// A subscription checkout takes the same fees, charged with every bill.
		let sub;
		try {
			sub = await c.checkoutSessions.createSubscription({
				productName: 'Pro',
				description: 'Monthly plan',
				priceUsd: '3.99',
				reference: `sub-1044-${suffix()}`,
				frequency: { value: 1, unit: 'months' },
				successUrl: 'https://shop.example.com/orders/success?uuid={{UUID}}',
				cancelUrl: 'https://shop.example.com/orders/cancel',
				fees,
			});
		} catch (err) {
			if (err instanceof PermissionDeniedError && err.code === 'policy_disabled') {
				console.warn('subscriptions are off for this member (members.subscriptions)');
				return;
			}
			throw err;
		}
		try {
			expect(sub.uuid.startsWith('sub@')).toBe(true);
			expect(sub.link).toBeTruthy();
		} finally {
			await c.checkoutSessions.expire(sub.uuid).catch((err: unknown) => {
				if (!(err instanceof ConflictError) && !(err instanceof NotFoundError)) throw err; // already final
			});
		}
	});

	it('webhook endpoint: create, get, update, delete', async () => {
		if (!allowed) return;
		const created = await c.webhooks.endpoints.create({
			url: 'https://example.com/qbitflow-sdk-test',
			events: ['payment.completed'],
			description: `JS SDK test ${suffix()}`,
		});
		try {
			expect(created.secret).toBeTruthy();
			const got = await c.webhooks.endpoints.get(created.uuid);
			expect([got.url, got.payloadVersion]).toEqual([created.url, 'v2']);
			let found = false;
			for await (const e of c.webhooks.endpoints.iterate({ limit: 1 })) {
				found = found || e.uuid === created.uuid;
			}
			expect(found).toBe(true);
			const updated = await c.webhooks.endpoints.update(created.uuid, {
				description: '',
				enabled: false,
			});
			expect(updated.description).toBeUndefined();
			expect(updated.disabledAt).toBeTruthy();
			await c.webhooks.endpoints.delete(created.uuid);
		} finally {
			await cleanup(() => c.webhooks.endpoints.delete(created.uuid));
		}
	});

	it('subscription metadata: set then delete a key on the latest subscription', async () => {
		if (!allowed) return;
		const subs = await c.subscriptions.list({ limit: 1 });
		const sub = subs.items[0];
		const key = 'sdkJsTest';
		if (!sub || key in sub.metadata) return; // nothing to update
		let updated;
		try {
			updated = await c.subscriptions.update(sub.uuid, { metadata: { [key]: suffix() } });
		} catch (err) {
			if (err instanceof PermissionDeniedError && err.code === 'policy_disabled') {
				console.warn('subscriptions are off for this member (members.subscriptions)');
				return;
			}
			throw err;
		}
		try {
			expect(updated.metadata[key]).toBeTruthy();
			expect(Object.keys(updated.metadata)).toHaveLength(
				Object.keys(sub.metadata).length + 1
			);
		} finally {
			await c.subscriptions.update(sub.uuid, { metadata: { [key]: '' } });
		}
	});
});
