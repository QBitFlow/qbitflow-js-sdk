/**
 * The webhook router (helpers H1): the status matrix of `handle`, and the `fetchHandler` (Web
 * `Request`/`Response`) and `nodeHandler` (a real `node:http` server) adapters.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { QBitFlow } from '../src/client';
import { ValidationError, WebhookSignatureError } from '../src/errors';
import { webhooks, type Event, type PaymentCompleted } from '../src/index';
import { MAX_WEBHOOK_BODY_BYTES, WebhookRouter } from '../src/webhookRouter';
import { thrown } from './helpers/server';

const SECRET = 'whsec_router_secret';
const now = (): number => Math.floor(Date.now() / 1000);

const envelope = (type: string, data: unknown, version = 'v2'): string =>
	JSON.stringify({
		id: 'evt_0f1c2d4e-5a6b-5c7d-8e9f-0a1b2c3d4e5f',
		type,
		version,
		createdAt: '2026-10-01T12:00:00Z',
		test: true,
		data,
	});

const PAYMENT = envelope('payment.completed', {
	uuid: 'pay@019eca82-5680-7b00-8000-000000000001',
	reference: 'order-1042',
	amount: 4.99,
});
const UNKNOWN = envelope('invoice.finalized', { number: 7 });
const TEST_EVENT = envelope('webhook.test', { endpointUuid: 'e', message: 'hi' });

/** A router recording which handlers ran, in order. */
function recordingRouter(): { router: WebhookRouter; calls: string[] } {
	const calls: string[] = [];
	const router = webhooks
		.router(SECRET)
		.on('payment.completed', (data, event) => {
			calls.push(`payment:${data.reference}:${event.id}`);
		})
		.on('webhook.test', async (data) => {
			await Promise.resolve();
			calls.push(`test:${data.message}`);
		})
		.onUnknown((event) => {
			calls.push(`unknown:${String(event.type)}`);
		})
		.onAny((event) => {
			calls.push(`any1:${event.type}`);
		})
		.onAny(async (event) => {
			calls.push(`any2:${event.type}`);
		});
	return { router, calls };
}

describe('router.handle', () => {
	it('valid delivery: 200, the type handler with typed data, then onAny in order', async () => {
		const { router, calls } = recordingRouter();
		const result = await router.handle(PAYMENT, webhooks.sign(PAYMENT, SECRET));
		expect(result.status).toBe(200);
		expect(result.error).toBeNull();
		expect(result.event?.type).toBe('payment.completed');
		expect(calls).toEqual([
			'payment:order-1042:evt_0f1c2d4e-5a6b-5c7d-8e9f-0a1b2c3d4e5f',
			'any1:payment.completed',
			'any2:payment.completed',
		]);
	});

	it('awaits async handlers', async () => {
		const { router, calls } = recordingRouter();
		const result = await router.handle(
			Buffer.from(TEST_EVENT),
			webhooks.sign(TEST_EVENT, SECRET)
		);
		expect(result.status).toBe(200);
		expect(calls).toEqual(['test:hi', 'any1:webhook.test', 'any2:webhook.test']);
	});

	it.each<[string, string, string]>([
		['bad signature', PAYMENT, webhooks.sign(PAYMENT, 'whsec_other')],
		['missing header', PAYMENT, ''],
		['stale timestamp', PAYMENT, webhooks.sign(PAYMENT, SECRET, now() - 301)],
		['future timestamp', PAYMENT, webhooks.sign(PAYMENT, SECRET, now() + 301)],
	])('%s: 400, no handler', async (_name, body, header) => {
		const { router, calls } = recordingRouter();
		const result = await router.handle(body, header);
		expect(result.status).toBe(400);
		expect(result.event).toBeNull();
		expect(result.error).toBeInstanceOf(WebhookSignatureError);
		expect(calls).toEqual([]);
	});

	it.each<[string, string]>([
		['not JSON', 'not json'],
		['a JSON array', '[1]'],
		['a v1 body', envelope('payment.completed', {}, 'v1')],
		['a wrong field type', envelope('payment.completed', { amount: 'x' })],
	])('%s: 400 (ValidationError), no handler', async (_name, body) => {
		const { router, calls } = recordingRouter();
		const result = await router.handle(body, webhooks.sign(body, SECRET));
		expect(result.status).toBe(400);
		expect(result.error).toBeInstanceOf(ValidationError);
		expect(calls).toEqual([]);
	});

	it('honours the tolerance option', async () => {
		const header = webhooks.sign(PAYMENT, SECRET, now() - 500);
		expect((await webhooks.router(SECRET).handle(PAYMENT, header)).status).toBe(400);
		expect(
			(await webhooks.router(SECRET, { tolerance: 600 }).handle(PAYMENT, header)).status
		).toBe(200);
	});

	it('unknown type: 200, onUnknown then onAny', async () => {
		const { router, calls } = recordingRouter();
		const result = await router.handle(UNKNOWN, webhooks.sign(UNKNOWN, SECRET));
		expect(result.status).toBe(200);
		expect(result.event && webhooks.isUnknownEvent(result.event)).toBe(true);
		expect(calls).toEqual([
			'unknown:invoice.finalized',
			'any1:invoice.finalized',
			'any2:invoice.finalized',
		]);
	});

	it('no handler for the type: 200', async () => {
		const body = envelope('member.removed', { userUuid: 'u' });
		const result = await webhooks.router(SECRET).handle(body, webhooks.sign(body, SECRET));
		expect(result).toMatchObject({ status: 200, error: null });
		expect(result.event?.type).toBe('member.removed');
	});

	it.each<[string, () => unknown]>([
		[
			'throws',
			() => {
				throw new Error('db down');
			},
		],
		['rejects', async () => Promise.reject(new Error('db down'))],
	])('a handler that %s: 500, its error, later handlers skipped', async (_name, failing) => {
		const calls: string[] = [];
		const errors: Array<[Error, Event | null]> = [];
		const router = webhooks
			.router(SECRET, { onError: (event, err) => errors.push([err, event]) })
			.on('payment.completed', () => {
				calls.push('first');
			})
			.on('payment.completed', failing)
			.on('payment.completed', () => {
				calls.push('third');
			})
			.onAny(() => {
				calls.push('any');
			});
		const result = await router.handle(PAYMENT, webhooks.sign(PAYMENT, SECRET));
		expect(result.status).toBe(500);
		expect(result.error?.message).toBe('db down');
		expect(result.event?.type).toBe('payment.completed');
		expect(calls).toEqual(['first']);
		expect(errors).toHaveLength(1);
		expect(errors[0][0]).toBe(result.error);
	});

	it('a failing onAny handler: 500, the next onAny skipped; a non-Error is wrapped', async () => {
		const calls: string[] = [];
		const router = webhooks
			.router(SECRET)
			.onAny(() => {
				throw 'nope'; // eslint-disable-line no-throw-literal
			})
			.onAny(() => {
				calls.push('second');
			});
		const result = await router.handle(PAYMENT, webhooks.sign(PAYMENT, SECRET));
		expect(result.status).toBe(500);
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain('nope');
		expect(calls).toEqual([]);
	});

	it('onError sees the 400s (event null) and the 500s, never the 405s and 413s', async () => {
		const seen: Array<[string, string | null]> = [];
		const router = webhooks
			.router(SECRET, {
				onError: (event, err) => seen.push([err.constructor.name, event?.type ?? null]),
			})
			.on('payment.completed', () => {
				throw new Error('boom');
			});
		await router.handle(PAYMENT, 't=1,v1=00');
		const v1 = envelope('payment.completed', {}, 'v1');
		await router.handle(v1, webhooks.sign(v1, SECRET));
		await router.handle(PAYMENT, webhooks.sign(PAYMENT, SECRET));
		await router.handle(TEST_EVENT, webhooks.sign(TEST_EVENT, SECRET)); // 200: not reported
		const handler = router.fetchHandler();
		await handler(new Request(URL, { method: 'GET' }));
		const big = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1);
		await handler(new Request(URL, { method: 'POST', body: big }));
		expect(seen).toEqual([
			['WebhookSignatureError', null],
			['ValidationError', null],
			['Error', 'payment.completed'],
		]);
	});

	it('a throwing onError hook changes nothing', async () => {
		const router = webhooks
			.router(SECRET, {
				onError: () => {
					throw new Error('hook');
				},
			})
			.onAny(() => {
				throw new Error('handler');
			});
		const result = await router.handle(PAYMENT, webhooks.sign(PAYMENT, SECRET));
		expect(result.status).toBe(500);
		expect(result.error?.message).toBe('handler');
	});

	it('refuses an empty secret, an unknown type and a non-function handler', () => {
		expect(thrown(() => webhooks.router(''))).toBeInstanceOf(ValidationError);
		const router = webhooks.router(SECRET);
		const unknownType = thrown(() =>
			router.on('invoice.finalized' as 'payment.completed', () => undefined)
		);
		expect(unknownType).toBeInstanceOf(ValidationError);
		expect((unknownType as ValidationError).fieldErrors[0].field).toBe('type');
		expect(thrown(() => router.onAny(undefined as unknown as () => void))).toBeInstanceOf(
			ValidationError
		);
	});

	it('types each handler through the event union', () => {
		webhooks
			.router(SECRET)
			.on('payment.completed', (data: PaymentCompleted) => data.reference)
			.on('subscription.billingFailed', (data) => {
				const amount: string = data.amountUsd; // a string here
				return amount;
			})
			.on('subscription.upcomingBill', (data) => {
				const amount: number = data.amountUsd; // a number there
				return amount;
			})
			.on('checkout.expired', (data, event) => {
				const type: 'checkout.expired' = event.type;
				return webhooks.isSubscriptionSession(data) ? type : data.uuid;
			})
			// @ts-expect-error: a payment has no previousStatus
			.on('payment.completed', (data) => data.previousStatus);
		expect(true).toBe(true);
	});

	it('client.webhooks.router builds the same router', async () => {
		const client = new QBitFlow('sk_test_key_123');
		const router = client.webhooks.router(SECRET);
		expect(router).toBeInstanceOf(WebhookRouter);
		expect(router).toBeInstanceOf(webhooks.WebhookRouter);
		expect((await router.handle(PAYMENT, webhooks.sign(PAYMENT, SECRET))).status).toBe(200);
	});
});

const URL = 'https://shop.example.com/webhooks/qbitflow';

describe('router.fetchHandler', () => {
	const handler = recordingRouter().router.fetchHandler();
	const post = (body: string | null, headers: Record<string, string> = {}): Request =>
		new Request(URL, { method: 'POST', body, headers });

	it('answers 200 {"received":true} as JSON', async () => {
		const res = await handler(
			post(PAYMENT, { 'QBitFlow-Signature': webhooks.sign(PAYMENT, SECRET) })
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ received: true });
	});

	it.each(['qbitflow-signature', 'QBITFLOW-SIGNATURE', 'QBitFlow-Signature'])(
		'reads the header case-insensitively (%s)',
		async (name) => {
			const res = await handler(post(PAYMENT, { [name]: webhooks.sign(PAYMENT, SECRET) }));
			expect(res.status).toBe(200);
		}
	);

	it('400 with a short reason, never the secret', async () => {
		const bad = await handler(post(PAYMENT, { 'QBitFlow-Signature': 't=1,v1=00' }));
		expect(bad.status).toBe(400);
		const text = await bad.text();
		expect(JSON.parse(text)).toEqual({ error: 'invalid signature' });
		expect(text).not.toContain(SECRET);

		const v1 = envelope('payment.completed', {}, 'v1');
		const invalid = await handler(
			post(v1, { 'QBitFlow-Signature': webhooks.sign(v1, SECRET) })
		);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({ error: 'invalid event' });
	});

	it('500 {"error":"internal error"} without the error', async () => {
		const failing = webhooks
			.router(SECRET)
			.onAny(() => {
				throw new Error(`secret stuff ${SECRET}`);
			})
			.fetchHandler();
		const res = await failing(
			post(PAYMENT, { 'QBitFlow-Signature': webhooks.sign(PAYMENT, SECRET) })
		);
		expect(res.status).toBe(500);
		expect(await res.text()).toBe('{"error":"internal error"}');
	});

	it.each(['GET', 'PUT', 'DELETE'])('405 to %s, with Allow: POST', async (method) => {
		const res = await handler(new Request(URL, { method }));
		expect(res.status).toBe(405);
		expect(res.headers.get('allow')).toBe('POST');
		expect(await res.json()).toEqual({ error: 'method not allowed' });
	});

	it('413 to a body above 1 MiB (read, or declared)', async () => {
		const big = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1);
		const res = await handler(post(big, { 'QBitFlow-Signature': webhooks.sign(big, SECRET) }));
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: 'body too large' });

		const declared = await handler(
			post('{}', { 'Content-Length': String(MAX_WEBHOOK_BODY_BYTES + 1) })
		);
		expect(declared.status).toBe(413);

		const exact = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES);
		const ok = await handler(
			post(exact, { 'QBitFlow-Signature': webhooks.sign(exact, SECRET) })
		);
		expect(ok.status).toBe(400); // read in full (not JSON)
	});

	it('an empty body is a 400', async () => {
		const res = await handler(post(null, { 'QBitFlow-Signature': webhooks.sign('', SECRET) }));
		expect(res.status).toBe(400);
	});
});

/** A real node:http server; `prepare` runs before the router's handler (a body parser stand-in). */
async function nodeServer(
	router: WebhookRouter,
	prepare?: (req: http.IncomingMessage & { body?: unknown }) => Promise<void>
): Promise<{ url: string; close: () => Promise<void> }> {
	const handler = router.nodeHandler();
	const server = http.createServer((req, res) => {
		void (async () => {
			if (prepare) await prepare(req);
			await handler(req, res);
		})();
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/qbitflow`;
	return {
		url,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}

/** Reads the request's body, as a body parser would. */
async function readAll(req: http.IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	return Buffer.concat(chunks);
}

describe('router.nodeHandler', () => {
	const servers: Array<{ close: () => Promise<void> }> = [];
	afterEach(async () => {
		await Promise.all(servers.splice(0).map((s) => s.close()));
	});
	const start = async (...args: Parameters<typeof nodeServer>) => {
		const s = await nodeServer(...args);
		servers.push(s);
		return s.url;
	};
	const send = (url: string, body: string, headers: Record<string, string> = {}) =>
		fetch(url, { method: 'POST', body, headers });

	it('reads the raw body itself: 200, handler ran', async () => {
		const { router, calls } = recordingRouter();
		const url = await start(router);
		const res = await send(url, PAYMENT, {
			'qbitflow-SIGNATURE': webhooks.sign(PAYMENT, SECRET),
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ received: true });
		expect(calls[0]).toBe('payment:order-1042:evt_0f1c2d4e-5a6b-5c7d-8e9f-0a1b2c3d4e5f');
	});

	it('400 on a bad signature, 500 on a failing handler', async () => {
		const url = await start(
			webhooks.router(SECRET).on('payment.completed', () => {
				throw new Error('boom');
			})
		);
		const bad = await send(url, PAYMENT, { 'QBitFlow-Signature': 't=1,v1=00' });
		expect(bad.status).toBe(400);
		expect(await bad.json()).toEqual({ error: 'invalid signature' });
		const failed = await send(url, PAYMENT, {
			'QBitFlow-Signature': webhooks.sign(PAYMENT, SECRET),
		});
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({ error: 'internal error' });
	});

	it('405 to GET', async () => {
		const url = await start(recordingRouter().router);
		const res = await fetch(url);
		expect(res.status).toBe(405);
		expect(res.headers.get('allow')).toBe('POST');
	});

	it('413 to a body above 1 MiB (declared length, and chunked)', async () => {
		const url = await start(recordingRouter().router);
		const big = 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1);
		const declared = await send(url, big);
		expect(declared.status).toBe(413);
		expect(await declared.json()).toEqual({ error: 'body too large' });

		const chunk = new Uint8Array(64 * 1024).fill(120);
		let sent = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent > MAX_WEBHOOK_BODY_BYTES) controller.close();
				else {
					sent += chunk.length;
					controller.enqueue(chunk);
				}
			},
		});
		const chunked = await fetch(url, {
			method: 'POST',
			body: stream,
			duplex: 'half',
		} as RequestInit);
		expect(chunked.status).toBe(413);
	});

	it.each<[string, (raw: Buffer) => unknown]>([
		['a Buffer (express.raw)', (raw) => raw],
		['a string', (raw) => raw.toString('utf8')],
	])('uses req.body when it is %s', async (_name, toBody) => {
		const { router, calls } = recordingRouter();
		const url = await start(router, async (req) => {
			req.body = toBody(await readAll(req));
		});
		const res = await send(url, PAYMENT, {
			'QBitFlow-Signature': webhooks.sign(PAYMENT, SECRET),
		});
		expect(res.status).toBe(200);
		expect(calls).toHaveLength(3);
	});

	it('413 when req.body is above 1 MiB', async () => {
		const url = await start(recordingRouter().router, async (req) => {
			await readAll(req);
			req.body = Buffer.alloc(MAX_WEBHOOK_BODY_BYTES + 1);
		});
		expect((await send(url, '{}')).status).toBe(413);
	});

	it.each<[string, (req: http.IncomingMessage & { body?: unknown }) => Promise<void>]>([
		[
			'parsed into an object (express.json)',
			async (req) => {
				req.body = JSON.parse((await readAll(req)).toString('utf8'));
			},
		],
		[
			'consumed by another middleware',
			async (req) => {
				await readAll(req);
			},
		],
	])('500 with a clear message when the body was %s', async (_name, prepare) => {
		const { router, calls } = recordingRouter();
		const url = await start(router, prepare);
		const res = await send(url, PAYMENT, {
			'QBitFlow-Signature': webhooks.sign(PAYMENT, SECRET),
		});
		expect(res.status).toBe(500);
		const { error } = (await res.json()) as { error: string };
		expect(error).toContain('express.raw');
		expect(error).toContain('express.json()');
		expect(calls).toEqual([]);
	});
});
