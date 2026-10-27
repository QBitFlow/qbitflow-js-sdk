import { DEFAULT_BASE_URL, QBitFlow, TRANSPORT } from '../src/client';
import { ValidationError } from '../src/errors';
import {
	closeServers,
	rejection,
	staticReply,
	TEST_API_KEY,
	testClient,
	testServer,
	thrown,
	UUID_V4,
} from './helpers/server';

const MEMBER = '019eca82-5680-7b00-8000-0000000000b1';
const OTHER = '01a05cd7-2a00-7d00-8000-0000000000d1';

afterEach(closeServers);

describe('constructor', () => {
	it.each(['', '   ', 'pk_live_123', 'SK_live', 'key'])('refuses the API key %j', (key) => {
		const err = thrown(() => new QBitFlow(key)) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.status).toBeUndefined();
		expect(err.fieldErrors.map((f) => f.field)).toEqual(['apiKey']);
	});

	it.each([
		'sk_',
		`sk_test_${MEMBER}_x`,
		'sk_123_live_abc',
		`sk_${MEMBER}_test_x`,
		'  sk_padded  ',
	])('accepts %j', (key) => {
		expect(() => new QBitFlow(key)).not.toThrow();
	});

	it('refuses a missing config', () => {
		expect(thrown(() => new QBitFlow(undefined as unknown as string))).toBeInstanceOf(
			ValidationError
		);
		expect(thrown(() => new QBitFlow({} as never))).toBeInstanceOf(ValidationError);
	});

	it('has the defaults', () => {
		const c = new QBitFlow('sk_x');
		const t = c[TRANSPORT];
		expect(DEFAULT_BASE_URL).toBe('https://api.qbitflow.app/v2');
		expect(t.baseUrl).toBe(DEFAULT_BASE_URL);
		expect(t.timeout).toBe(30_000);
		expect(t.maxRetries).toBe(3);
		for (const svc of [
			c.products,
			c.customers,
			c.checkoutSessions,
			c.payments,
			c.transactions,
			c.failures,
			c.subscriptions,
			c.refunds,
			c.members,
			c.invitations,
			c.wallets,
			c.accounting,
			c.webhooks,
			c.webhooks.endpoints,
			c.webhooks.events,
			c.currencies,
		]) {
			expect(svc).toBeDefined();
		}
	});

	it.each([
		['baseUrl ftp', { baseUrl: 'ftp://api.example.com' }, 'baseUrl'],
		['baseUrl relative', { baseUrl: '/v2' }, 'baseUrl'],
		['baseUrl empty', { baseUrl: '' }, 'baseUrl'],
		['timeout zero', { timeout: 0 }, 'timeout'],
		['timeout negative', { timeout: -1000 }, 'timeout'],
		['timeout NaN', { timeout: Number.NaN }, 'timeout'],
		['maxRetries negative', { maxRetries: -1 }, 'maxRetries'],
		['maxRetries fractional', { maxRetries: 1.5 }, 'maxRetries'],
		['onBehalfOf garbage', { onBehalfOf: '42' }, 'onBehalfOf'],
		['onBehalfOf nil', { onBehalfOf: '00000000-0000-0000-0000-000000000000' }, 'onBehalfOf'],
		['onBehalfOf spaces', { onBehalfOf: ` ${MEMBER}` }, 'onBehalfOf'],
		['fetch not a function', { fetch: 42 as never }, 'fetch'],
	])('refuses %s', (_name, options, field) => {
		const err = thrown(() => new QBitFlow('sk_x', options)) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe(field);
	});

	it.each([
		['a line break', 'sk_SECRET\r\nX-Evil: 1'],
		['a space', 'sk_SECRET part'],
		['a NUL', 'sk_SECRET\u0000x'],
		['a non-ASCII character', 'sk_SECRÉT'],
	])('refuses an API key with %s, without echoing it', (_name, key) => {
		// fetch would refuse the header and quote the key in its error message.
		const err = thrown(() => new QBitFlow(key)) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors.map((f) => f.field)).toEqual(['apiKey']);
		expect(err.message).not.toContain('SECRET');
	});

	it.each([
		['credentials', 'https://user:pa55word@api.example.com/v2'],
		['a user name', 'https://user@api.example.com/v2'],
		['a query', 'https://api.example.com/v2?x=1'],
		['a fragment', 'https://api.example.com/v2#x'],
	])('refuses a baseUrl with %s, without echoing it', (_name, baseUrl) => {
		// fetch refuses a URL with credentials (quoting it); a query or fragment would swallow
		// every request's path.
		const err = thrown(() => new QBitFlow('sk_x', { baseUrl })) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors.map((f) => f.field)).toEqual(['baseUrl']);
		expect(err.message).not.toContain('pa55word');
	});

	it('never reveals the API key through inspect, JSON or toString', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { inspect } = require('node:util') as typeof import('node:util');
		const key = 'sk_SECRET_KEY_123';
		const client = new QBitFlow(key, { onBehalfOf: MEMBER });
		const scoped = client.onBehalfOf(OTHER);
		const views = [
			client,
			scoped,
			client.products,
			client.webhooks.endpoints,
			client[TRANSPORT],
		];
		for (const v of views) {
			expect(inspect(v, { depth: Infinity, showHidden: true })).not.toContain('SECRET');
			expect(JSON.stringify(v) ?? '').not.toContain('SECRET');
			expect(String(v)).not.toContain('SECRET');
		}
	});

	it('applies the options, in both constructor forms', () => {
		const fetch = jest.fn();
		for (const c of [
			new QBitFlow('sk_x', {
				baseUrl: 'https://sandbox.example.com/v2///',
				timeout: 2000,
				maxRetries: 0,
				fetch,
			}),
			new QBitFlow({
				apiKey: 'sk_x',
				baseUrl: 'https://sandbox.example.com/v2/',
				timeout: 2000,
				maxRetries: 0,
				fetch,
			}),
		]) {
			const t = c[TRANSPORT];
			expect(t.baseUrl).toBe('https://sandbox.example.com/v2');
			expect(t.timeout).toBe(2000);
			expect(t.maxRetries).toBe(0);
			expect(t.fetch).toBe(fetch);
		}
	});
});

describe('headers', () => {
	it('sends the key, the user agent and the request options', async () => {
		const ts = await testServer(staticReply(200, '{"credential":"apiKey"}'));
		const { client } = testClient(ts);
		await client.me();
		await client.products.create({ name: 'Pro', priceUsd: '1' }, { requestId: 'req-1.a:b_c' });

		const [get, post] = ts.recorded;
		for (const r of ts.recorded) {
			expect(r.headers['x-api-key']).toBe(TEST_API_KEY);
			expect(r.headers['user-agent']).toBe('qbitflow-js/3.0.0');
			expect(r.headers.accept).toBe('application/json');
			expect(r.headers['on-behalf-of']).toBeUndefined();
		}
		expect([get.method, get.path]).toEqual(['GET', '/me']);
		expect([post.method, post.path]).toEqual(['POST', '/products']);
		for (const h of ['content-type', 'idempotency-key', 'x-request-id'])
			expect(get.headers[h]).toBeUndefined();
		expect(post.headers['content-type']).toBe('application/json');
		expect(post.body).toBe('{"name":"Pro","priceUsd":"1"}');
		expect(post.headers['x-request-id']).toBe('req-1.a:b_c');
		expect(post.headers['idempotency-key']).toMatch(UUID_V4);
	});

	it.each(['has space', 'slash/no', 'é', 'r'.repeat(129)])(
		'refuses the request id %j',
		async (id) => {
			const ts = await testServer(staticReply(200, '{}'));
			const { client } = testClient(ts);
			const err = (await rejection(client.me({ requestId: id }))) as ValidationError;
			expect(err).toBeInstanceOf(ValidationError);
			expect(err.fieldErrors[0].field).toBe('X-Request-Id');
			expect(ts.recorded).toHaveLength(0);
		}
	);
});

describe('onBehalfOf', () => {
	it('scopes a client, and the request option wins', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		const { client } = testClient(ts);
		const member = client.onBehalfOf(MEMBER);
		const orgOnly = member.onBehalfOf('');
		expect(member[TRANSPORT]).toBe(client[TRANSPORT]);

		const calls: Array<[QBitFlow, { onBehalfOf?: string } | undefined, string | undefined]> = [
			[client, undefined, undefined],
			[member, undefined, MEMBER],
			[member, { onBehalfOf: OTHER }, OTHER],
			[member, { onBehalfOf: '' }, undefined],
			[client, { onBehalfOf: OTHER }, OTHER],
			[orgOnly, undefined, undefined],
		];
		for (const [c, o] of calls) await c.me(o);
		calls.forEach(([, , want], i) => expect(ts.recorded[i].headers['on-behalf-of']).toBe(want));
		// The organization level omits the header: it is never sent empty or blank (a 403).
		for (const r of ts.recorded) expect(r.headers['on-behalf-of']).not.toBe('');

		const configured = new QBitFlow(TEST_API_KEY, { baseUrl: ts.url, onBehalfOf: MEMBER });
		await configured.me();
		expect(ts.recorded[calls.length].headers['on-behalf-of']).toBe(MEMBER);
	});

	it('is validated eagerly on the client, and per call', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		const { client } = testClient(ts);
		for (const bad of [
			'not-a-uuid',
			'00000000-0000-0000-0000-000000000000',
			42 as unknown as string,
		]) {
			const err = thrown(() => client.onBehalfOf(bad)) as ValidationError;
			expect(err).toBeInstanceOf(ValidationError);
			expect(err.fieldErrors[0].field).toBe('onBehalfOf');
		}
		expect(await rejection(client.me({ onBehalfOf: '123' }))).toBeInstanceOf(ValidationError);
		// A whitespace-only value is invalid, not the organization level: only '' is.
		for (const blank of [' ', '\t', `${MEMBER} `]) {
			expect(thrown(() => client.onBehalfOf(blank))).toBeInstanceOf(ValidationError);
			expect(await rejection(client.me({ onBehalfOf: blank }))).toBeInstanceOf(
				ValidationError
			);
		}
		expect(ts.recorded).toHaveLength(0);
		await client.me();
		// Uppercase UUIDs are UUIDs, and are sent as given.
		await client.onBehalfOf('019ECA82-5680-7B00-8000-0000000000B1').me();
		expect(ts.recorded[1].headers['on-behalf-of']).toBe('019ECA82-5680-7B00-8000-0000000000B1');
	});
});

describe('me', () => {
	it('decodes the key', async () => {
		const ts = await testServer(
			staticReply(
				200,
				JSON.stringify({
					credential: 'apiKey',
					apiKeyUuid: '019cadfd-8900-7b00-8000-0000000000f1',
					role: 'user',
					onBehalfOfUserUuid: MEMBER,
					space: {
						uuid: '019eca82-5680-7c00-8000-0000000000b2',
						organizationUuid: '019cadfd-8900-7a00-8000-0000000000a1',
						organizationName: 'Example Shop',
						userUuid: MEMBER,
						member: {
							userUuid: MEMBER,
							firstName: 'Ada',
							lastName: 'Lovelace',
							email: 'ada@example.com',
						},
						test: true,
						role: 'admin',
						organizationFeePercent: '7.5',
						trustedAt: '2026-10-02T12:00:00Z',
						createdAt: '2026-10-01T12:00:00Z',
					},
					user: { ignored: true },
					spaces: [],
				})
			)
		);
		const { client } = testClient(ts);
		const me = await client.me();
		expect(me.role).toBe('user');
		expect(me.onBehalfOfUserUuid).toBe(MEMBER);
		expect(me.space?.test).toBe(true);
		expect(me.space?.organizationName).toBe('Example Shop');
		expect(me.space?.member?.firstName).toBe('Ada');
		expect(me.space?.role).toBe('admin');
		expect(me.space?.organizationFeePercent).toBe('7.5');
		expect(me.space?.trustedAt).toBe('2026-10-02T12:00:00Z');
		expect(me.space?.createdAt).toBe('2026-10-01T12:00:00Z');
	});
});
