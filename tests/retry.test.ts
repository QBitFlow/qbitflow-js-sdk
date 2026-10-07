import { QBitFlow, TRANSPORT } from '../src/client';
import {
	AuthenticationError,
	BadRequestError,
	ConflictError,
	IdempotencyError,
	isRetryable,
	NetworkError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
	ServerError,
	ValidationError,
} from '../src/errors';
import { type Endpoint, errorFromResponse, newUUIDv4 } from '../src/transport';
import {
	closeServers,
	hangUp,
	rejection,
	reply,
	sequence,
	TEST_API_KEY,
	testClient,
	testServer,
	UUID_V4,
} from './helpers/server';

afterEach(closeServers);

type Reply = [number, string];
const ok200: Reply = [200, '{"ok":true}'];
const err500: Reply = [500, '{"error":"boom","code":"internal"}'];
const err503: Reply = [503, '{"error":"no network","code":"network_unavailable"}'];
const err504: Reply = [504, '{"error":"too slow","code":"timeout"}'];
const keyInUse409: Reply = [409, '{"error":"in use","code":"idempotency_key_in_use"}'];

const get = (path: string): Endpoint => ({ method: 'GET', path });
const create: Endpoint = {
	method: 'POST',
	path: '/product',
	body: { name: 'Pro' },
	idempotent: true,
};

type ErrorClass = abstract new (...args: never[]) => Error;

describe('retry matrix', () => {
	const cases: Array<[string, Endpoint, Reply[], number, number[], ErrorClass | null, number?]> =
		[
			['GET 500 exhausts retries', get('/x'), [err500], 4, [1000, 2000, 4000], ServerError],
			['GET 503 then 200', get('/x'), [err503, ok200], 2, [1000], null],
			['GET 504 then 200', get('/x'), [err504, ok200], 2, [1000], null],
			[
				'GET 502 non-JSON then 200',
				get('/x'),
				[[502, '<html>bad gateway</html>'], ok200],
				2,
				[1000],
				null,
			],
			[
				'GET 400 not retried',
				get('/x'),
				[[400, '{"error":"bad","code":"bad_request"}']],
				1,
				[],
				BadRequestError,
			],
			[
				'GET 401 not retried',
				get('/x'),
				[[401, '{"error":"no","code":"unauthorized"}']],
				1,
				[],
				AuthenticationError,
			],
			[
				'GET 403 not retried',
				get('/x'),
				[[403, '{"error":"no","code":"forbidden"}']],
				1,
				[],
				PermissionDeniedError,
			],
			[
				'GET 404 not retried',
				get('/x'),
				[[404, '{"error":"no","code":"not_found"}']],
				1,
				[],
				NotFoundError,
			],
			[
				'GET 409 in_use not retried (not a create)',
				get('/x'),
				[keyInUse409],
				1,
				[],
				ConflictError,
			],
			[
				'POST action 500 not retried',
				{ method: 'POST', path: '/expire' },
				[err500],
				1,
				[],
				ServerError,
			],
			[
				'POST action 503 not retried',
				{ method: 'POST', path: '/cancel' },
				[err503],
				1,
				[],
				ServerError,
			],
			[
				'PUT 500 not retried',
				{ method: 'PUT', path: '/product/x', body: {} },
				[err500],
				1,
				[],
				ServerError,
			],
			[
				'DELETE 503 not retried',
				{ method: 'DELETE', path: '/product/x' },
				[err503],
				1,
				[],
				ServerError,
			],
			[
				'POST action 429 not retried',
				{ method: 'POST', path: '/trust' },
				[[429, '{"error":"slow","code":"rate_limit_exceeded"}']],
				1,
				[],
				RateLimitError,
			],
			['create 500, 500, 201', create, [err500, err500, [201, '{}']], 3, [1000, 2000], null],
			['create 409 in_use then 201', create, [keyInUse409, [201, '{}']], 2, [1000], null],
			[
				'create 409 unique_violation not retried',
				create,
				[
					[
						409,
						'{"error":"dup","code":"unique_violation","details":{"field":"reference"}}',
					],
				],
				1,
				[],
				ConflictError,
			],
			[
				'create 422 key reused not retried',
				create,
				[[422, '{"error":"reused","code":"idempotency_key_reused"}']],
				1,
				[],
				IdempotencyError,
			],
			[
				'create 400 validation not retried',
				create,
				[[400, '{"error":"bad","code":"validation_failed"}']],
				1,
				[],
				ValidationError,
			],
			['3xx not retried', get('/x'), [[302, '']], 1, [], ServerError],
			['maxRetries 0 disables', get('/x'), [err500], 1, [], ServerError, 0],
			['maxRetries 1', get('/x'), [err500], 2, [1000], ServerError, 1],
			[
				'maxRetries 5',
				get('/x'),
				[err503],
				6,
				[1000, 2000, 4000, 8000, 16000],
				ServerError,
				5,
			],
		];

	// Every row gets its 7th column (jest would pass `done` in a missing one).
	const rows = cases.map(
		([name, e, replies, attempts, sleeps, errClass, maxRetries]) =>
			[name, e, replies, attempts, sleeps, errClass, maxRetries ?? null] as const
	);
	it.each(rows)('%s', async (_name, e, replies, attempts, sleepsWant, errClass, maxRetries) => {
		const ts = await testServer(sequence(...replies));
		const { transport, sleeps } = testClient(ts, maxRetries === null ? {} : { maxRetries });
		let error: unknown;
		try {
			await transport.send(e, '');
		} catch (err) {
			error = err;
		}
		expect(ts.recorded).toHaveLength(attempts);
		expect(sleeps).toEqual(sleepsWant);
		if (errClass === null) expect(error).toBeUndefined();
		else expect(error).toBeInstanceOf(errClass);
	});
});

describe('idempotency keys', () => {
	it('generates one UUID v4 per call, reused by every retry', async () => {
		const ts = await testServer(sequence(err503, keyInUse409, [201, '{}']));
		const { transport } = testClient(ts);
		await transport.send(create, '');
		expect(ts.recorded).toHaveLength(3);
		const key = ts.recorded[0].headers['idempotency-key'];
		expect(key).toMatch(UUID_V4);
		for (const r of ts.recorded) {
			expect(r.headers['idempotency-key']).toBe(key);
			expect(r.body).toBe('{"name":"Pro"}');
		}
		await transport.send(create, '');
		expect(ts.recorded[3].headers['idempotency-key']).not.toBe(key);
		expect(ts.recorded[3].headers['idempotency-key']).toMatch(UUID_V4);
	});

	it("uses the caller's key, validated", async () => {
		const ts = await testServer(sequence(err500, [201, '{}']));
		const { transport } = testClient(ts);
		await transport.send(create, '', { idempotencyKey: 'order-1042:create~v1' });
		for (const r of ts.recorded)
			expect(r.headers['idempotency-key']).toBe('order-1042:create~v1');

		for (const key of ['has space', 'tab\tkey', 'é', 'k'.repeat(256)]) {
			const err = (await rejection(
				transport.send(create, '', { idempotencyKey: key })
			)) as ValidationError;
			expect(err).toBeInstanceOf(ValidationError);
			expect(err.fieldErrors[0].field).toBe('Idempotency-Key');
		}
		await transport.send(create, '', { idempotencyKey: 'k'.repeat(255) });

		// Ignored (and never sent) on other methods.
		const n = ts.recorded.length;
		await transport.send(get('/x'), '', { idempotencyKey: 'has space' });
		expect(ts.recorded[n].headers['idempotency-key']).toBeUndefined();
	});

	it('generates UUIDs v4', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 100; i++) {
			const id = newUUIDv4();
			expect(id).toMatch(UUID_V4);
			expect(seen.has(id)).toBe(false);
			seen.add(id);
		}
	});
});

describe('Retry-After', () => {
	const now = Date.UTC(2026, 9, 1, 12, 0, 0);
	const httpDate = (ms: number) => new Date(ms).toUTCString();
	const cases: Array<[string, string, string, number, number[], number]> = [
		['delta seconds', '5', '{"error":"slow","code":"rate_limit_exceeded"}', 2, [5000], 0],
		['below the backoff', '0', '{"error":"slow"}', 2, [1000], 0],
		['HTTP-date', httpDate(now + 3000), '{"error":"slow"}', 2, [3000], 0],
		[
			'details fallback',
			'',
			'{"error":"slow","details":{"retryAfterSeconds":7,"limit":60,"periodSeconds":60}}',
			2,
			[7000],
			0,
		],
		[
			'over 60 s: no retry',
			'120',
			'{"error":"slow","details":{"limit":50,"periodSeconds":3600}}',
			1,
			[],
			120,
		],
		['HTTP-date over 60 s: no retry', httpDate(now + 90_000), '{"error":"slow"}', 1, [], 90],
		['exactly 60 s: retried', '60', '{"error":"slow"}', 2, [60_000], 0],
	];

	it.each(cases)('%s', async (_name, header, body, attempts, sleepsWant, after) => {
		const ts = await testServer((_req, res, n) => {
			if (n === 0) reply(res, 429, body, header ? { 'Retry-After': header } : {});
			else reply(res, 200, '{}');
		});
		const { transport, sleeps } = testClient(ts);
		transport.now = () => now;
		let error: unknown;
		try {
			await transport.send(get('/x'), '');
		} catch (err) {
			error = err;
		}
		expect(ts.recorded).toHaveLength(attempts);
		expect(sleeps).toEqual(sleepsWant);
		if (attempts === 1) {
			expect(error).toBeInstanceOf(RateLimitError);
			expect((error as RateLimitError).retryAfter).toBe(after);
		} else {
			expect(error).toBeUndefined();
		}
	});

	it('waits max(Retry-After, the back-off)', async () => {
		const ts = await testServer((_req, res) =>
			reply(
				res,
				429,
				'{"error":"slow","code":"rate_limit_exceeded","details":{"limit":60,"periodSeconds":60,"retryAfterSeconds":3}}',
				{ 'Retry-After': '3' }
			)
		);
		const { transport, sleeps } = testClient(ts);
		const err = (await rejection(transport.send(get('/x'), ''))) as RateLimitError;
		expect(sleeps).toEqual([3000, 3000, 4000]);
		expect(err).toBeInstanceOf(RateLimitError);
		expect([err.limit, err.periodSeconds, err.retryAfter]).toEqual([60, 60, 3]);
	});
});

describe('network errors, timeouts and cancellation', () => {
	it('retries a dropped connection, then gives up with a NetworkError', async () => {
		const ts = await testServer((_req, res, n) =>
			n < 2 ? hangUp(res) : reply(res, 200, '{"ok":true}')
		);
		const { transport, sleeps } = testClient(ts);
		await transport.send(get('/x'), '');
		expect(ts.recorded).toHaveLength(3);
		expect(sleeps).toHaveLength(2);

		const down = await testServer((_req, res) => hangUp(res));
		const c2 = testClient(down);
		const err = (await rejection(c2.transport.send(get('/x'), ''))) as NetworkError;
		expect(err).toBeInstanceOf(NetworkError);
		expect(err.status).toBeUndefined();
		expect(err.cause).toBeDefined();
		expect(down.recorded).toHaveLength(4);
		expect(isRetryable(err)).toBe(true);

		// A non-retried write is attempted once.
		const before = down.recorded.length;
		expect(
			await rejection(c2.transport.send({ method: 'POST', path: '/expire' }, ''))
		).toBeInstanceOf(NetworkError);
		expect(down.recorded.length - before).toBe(1);
	});

	it('bounds each attempt with the timeout', async () => {
		const ts = await testServer((_req, res, n) => {
			if (n === 0) return; // hang past the timeout
			reply(res, 200, '{"ok":true}');
		});
		const { transport, sleeps } = testClient(ts, { timeout: 100 });
		const res = await transport.send(get('/x'), '');
		expect(res.body).toBe('{"ok":true}');
		expect(sleeps).toHaveLength(1);

		const hang = await testServer(() => undefined);
		const c2 = testClient(hang, { timeout: 100, maxRetries: 0 });
		const err = (await rejection(c2.transport.send(get('/x'), ''))) as NetworkError;
		expect(err).toBeInstanceOf(NetworkError);
		expect(err.message).toContain('timed out');
	});

	it('stops on an aborted signal, during the back-off too', async () => {
		const ts = await testServer(sequence(err503));
		const client = new QBitFlow(TEST_API_KEY, { baseUrl: ts.url });
		const controller = new AbortController();
		const started = Date.now();
		const pending = client[TRANSPORT].send(get('/x'), '', { signal: controller.signal });
		while (ts.recorded.length === 0) await new Promise((r) => setTimeout(r, 1));
		controller.abort(new Error('caller gave up'));
		const err = (await rejection(pending)) as NetworkError;
		expect(err).toBeInstanceOf(NetworkError);
		expect(err.message).toContain('request cancelled');
		expect(Date.now() - started).toBeLessThan(900);
		expect(ts.recorded).toHaveLength(1);

		// Already aborted: no request is retried.
		const done = new AbortController();
		done.abort();
		const before = ts.recorded.length;
		expect(
			await rejection(client[TRANSPORT].send(get('/x'), '', { signal: done.signal }))
		).toBeInstanceOf(NetworkError);
		expect(ts.recorded.length).toBe(before);
	});

	it('reports a retry due after the caller aborted as cancelled while waiting', async () => {
		const controller = new AbortController();
		const ts = await testServer((_req, res) => {
			controller.abort();
			reply(res, 503, '{"error":"x"}');
		});
		const { transport, sleeps } = testClient(ts);
		const err = (await rejection(
			transport.send(get('/x'), '', { signal: controller.signal })
		)) as NetworkError;
		expect(err).toBeInstanceOf(NetworkError);
		expect(sleeps).toHaveLength(0);
	});

	it('never follows a redirect', async () => {
		const ts = await testServer((req, res) => {
			if (req.path === '/elsewhere') return reply(res, 200, '{"hijacked":true}');
			res.writeHead(302, { Location: '/elsewhere' });
			res.end();
		});
		const { transport, sleeps } = testClient(ts);
		for (const e of [get('/me'), create]) {
			const err = (await rejection(transport.send(e, ''))) as ServerError;
			expect(err).toBeInstanceOf(ServerError);
			expect(err.status).toBe(302);
			expect(isRetryable(err)).toBe(false);
		}
		expect(ts.recorded.map((r) => r.path)).toEqual(['/me', '/product']);
		expect(sleeps).toHaveLength(0);
	});
});

describe('isRetryable', () => {
	const mk = (status: number, code: string) =>
		errorFromResponse(
			{ status, headers: new Headers(), body: JSON.stringify({ error: 'x', code }) },
			Date.now()
		);
	it.each([
		[mk(500, 'internal'), true],
		[mk(503, 'network_unavailable'), true],
		[mk(504, 'timeout'), true],
		[mk(429, 'rate_limit_exceeded'), true],
		[mk(409, 'idempotency_key_in_use'), true],
		[mk(409, 'unique_violation'), false],
		[mk(422, 'idempotency_key_reused'), false],
		[mk(400, 'validation_failed'), false],
		[mk(404, 'not_found'), false],
		[mk(302, ''), false],
		[new NetworkError({ message: 'down', cause: new Error('dial') }), true],
		[new ValidationError({ message: 'bad' }), false],
		[new Error('other'), false],
		[undefined, false],
	])('%#', (err, want) => {
		expect(isRetryable(err)).toBe(want);
	});
});
