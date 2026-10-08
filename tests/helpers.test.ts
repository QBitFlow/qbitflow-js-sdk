/**
 * The integration helpers H2–H8: `webhooks.sign`, `checkoutSessions.waitForCompletion`,
 * `hasAccess`, `formatAmount` / `parseAmount`, the accounting range exports, `QBitFlow.fromEnv`
 * and `Placeholders`.
 */

import { QBitFlow, TRANSPORT } from '../src/client';
import { NetworkError, NotFoundError, ValidationError } from '../src/errors';
import { formatAmount, hasAccess, parseAmount, Placeholders, webhooks } from '../src/index';
import type { Subscription } from '../src/models/subscriptions';
import {
	closeServers,
	rejection,
	reply,
	testClient,
	testServer,
	thrown,
	type TestServer,
} from './helpers/server';

afterAll(closeServers);

const fieldOf = (err: unknown): string => {
	expect(err).toBeInstanceOf(ValidationError);
	return (err as ValidationError).fieldErrors[0]?.field ?? '';
};

// ── H2 ─────────────────────────────────────────────────────────────────────

describe('webhooks.sign', () => {
	const BODY =
		'{"createdAt":"2026-10-01T12:00:00Z","data":{},"id":"evt_3f1c2d4e-5a6b-5c7d-8e9f-0a1b2c3d4e5f","test":false,"type":"webhook.test","version":"v2"}';

	it('matches the shared vector', () => {
		expect(webhooks.sign(BODY, 'whsec_new_secret', 1790856000)).toBe(
			't=1790856000,v1=4a158046f55556e922bdec376a917c3ac338ba575b495f825427541a60bd2f4d'
		);
		expect(webhooks.sign(Buffer.from(BODY), 'whsec_new_secret', 1790856000)).toBe(
			webhooks.sign(BODY, 'whsec_new_secret', 1790856000)
		);
	});

	it('round-trips through verify and constructEvent (timestamp now)', () => {
		const header = webhooks.sign(BODY, 'whsec_x');
		expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
		expect(() => webhooks.verify(BODY, header, 'whsec_x')).not.toThrow();
		expect(webhooks.constructEvent(BODY, header, 'whsec_x').type).toBe('webhook.test');
	});

	it('refuses an empty secret and a bad timestamp', () => {
		expect(fieldOf(thrown(() => webhooks.sign(BODY, '')))).toBe('secret');
		for (const t of [-1, 1.5, Number.NaN]) {
			expect(fieldOf(thrown(() => webhooks.sign(BODY, 's', t)))).toBe('timestamp');
		}
	});
});

// ── H3 ─────────────────────────────────────────────────────────────────────

describe('checkoutSessions.waitForCompletion', () => {
	const ID = 'pay@019eca82-5680-7b00-8000-000000000001';

	/** A client whose clock advances by each sleep; the server answers the given statuses. */
	async function setup(...statuses: Array<string | 404>) {
		const ts: TestServer = await testServer((_req, res, n) => {
			const s = statuses[Math.min(n, statuses.length - 1)];
			if (s === 404) reply(res, 404, '{"error":"not_found","message":"no such session"}');
			else reply(res, 200, JSON.stringify({ uuid: ID, status: s }));
		});
		const { client, transport } = testClient(ts);
		let clock = 1_000_000;
		const sleeps: number[] = [];
		transport.now = () => clock;
		transport.sleep = async (ms, signal) => {
			if (signal?.aborted) throw signal.reason;
			sleeps.push(ms);
			clock += ms;
		};
		return { client, ts, sleeps };
	}

	it('returns completed after a few polls', async () => {
		const { client, ts, sleeps } = await setup('created', 'waitingConfirmation', 'completed');
		const status = await client.checkoutSessions.waitForCompletion(ID);
		expect(status.status).toBe('completed');
		expect(ts.recorded.map((r) => r.path)).toEqual(
			Array(3).fill(`/transaction/session-checkout/${ID}/status`)
		);
		expect(sleeps).toEqual([3000, 3000]);
	});

	it('returns expired at once', async () => {
		const { client, sleeps } = await setup('expired');
		expect((await client.checkoutSessions.waitForCompletion(ID)).status).toBe('expired');
		expect(sleeps).toEqual([]);
	});

	it('returns the last status seen when the timeout elapses', async () => {
		const { client, ts, sleeps } = await setup('created', 'created', 'waitingConfirmation');
		const status = await client.checkoutSessions.waitForCompletion(ID, {
			timeout: 10_000,
			interval: 3_000,
		});
		expect(status.status).toBe('waitingConfirmation');
		expect(sleeps).toEqual([3000, 3000, 3000, 1000]); // polls at 0, 3, 6, 9 and 10 s
		expect(ts.recorded).toHaveLength(5);
	});

	it.each([0, -5])('timeout %d means the default (10 minutes)', async (timeout) => {
		const { client, sleeps } = await setup('created');
		const status = await client.checkoutSessions.waitForCompletion(ID, { timeout });
		expect(status.status).toBe('created');
		expect(sleeps.reduce((a, b) => a + b, 0)).toBe(600_000);
		expect(sleeps).toHaveLength(200);
	});

	it('passes the request options to each poll', async () => {
		const member = '019eca82-5680-7b00-8000-0000000000b1';
		const { client, ts } = await setup('completed');
		await client.checkoutSessions.waitForCompletion(ID, {
			onBehalfOf: member,
			requestId: 'r-1',
		});
		expect(ts.recorded[0].headers['on-behalf-of']).toBe(member);
		expect(ts.recorded[0].headers['x-request-id']).toBe('r-1');
	});

	it.each([10, 0, -1])('floors the interval at 1 s (%d)', async (interval) => {
		const { client, sleeps } = await setup('created', 'created', 'completed');
		await client.checkoutSessions.waitForCompletion(ID, { interval });
		expect(sleeps).toEqual([1000, 1000]);
	});

	it("propagates getStatus's errors (a 404)", async () => {
		const { client } = await setup('created', 404);
		expect(await rejection(client.checkoutSessions.waitForCompletion(ID))).toBeInstanceOf(
			NotFoundError
		);
	});

	it('stops on the signal', async () => {
		const { client, ts } = await setup('created');
		const controller = new AbortController();
		const wait = client.checkoutSessions.waitForCompletion(ID, { signal: controller.signal });
		controller.abort(new Error('stop'));
		const err = await rejection(wait);
		expect(err).toBeInstanceOf(NetworkError);
		expect(ts.recorded.length).toBeLessThanOrEqual(1);
	});

	it('checks its arguments before sending', async () => {
		const { client, ts } = await setup('created');
		const w = client.checkoutSessions;
		expect(fieldOf(await rejection(w.waitForCompletion('')))).toBe('uuid');
		expect(
			fieldOf(await rejection(w.waitForCompletion(ID, { timeout: '5' as unknown as number })))
		).toBe('timeout');
		expect(fieldOf(await rejection(w.waitForCompletion(ID, { interval: Number.NaN })))).toBe(
			'interval'
		);
		expect(ts.recorded).toHaveLength(0);
	});

	it('uses the real sleep by default (short timeout)', async () => {
		const ts = await testServer((_req, res) =>
			reply(res, 200, JSON.stringify({ uuid: ID, status: 'created' }))
		);
		const client = new QBitFlow('sk_test_key_123', { baseUrl: ts.url });
		expect(client[TRANSPORT].sleep).toBeDefined();
		const started = Date.now();
		const status = await client.checkoutSessions.waitForCompletion(ID, { timeout: 50 });
		expect(status.status).toBe('created');
		expect(Date.now() - started).toBeLessThan(2000);
	});
});

// ── H4 ─────────────────────────────────────────────────────────────────────

describe('hasAccess', () => {
	const END = '2026-11-01T00:00:00Z';
	const sub = (currentPeriodEnd?: string, status = 'active'): Subscription =>
		({ uuid: 'sub@x', status, currentPeriodEnd }) as unknown as Subscription;

	it('is true strictly before currentPeriodEnd, whatever the status', () => {
		expect(hasAccess(sub(END), new Date('2026-10-31T23:59:59.999Z'))).toBe(true);
		expect(hasAccess(sub(END, 'cancelled'), new Date('2026-10-01T00:00:00Z'))).toBe(true);
		expect(hasAccess(sub(END), new Date(END))).toBe(false); // equal: no access
		expect(hasAccess(sub(END), new Date('2026-11-01T00:00:00.001Z'))).toBe(false);
	});

	it('is false without an end, and with an unparsable one', () => {
		expect(hasAccess(sub(undefined))).toBe(false);
		expect(hasAccess(sub(''))).toBe(false);
		expect(hasAccess(sub('soon'))).toBe(false);
		expect(hasAccess({ currentPeriodEnd: null as unknown as string })).toBe(false);
	});

	it('reads offsets and microseconds, and defaults to now', () => {
		expect(
			hasAccess(sub('2026-11-01T02:00:00.123456+02:00'), new Date('2026-11-01T00:00:00.122Z'))
		).toBe(true);
		const future = new Date(Date.now() + 60_000).toISOString();
		const past = new Date(Date.now() - 60_000).toISOString();
		expect(hasAccess(sub(future))).toBe(true);
		expect(hasAccess(sub(past))).toBe(false);
	});
});

// ── H5 ─────────────────────────────────────────────────────────────────────

describe('formatAmount / parseAmount', () => {
	it.each<[string, number, string]>([
		['1500000', 6, '1.5'],
		['1000000', 6, '1'],
		['1', 6, '0.000001'],
		['0', 6, '0'],
		['-10004200', 6, '-10.0042'],
		['123', 0, '123'],
		['000120', 2, '1.2'],
		['-0', 6, '0'],
		['-000', 0, '0'],
		[
			'115792089237316195423570985008687907853269984665640564039457584007913129639935',
			18,
			'115792089237316195423570985008687907853269984665640564039457.584007913129639935',
		],
		['5', 77, `0.${'0'.repeat(76)}5`],
	])('formatAmount(%p, %d) = %p', (minUnits, decimals, want) => {
		expect(formatAmount(minUnits, decimals)).toBe(want);
	});

	it.each<[unknown, unknown, string]>([
		['1.5', 6, 'minUnits'],
		['', 6, 'minUnits'],
		['+1', 6, 'minUnits'],
		['1e6', 6, 'minUnits'],
		['1_000', 6, 'minUnits'],
		[' 1', 6, 'minUnits'],
		['-', 6, 'minUnits'],
		[1500000, 6, 'minUnits'],
		['1', -1, 'decimals'],
		['1', 78, 'decimals'],
		['1', 1.5, 'decimals'],
	])('formatAmount(%p, %p) is a ValidationError on %s', (minUnits, decimals, field) => {
		expect(fieldOf(thrown(() => formatAmount(minUnits as string, decimals as number)))).toBe(
			field
		);
	});

	it.each<[string, number, string]>([
		['1.5', 6, '1500000'],
		['0.000001', 6, '1'],
		['10', 2, '1000'],
		['-0.5', 2, '-50'],
		['-0', 2, '0'],
		['-0.00', 2, '0'],
		['007.10', 2, '710'],
		['0', 0, '0'],
		['1.000000', 6, '1000000'],
	])('parseAmount(%p, %d) = %p', (amount, decimals, want) => {
		expect(parseAmount(amount, decimals)).toBe(want);
	});

	it.each<[unknown, unknown, string]>([
		['1.0000001', 6, 'amount'],
		['1.50', 1, 'amount'], // trailing zeros count as fractional digits
		['1.5', 0, 'amount'],
		['1e6', 6, 'amount'],
		['1,000.5', 6, 'amount'],
		['.5', 6, 'amount'],
		['1.', 6, 'amount'],
		['+1', 6, 'amount'],
		['', 6, 'amount'],
		[1.5, 6, 'amount'],
		['1', 78, 'decimals'],
		['1', -1, 'decimals'],
	])('parseAmount(%p, %p) is a ValidationError on %s', (amount, decimals, field) => {
		expect(fieldOf(thrown(() => parseAmount(amount as string, decimals as number)))).toBe(
			field
		);
	});

	it('round-trips', () => {
		for (const [v, d] of [
			['1.5', 6],
			['-10.0042', 6],
			['0.000001', 6],
			['123', 0],
		] as const) {
			expect(formatAmount(parseAmount(v, d), d)).toBe(v);
		}
	});
});

// ── H6 ─────────────────────────────────────────────────────────────────────

describe('accounting.exportJsonRange / exportCsvRange', () => {
	const windowsOf = (ts: TestServer): string[] =>
		ts.recorded.map((r) => {
			const q = new URLSearchParams(r.query);
			return `${q.get('from')}..${q.get('to')}`;
		});

	it('splits a year into 4 windows of at most 95 days and concatenates the JSON', async () => {
		const ts = await testServer((req, res) => {
			const q = new URLSearchParams(req.query);
			reply(res, 200, JSON.stringify([{ type: 'payment', paymentUuid: q.get('from') }]));
		});
		const { client } = testClient(ts);
		const rows = await client.accounting.exportJsonRange('2026-01-01', '2026-12-31');
		expect(windowsOf(ts)).toEqual([
			'2026-01-01..2026-04-06',
			'2026-04-07..2026-07-11',
			'2026-07-12..2026-10-15',
			'2026-10-16..2026-12-31',
		]);
		expect(rows.map((r) => r.paymentUuid)).toEqual([
			'2026-01-01',
			'2026-04-07',
			'2026-07-12',
			'2026-10-16',
		]);
		expect(
			ts.recorded.every((r) => new URLSearchParams(r.query).get('format') === 'json')
		).toBe(true);
	});

	it.each<[string, string, string[]]>([
		['one day', '2026-03-01', ['2026-03-01..2026-03-01']],
		['95 days: one request', '2026-04-06', ['2026-01-01..2026-04-06']],
		[
			'96 days: two requests',
			'2026-04-07',
			['2026-01-01..2026-04-06', '2026-04-07..2026-04-07'],
		],
	])('%s', async (_name, to, want) => {
		const ts = await testServer((_req, res) => reply(res, 200, '[]'));
		const { client } = testClient(ts);
		const from = want[0].slice(0, 10);
		expect(await client.accounting.exportJsonRange(from, to)).toEqual([]);
		expect(windowsOf(ts)).toEqual(want);
	});

	it('crosses leap days on calendar dates', async () => {
		const ts = await testServer((_req, res) => reply(res, 200, '[]'));
		const { client } = testClient(ts);
		await client.accounting.exportJsonRange('2028-01-01', '2028-06-30');
		expect(windowsOf(ts)).toEqual(['2028-01-01..2028-04-05', '2028-04-06..2028-06-30']);
	});

	it('CSV: the header once, every window rows, line endings kept, header-only windows add nothing', async () => {
		const answers = [
			'type,amount\r\npayment,1\r\npayment,2\r\n',
			'type,amount\r\n',
			'type,amount\r\nrefund,3\r\n',
			'type,amount\r\nfee,4', // no final line ending
		];
		const ts = await testServer((_req, res, n) => {
			res.writeHead(200, { 'Content-Type': 'text/csv' });
			res.end(answers[n]);
		});
		const { client } = testClient(ts);
		const csv = await client.accounting.exportCsvRange('2026-01-01', '2026-12-31');
		expect(csv).toBe('type,amount\r\npayment,1\r\npayment,2\r\nrefund,3\r\nfee,4');
		expect(ts.recorded.every((r) => new URLSearchParams(r.query).get('format') === 'csv')).toBe(
			true
		);
	});

	it('CSV: a missing final line ending is added in the header style', async () => {
		const answers = ['h\r\nr1', 'h\r\nr2\r\n'];
		const ts = await testServer((_req, res, n) => {
			res.writeHead(200, { 'Content-Type': 'text/csv' });
			res.end(answers[n]);
		});
		const { client } = testClient(ts);
		expect(await client.accounting.exportCsvRange('2026-01-01', '2026-04-07')).toBe(
			'h\r\nr1\r\nr2\r\n'
		);
	});

	it('CSV: a first window without a final line ending is joined with one', async () => {
		const answers = ['h\nr1', 'h\nr2\n'];
		const ts = await testServer((_req, res, n) => {
			res.writeHead(200, { 'Content-Type': 'text/csv' });
			res.end(answers[n]);
		});
		const { client } = testClient(ts);
		expect(await client.accounting.exportCsvRange('2026-01-01', '2026-04-07')).toBe(
			'h\nr1\nr2\n'
		);
	});

	it('checks the dates before sending', async () => {
		const ts = await testServer((_req, res) => reply(res, 200, '[]'));
		const { client } = testClient(ts);
		expect(
			fieldOf(await rejection(client.accounting.exportJsonRange('2026-02-30', '2026-03-01')))
		).toBe('from');
		expect(
			fieldOf(await rejection(client.accounting.exportCsvRange('2026-03-02', '2026-03-01')))
		).toBe('to');
		expect(ts.recorded).toHaveLength(0);
	});

	it('stops at the first failing window', async () => {
		const ts = await testServer((_req, res, n) =>
			n === 0 ? reply(res, 200, '[]') : reply(res, 404, '{"error":"not_found","message":"x"}')
		);
		const { client } = testClient(ts);
		expect(
			await rejection(client.accounting.exportJsonRange('2026-01-01', '2026-12-31'))
		).toBeInstanceOf(NotFoundError);
		expect(ts.recorded).toHaveLength(2);
	});
});

// ── H7 ─────────────────────────────────────────────────────────────────────

describe('QBitFlow.fromEnv', () => {
	const NAMES = ['QBITFLOW_API_KEY', 'QBITFLOW_BASE_URL', 'QBITFLOW_ON_BEHALF_OF'];
	let saved: Record<string, string | undefined>;
	beforeEach(() => {
		saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
		for (const n of NAMES) delete process.env[n];
	});
	afterEach(() => {
		for (const n of NAMES) {
			if (saved[n] === undefined) delete process.env[n];
			else process.env[n] = saved[n];
		}
	});

	const MEMBER = '019eca82-5680-7b00-8000-0000000000b1';

	it('reads the key, the base URL and On-Behalf-Of', async () => {
		const ts = await testServer((_req, res) => reply(res, 200, '{}'));
		process.env.QBITFLOW_API_KEY = 'sk_env_key';
		process.env.QBITFLOW_BASE_URL = ts.url;
		process.env.QBITFLOW_ON_BEHALF_OF = MEMBER;
		const client = QBitFlow.fromEnv();
		expect(client[TRANSPORT].baseUrl).toBe(ts.url);
		await client.me();
		expect(ts.recorded[0].headers['x-api-key']).toBe('sk_env_key');
		expect(ts.recorded[0].headers['on-behalf-of']).toBe(MEMBER);
	});

	it('defaults the base URL, and treats empty variables as unset', async () => {
		process.env.QBITFLOW_API_KEY = 'sk_env_key';
		process.env.QBITFLOW_BASE_URL = '';
		process.env.QBITFLOW_ON_BEHALF_OF = '';
		expect(QBitFlow.fromEnv()[TRANSPORT].baseUrl).toBe('https://api.qbitflow.app/v2');
	});

	it('lets explicit options override the environment', async () => {
		const ts = await testServer((_req, res) => reply(res, 200, '{}'));
		process.env.QBITFLOW_API_KEY = 'sk_env_key';
		process.env.QBITFLOW_BASE_URL = 'https://env.example.com/v2';
		process.env.QBITFLOW_ON_BEHALF_OF = MEMBER;
		const client = QBitFlow.fromEnv({
			apiKey: 'sk_explicit',
			baseUrl: ts.url,
			onBehalfOf: '',
			maxRetries: 0,
		});
		expect(client[TRANSPORT].baseUrl).toBe(ts.url);
		expect(client[TRANSPORT].maxRetries).toBe(0);
		await client.me();
		expect(ts.recorded[0].headers['x-api-key']).toBe('sk_explicit');
		expect(ts.recorded[0].headers['on-behalf-of']).toBeUndefined();
	});

	it('names QBITFLOW_API_KEY when the key is missing', () => {
		expect(fieldOf(thrown(() => QBitFlow.fromEnv()))).toBe('QBITFLOW_API_KEY');
		process.env.QBITFLOW_API_KEY = '   ';
		expect(fieldOf(thrown(() => QBitFlow.fromEnv()))).toBe('QBITFLOW_API_KEY');
	});

	it('checks the values like the constructor', () => {
		process.env.QBITFLOW_API_KEY = 'pk_nope';
		expect(fieldOf(thrown(() => QBitFlow.fromEnv()))).toBe('apiKey');
		process.env.QBITFLOW_API_KEY = 'sk_ok';
		process.env.QBITFLOW_BASE_URL = 'ftp://x';
		expect(fieldOf(thrown(() => QBitFlow.fromEnv()))).toBe('baseUrl');
		process.env.QBITFLOW_BASE_URL = '';
		process.env.QBITFLOW_ON_BEHALF_OF = 'not-a-uuid';
		expect(thrown(() => QBitFlow.fromEnv())).toBeInstanceOf(ValidationError);
	});
});

// ── H8 ─────────────────────────────────────────────────────────────────────

describe('Placeholders', () => {
	it('are the literal tokens the server substitutes', () => {
		expect(Placeholders.UUID).toBe('{{UUID}}');
		expect(Placeholders.TRANSACTION_TYPE).toBe('{{TRANSACTION_TYPE}}');
		expect(`https://x.io/ok?id=${Placeholders.UUID}`).toBe('https://x.io/ok?id={{UUID}}');
	});
});
