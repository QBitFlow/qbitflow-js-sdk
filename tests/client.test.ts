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

	it.each(['sk_', 'sk_123_live_abc', `sk_${MEMBER}_test_x`, '  sk_padded  '])(
		'accepts %j',
		(key) => {
			expect(() => new QBitFlow(key)).not.toThrow();
		}
	);

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
		await client.products.create({ name: 'Pro', price: 1 }, { requestId: 'req-1.a:b_c' });

		const [get, post] = ts.recorded;
		for (const r of ts.recorded) {
			expect(r.headers['x-api-key']).toBe(TEST_API_KEY);
			expect(r.headers['user-agent']).toBe('qbitflow-js/3.0.0');
			expect(r.headers.accept).toBe('application/json');
			expect(r.headers['on-behalf-of']).toBeUndefined();
		}
		expect([get.method, get.path]).toEqual(['GET', '/me']);
		for (const h of ['content-type', 'idempotency-key', 'x-request-id'])
			expect(get.headers[h]).toBeUndefined();
		expect(post.headers['content-type']).toBe('application/json');
		expect(post.body).toBe('{"name":"Pro","price":1}');
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
					onBehalfOf: MEMBER,
					space: {
						uuid: '019eca82-5680-7c00-8000-0000000000b2',
						organizationUuid: '019cadfd-8900-7a00-8000-0000000000a1',
						organizationName: 'Example Shop',
						userUuid: MEMBER,
						member: {
							userUuid: MEMBER,
							name: 'Ada',
							lastName: 'Lovelace',
							email: 'ada@example.com',
						},
						test: true,
					},
					user: { ignored: true },
				})
			)
		);
		const { client } = testClient(ts);
		const me = await client.me();
		expect(me.credential).toBe('apiKey');
		expect(me.role).toBe('user');
		expect(me.onBehalfOf).toBe(MEMBER);
		expect(me.userUuid).toBeUndefined();
		expect(me.space?.test).toBe(true);
		expect(me.space?.organizationName).toBe('Example Shop');
		expect(me.space?.member?.name).toBe('Ada');
	});
});
