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
 * customer, a checkout session and a webhook endpoint, and deletes (or expires) each of them.
 *
 *     set -a; source ../.local.env; set +a   # never print it
 *     npm run test:live
 */

import { QBitFlow } from '../src/client';
import { ConflictError, NotFoundError } from '../src/errors';
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

const isOrganizationKey = (me: Me): boolean => me.role === 'admin' && !me.onBehalfOf;
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

	it('products.list', async () => {
		await c.products.list({ includeHidden: true });
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

	it('payments and failures', async () => {
		await c.payments.list({ limit: 5 });
		await c.payments.listCombined({
			limit: 5,
			createdAfter: new Date(Date.now() - 30 * 86_400_000),
		});
		await c.failures.list({ limit: 5 });
	});

	it('subscriptions.list', async () => {
		await c.subscriptions.list({ limit: 5 });
	});

	it('refunds', async () => {
		await c.refunds.list();
		await c.refunds.listInactive({ limit: 5 });
	});

	it('members (organization key only)', async () => {
		if (!isOrganizationKey(me)) return;
		await c.members.list({ limit: 5 });
		await c.members.listHeldFunds();
		await c.invitations.list({ limit: 5 });
	});

	it('wallets', async () => {
		await c.wallets.list({ withBalances: true });
		await c.wallets.listSupportedCurrencies();
	});

	it('currencies', async () => {
		const currencies = await c.currencies.listAvailable({ test: me.space?.test ?? false });
		await c.currencies.listMain();
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

	it('webhooks', async () => {
		await c.webhooks.endpoints.list();
		const page = await c.webhooks.events.list({ limit: 5 });
		if (page.items.length > 0) await c.webhooks.events.get(page.items[0].id);
	});

	it('checkoutSessions.getStatus of an unknown session is a NotFoundError', async () => {
		await expect(
			c.checkoutSessions.getStatus('pay@019eca82-5680-7b00-8000-00000000dead')
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
		const p = await c.products.create({ name: 'SDK JS test', price: 1, reference });
		try {
			expect((await c.products.get(p.uuid)).reference).toBe(reference);
			expect((await c.products.getByReference(reference)).uuid).toBe(p.uuid);
			const updated = await c.products.update(p.uuid, {
				price: 2,
				description: 'Updated by the JS SDK',
			});
			expect(updated.price).toBe(2);
			expect(updated.description).not.toBe('');
			await c.products.delete(p.uuid);
			await expect(c.products.get(p.uuid)).rejects.toBeInstanceOf(NotFoundError);
		} finally {
			await cleanup(() => c.products.delete(p.uuid));
		}
	});

	it('customer: create, clear the phone, delete', async () => {
		if (!allowed) return;
		const s = suffix();
		const cust = await c.customers.create({
			name: 'Ada',
			lastName: 'Test',
			email: `sdk-js-test-${s}@example.com`,
			phoneNumber: '+33 6 12 34 56 78',
			reference: `sdk-js-${s}`,
		});
		try {
			expect(cust.phoneNumber).toBeTruthy();
			const updated = await c.customers.update(cust.uuid, { phoneNumber: '' });
			expect(updated.phoneNumber ?? '').toBe('');
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
				price: 1,
				reference: `sdk-js-order-${suffix()}`,
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
			expect((await c.checkoutSessions.getStatus(session.uuid)).status).toBe('created');
			expect((await c.checkoutSessions.expire(session.uuid)).status).toBe('expired');
		} finally {
			await c.checkoutSessions.expire(session.uuid).catch((err: unknown) => {
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
			expect((await c.webhooks.endpoints.get(created.uuid)).url).toBe(created.url);
			const updated = await c.webhooks.endpoints.update(created.uuid, {
				description: '',
				enabled: false,
			});
			expect(updated.description).toBe('');
			expect(updated.disabledAt).toBeTruthy();
			await c.webhooks.endpoints.delete(created.uuid);
		} finally {
			await cleanup(() => c.webhooks.endpoints.delete(created.uuid));
		}
	});
});
