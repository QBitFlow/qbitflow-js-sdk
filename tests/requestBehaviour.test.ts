/**
 * Tests for request construction, response decoding, status → exception mapping and
 * transport details. These run against a throwaway local HTTP server that records what it
 * received, so the real axios path is exercised and the request URL/headers can be asserted.
 */

import { QBitFlow, VERSION } from '../src';
import { ZERO_TIME } from '../src/decode';
import {
	ConflictException,
	ForbiddenException,
	NetworkException,
	NotFoundException,
	QBitFlowError,
	RateLimitException,
	ServerException,
	UnauthorizedException,
	ValidationException,
} from '../src/exceptions';
import { json, stubServer } from './helpers/stubServer';

describe('Request construction', () => {
	it('sends the claim test-trigger user id as a path segment, not a query param', async () => {
		const stub = await stubServer(json({ message: 'ok' }));
		try {
			await stub.client.claims.triggerTestClaimFunds(42);
			expect(stub.received).toHaveLength(1);
			expect(stub.received[0].url).toBe('/user/claim/funds/test-trigger/42');
		} finally {
			await stub.close();
		}
	});

	it('sends the claim request user id as a path segment', async () => {
		const stub = await stubServer(json({ message: 'ok', link: 'https://x' }));
		try {
			await stub.client.claims.getRequestByUser(42);
			expect(stub.received[0].url).toBe('/user/claim/request/42');
		} finally {
			await stub.close();
		}
	});

	it('escapes user-supplied path segments', async () => {
		const stub = await stubServer(json({}));
		try {
			await stub.client.oneTimePayments.getByReference('ORD/2026/17');
			await stub.client.customers.getByEmail('a+b@example.com');
			await stub.client.subscriptions.get('sub@01a0');
			expect(stub.received.map((r) => r.url)).toEqual([
				'/transaction/payment/reference/ORD%2F2026%2F17',
				'/customer/email/a%2Bb%40example.com',
				'/transaction/subscription/sub%4001a0',
			]);
		} finally {
			await stub.close();
		}
	});

	it('users.getById takes a number and puts it in the path', async () => {
		const stub = await stubServer(json({ id: 42 }));
		try {
			await stub.client.users.getById(42);
			expect(stub.received[0].url).toBe('/user/id/42');
			await expect(stub.client.users.getById(0)).rejects.toThrow(ValidationException);
		} finally {
			await stub.close();
		}
	});

	it('sends X-API-Key, a qbitflow-js User-Agent and JSON content type', async () => {
		const stub = await stubServer(json([]));
		try {
			await stub.client.products.getAll();
			const h = stub.received[0].headers;
			expect(h['x-api-key']).toBe('sk_dummy');
			expect(h['user-agent']).toBe(`qbitflow-js/${VERSION}`);
			expect(h['content-type']).toBe('application/json');
		} finally {
			await stub.close();
		}
	});

	it('strips a trailing slash from the base URL', async () => {
		const stub = await stubServer(json([]));
		try {
			const client = new QBitFlow({
				apiKey: 'sk_dummy',
				baseUrl: `${stub.baseUrl}///`,
				maxRetries: 0,
			});
			expect(client.getBaseUrl()).toBe(stub.baseUrl);
			await client.products.getAll();
			expect(stub.received[0].url).toBe('/product/');
		} finally {
			await stub.close();
		}
	});

	it('getSession forwards closeToExpireError only when given', async () => {
		const stub = await stubServer((req) =>
			req.url.includes('sub%40')
				? json({ uuid: 'sub@1', txType: 'createSubscription', frequency: 60 })
				: json({ uuid: 'pay@1', txType: 'payment' })
		);
		try {
			await stub.client.oneTimePayments.getSession('pay@1');
			await stub.client.oneTimePayments.getSession('pay@1', false);
			await stub.client.subscriptions.getSession('sub@1', true);
			expect(stub.received.map((r) => r.url)).toEqual([
				'/transaction/session-checkout/pay%401',
				'/transaction/session-checkout/pay%401?closeToExpireError=false',
				'/transaction/session-checkout/sub%401?closeToExpireError=true',
			]);
		} finally {
			await stub.close();
		}
	});

	it('transactionStatus.get sends txUUID and txType (enum member or string)', async () => {
		const stub = await stubServer(json({ status: 'created' }));
		try {
			const status = await stub.client.transactionStatus.get('pay@1', 'payment');
			expect(stub.received[0].url).toBe('/transaction/status?txUUID=pay%401&txType=payment');
			expect(status).toEqual({
				status: 'created',
				txHash: '',
				message: '',
				settlementDetails: null,
			});
		} finally {
			await stub.close();
		}
	});

	it('accounting export sends from/to/format and returns CSV text verbatim', async () => {
		const csv = 'paymentId,type\npay@1,payment\n';
		const stub = await stubServer({ body: csv, contentType: 'text/csv' });
		try {
			const result: string = await stub.client.accounting.export(
				'2026-01-01',
				'2026-01-31',
				'csv'
			);
			expect(result).toBe(csv);
			expect(stub.received[0].url).toBe(
				'/accounting/export?from=2026-01-01&to=2026-01-31&format=csv'
			);
		} finally {
			await stub.close();
		}
	});

	it('accounting export accepts a window wider than three months (the API decides)', async () => {
		const stub = await stubServer(json([]));
		try {
			await expect(
				stub.client.accounting.export('2026-01-01', '2026-04-05', 'json')
			).resolves.toEqual([]);
		} finally {
			await stub.close();
		}
	});
});

describe('Request bodies', () => {
	it('leaves empty optional strings and a zero minPeriods out of a session body', async () => {
		const stub = await stubServer(json({ uuid: 'sub@1', link: 'https://x' }, 201));
		try {
			await stub.client.subscriptions.createSession({
				productId: 1,
				frequency: { value: 1, unit: 'months' },
				trialPeriod: { value: 0, unit: 'days' },
				minPeriods: 0,
				reference: '',
				customerUUID: '',
				successUrl: '',
			});
			expect(JSON.parse(stub.received[0].body)).toEqual({
				productId: 1,
				frequency: { value: 1, unit: 'months' },
				trialPeriod: { value: 0, unit: 'days' },
			});
		} finally {
			await stub.close();
		}
	});

	it('leaves empty strings out of customer and user updates', async () => {
		const stub = await stubServer(json({}));
		try {
			await stub.client.customers.update('c-1', { name: '', email: '', address: 'Main St' });
			await stub.client.users.update(3, { name: 'Alice', lastName: '', email: '' });
			expect(JSON.parse(stub.received[0].body)).toEqual({ address: 'Main St' });
			expect(JSON.parse(stub.received[1].body)).toEqual({ name: 'Alice' });
		} finally {
			await stub.close();
		}
	});

	it('rejects a body JSON cannot represent before sending anything', async () => {
		const stub = await stubServer(json({}));
		try {
			await expect(
				stub.client.customers.update('c-1', { phoneNumber: 12 as unknown as string })
			).rejects.toThrow(ValidationException);
			await expect(stub.client.users.update(3, { organizationFeeBps: NaN })).rejects.toThrow(
				ValidationException
			);
			await expect(
				stub.client.customers.create({
					name: 'John',
					lastName: 'Doe',
					email: 'j@d.com',
					extra: 10n,
				} as never)
			).rejects.toThrow(/BigInt/);
			expect(stub.received).toHaveLength(0);
		} finally {
			await stub.close();
		}
	});
});

describe('On-Behalf-Of', () => {
	it('per service: adds the header for a positive id, omits it for 0, rejects bad ids', async () => {
		const stub = await stubServer(json([]));
		try {
			await stub.client.products.onBehalfOf(123).getAll();
			await stub.client.products.onBehalfOf(0).getAll();
			await stub.client.products.getAll();
			expect(stub.received[0].headers['on-behalf-of']).toBe('123');
			expect(stub.received[1].headers['on-behalf-of']).toBeUndefined();
			expect(stub.received[2].headers['on-behalf-of']).toBeUndefined();
			for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
				expect(() => stub.client.products.onBehalfOf(bad)).toThrow(ValidationException);
			}
			expect(() => stub.client.products.onBehalfOf('7' as unknown as number)).toThrow(
				ValidationException
			);
		} finally {
			await stub.close();
		}
	});

	it('propagates the header to the nested session requests', async () => {
		const stub = await stubServer(json({ uuid: 'pay@1', link: 'https://x' }, 201));
		try {
			await stub.client.oneTimePayments.onBehalfOf(9).createSession({ productId: 1 });
			expect(stub.received[0].method).toBe('POST');
			expect(stub.received[0].headers['on-behalf-of']).toBe('9');
		} finally {
			await stub.close();
		}
	});

	it('client-level onBehalfOf scopes every service and leaves the original client alone', async () => {
		const stub = await stubServer((req) =>
			req.url.startsWith('/transaction/session-checkout/new')
				? json({ uuid: 'pay@1', link: 'https://x' }, 201)
				: json(req.url.startsWith('/transaction/payments') ? { items: [] } : [])
		);
		try {
			const asUser = stub.client.onBehalfOf(55);
			expect(asUser).toBeInstanceOf(QBitFlow);
			expect(asUser).not.toBe(stub.client);
			expect(asUser.getBaseUrl()).toBe(stub.client.getBaseUrl());

			await asUser.products.getAll();
			await asUser.oneTimePayments.getAll();
			await asUser.oneTimePayments.createSession({ productId: 1 });
			await asUser.refunds.getAll();
			await asUser.currencies.getAllMain();
			await asUser.products.onBehalfOf(7).getAll(); // a service can still be re-scoped
			await asUser.products.onBehalfOf(0).getAll(); // …or brought back to org level
			await stub.client.products.getAll(); // the original client is untouched
			await stub.client.onBehalfOf(0).products.getAll();

			expect(stub.received.map((r) => r.headers['on-behalf-of'])).toEqual([
				'55',
				'55',
				'55',
				'55',
				'55',
				'7',
				undefined,
				undefined,
				undefined,
			]);
			expect(() => stub.client.onBehalfOf(-3)).toThrow(ValidationException);
			expect(() => stub.client.onBehalfOf(2 ** 60)).toThrow(ValidationException);
		} finally {
			await stub.close();
		}
	});
});

describe('Response decoding', () => {
	it('fills absent and null fields with zero values and keeps nullable ones as null', async () => {
		const stub = await stubServer(
			json({
				uuid: 'pay@1',
				amount: 5,
				currency: { id: 2, symbol: 'SOL', mainCurrency: null },
				metadata: null,
			})
		);
		try {
			const payment = await stub.client.oneTimePayments.get('pay@1');
			expect(payment.reference).toBeNull();
			expect(payment.customerUUID).toBeNull();
			expect(payment.productId).toBe(0);
			expect(payment.userId).toBe(0);
			expect(payment.createdAt).toBe(ZERO_TIME);
			expect(payment.currency.symbol).toBe('SOL');
			expect(payment.currency.mainCurrencyId).toBeNull();
			expect(payment.metadata.txAmounts.usd.merchant).toBe(0);
			expect(payment.metadata.organizationFee).toBeNull();
		} finally {
			await stub.close();
		}
	});

	it('turns a null list into [] — top-level, in a page, and in a session', async () => {
		const stub = await stubServer((req) => {
			if (req.url.startsWith('/customer/all')) return json({ items: null, nextCursor: null });
			if (req.url.startsWith('/transaction/session-checkout'))
				return json({ uuid: 'pay@1', txType: 'payment', availableCurrencies: null });
			return json(null);
		});
		try {
			const page = await stub.client.customers.getAll();
			expect(page.items).toEqual([]);
			expect(page.nextCursor).toBeNull();
			expect(page.hasMore()).toBe(false);
			expect(await stub.client.products.getAll()).toEqual([]);
			expect(await stub.client.refunds.getAll()).toEqual([]);
			expect(await stub.client.claims.getFunds()).toEqual([]);
			expect(await stub.client.currencies.getAllAvailable()).toEqual([]);
			expect(await stub.client.subscriptions.getPaymentHistory('sub@1')).toEqual([]);
			expect(await stub.client.accounting.export('2026-01-01', '2026-01-31', 'json')).toEqual(
				[]
			);
			const session = await stub.client.oneTimePayments.getSession('pay@1');
			expect(session.availableCurrencies).toEqual([]);
		} finally {
			await stub.close();
		}
	});

	it('decodes the subscription currency object', async () => {
		const stub = await stubServer(
			json({
				uuid: 'sub@1',
				currencyId: 7,
				currency: {
					id: 7,
					symbol: 'USDC',
					decimals: 6,
					address: 'mint',
					mainCurrencyId: 4,
				},
			})
		);
		try {
			const sub = await stub.client.subscriptions.get('sub@1');
			expect(sub.currency).toEqual({
				id: 7,
				symbol: 'USDC',
				name: '',
				decimals: 6,
				address: 'mint',
				mainCurrencyId: 4,
				mainCurrency: null,
				test: false,
			});
			expect(sub.lastBillingDate).toBe(ZERO_TIME);
		} finally {
			await stub.close();
		}
	});

	it('reports a field of the wrong JSON type as ServerException with the path and status', async () => {
		const stub = await stubServer(
			json({ items: [{ uuid: 'c', createdAt: 12 }], nextCursor: null })
		);
		try {
			const error = (await stub.client.customers.getAll().catch((e) => e)) as ServerException;
			expect(error).toBeInstanceOf(ServerException);
			expect(error.statusCode).toBe(200);
			expect(error.message).toContain('items[0].createdAt');
		} finally {
			await stub.close();
		}
	});

	it('rejects a 200 whose body is not JSON, with a shortened excerpt', async () => {
		const page = `<html><body>Proxy error ${'x'.repeat(500)}</body></html>`;
		const stub = await stubServer({ body: page, contentType: 'text/html' });
		try {
			const error = (await stub.client.products.get(1).catch((e) => e)) as ServerException;
			expect(error).toBeInstanceOf(ServerException);
			expect(error.message).toMatch(/could not be parsed/);
			expect(error.message).toMatch(/Proxy error/);
			expect(error.message.length).toBeLessThan(320);
			expect(error.statusCode).toBe(200);
		} finally {
			await stub.close();
		}
	});

	it('rejects an empty 200 body as a ServerException', async () => {
		const stub = await stubServer({ body: '' });
		try {
			const error = (await stub.client.products.get(1).catch((e) => e)) as ServerException;
			expect(error).toBeInstanceOf(ServerException);
			expect(error.statusCode).toBe(200);
			expect(error.message).toMatch(/empty/);
		} finally {
			await stub.close();
		}
	});

	it('treats a 204 as an empty (zero-valued) result', async () => {
		const stub = await stubServer({ status: 204, body: '' });
		try {
			await expect(stub.client.products.delete(1)).resolves.toEqual({ message: '' });
		} finally {
			await stub.close();
		}
	});

	it('executeTestBilling returns the {message} envelope', async () => {
		const stub = await stubServer(json({ message: 'Billing executed successfully' }));
		try {
			const result = await stub.client.subscriptions.executeTestBilling('sub@1');
			expect(result).toEqual({ message: 'Billing executed successfully' });
			expect(stub.received[0].url).toBe(
				'/transaction/subscription/processing/execute-billing/sub%401'
			);
		} finally {
			await stub.close();
		}
	});

	it('passes an unknown enum value through as its raw string', async () => {
		const stub = await stubServer(
			json({ uuid: 'sub@1', subscriptionStatus: 'brand_new_status' })
		);
		try {
			const sub = await stub.client.subscriptions.get('sub@1');
			expect(sub.subscriptionStatus).toBe('brand_new_status');
		} finally {
			await stub.close();
		}
	});

	it('returns timestamps as RFC3339 strings', async () => {
		const stub = await stubServer(
			json({ id: 1, createdAt: '2026-09-21T22:02:09.986381+02:00', claimedAt: null })
		);
		try {
			const user = await stub.client.users.getById(1);
			expect(user.createdAt).toBe('2026-09-21T22:02:09.986381+02:00');
			expect(user.updatedAt).toBe(ZERO_TIME);
			expect(user.claimedAt).toBeNull();
		} finally {
			await stub.close();
		}
	});
});

describe('Session getters check the session kind', () => {
	it('oneTimePayments.getSession refuses a subscription session', async () => {
		const stub = await stubServer(
			json({ uuid: 'sub@1', txType: 'createSubscription', frequency: 60 })
		);
		try {
			const error = (await stub.client.oneTimePayments
				.getSession('sub@1')
				.catch((e) => e)) as ValidationException;
			expect(error).toBeInstanceOf(ValidationException);
			expect(error.message).toContain('client.subscriptions.getSession()');
		} finally {
			await stub.close();
		}
	});

	it('subscriptions.getSession refuses a payment session and decodes a subscription one', async () => {
		const stub = await stubServer((req) =>
			req.url.includes('pay%40')
				? json({ uuid: 'pay@1', txType: 'payment' })
				: json({ uuid: 'sub@1', txType: 'createSubscription', frequency: 60 })
		);
		try {
			const error = (await stub.client.subscriptions
				.getSession('pay@1')
				.catch((e) => e)) as ValidationException;
			expect(error).toBeInstanceOf(ValidationException);
			expect(error.message).toContain('client.oneTimePayments.getSession()');

			const sub = await stub.client.subscriptions.getSession('sub@1');
			expect(sub.frequency).toBe(60);
			expect(sub.trialPeriod).toBe(0);
			expect(sub.upgradingFromTrial).toBe(false);
		} finally {
			await stub.close();
		}
	});
});

describe('Status → exception mapping', () => {
	const cases: Array<[number, new (...args: never[]) => QBitFlowError]> = [
		[400, ValidationException],
		[422, ValidationException],
		[401, UnauthorizedException],
		[403, ForbiddenException],
		[404, NotFoundException],
		[409, ConflictException],
		[429, RateLimitException],
		[500, ServerException],
		[503, ServerException],
	];

	it.each(cases)('maps %i to %p with statusCode set', async (status, expected) => {
		const stub = await stubServer(json({ error: `status ${status}` }, status));
		try {
			const error = (await stub.client.products.get(1).catch((e) => e)) as QBitFlowError;
			expect(error).toBeInstanceOf(expected);
			expect(error.statusCode).toBe(status);
			expect(error.message).toBe(`status ${status}`);
		} finally {
			await stub.close();
		}
	});

	it('maps an unmapped 4xx to the base QBitFlowError, not ValidationException', async () => {
		for (const status of [405, 410, 418]) {
			const stub = await stubServer(json({ error: 'nope' }, status));
			try {
				const error = (await stub.client.products.get(1).catch((e) => e)) as QBitFlowError;
				expect(error).toBeInstanceOf(QBitFlowError);
				expect(error).not.toBeInstanceOf(ValidationException);
				expect(error.constructor).toBe(QBitFlowError);
				expect(error.statusCode).toBe(status);
			} finally {
				await stub.close();
			}
		}
	});

	it('exposes Retry-After on a 429 (seconds and HTTP-date forms)', async () => {
		const seconds = await stubServer({
			status: 429,
			body: JSON.stringify({ error: 'slow down' }),
			headers: { 'Retry-After': '30' },
		});
		const dated = await stubServer({
			status: 429,
			body: JSON.stringify({ error: 'slow down' }),
			headers: { 'Retry-After': new Date(Date.now() + 90_000).toUTCString() },
		});
		const past = await stubServer({
			status: 429,
			body: JSON.stringify({ error: 'slow down' }),
			headers: { 'Retry-After': new Date(Date.now() - 90_000).toUTCString() },
		});
		const none = await stubServer(json({ error: 'slow down' }, 429));
		try {
			await expect(seconds.client.products.get(1)).rejects.toMatchObject({ retryAfter: 30 });
			const err = (await dated.client.products.get(1).catch((e) => e)) as RateLimitException;
			expect(err.retryAfter).toBeGreaterThanOrEqual(85);
			expect(err.retryAfter).toBeLessThanOrEqual(91);
			await expect(past.client.products.get(1)).rejects.toMatchObject({ retryAfter: 0 });
			await expect(none.client.products.get(1)).rejects.toMatchObject({
				retryAfter: undefined,
			});
		} finally {
			await seconds.close();
			await dated.close();
			await past.close();
			await none.close();
		}
	});

	it('parses the JSON error body of the CSV export', async () => {
		const stub = await stubServer({
			status: 400,
			body: JSON.stringify({ errors: [{ field: 'To', message: 'To is invalid' }] }),
		});
		try {
			const error = (await stub.client.accounting
				.export('2026-01-01', '2026-01-31', 'csv')
				.catch((e) => e)) as ValidationException;
			expect(error).toBeInstanceOf(ValidationException);
			expect(error.message).toBe('To: To is invalid');
			expect(error.fields).toEqual([{ field: 'To', message: 'To is invalid' }]);
			expect(error.statusCode).toBe(400);
		} finally {
			await stub.close();
		}
	});

	it('client-side validation errors carry no statusCode', async () => {
		const stub = await stubServer(json({}));
		try {
			const error = (await stub.client.customers
				.get('')
				.catch((e) => e)) as ValidationException;
			expect(error).toBeInstanceOf(ValidationException);
			expect(error.statusCode).toBeUndefined();
			expect(stub.received).toHaveLength(0); // never sent
		} finally {
			await stub.close();
		}
	});

	it('uses the HTTP status text when the error body is empty', async () => {
		const stub = await stubServer({ status: 502, body: '' });
		try {
			await expect(stub.client.products.get(1)).rejects.toThrow(/HTTP 502/);
		} finally {
			await stub.close();
		}
	});

	it('shortens a long plain-text error body', async () => {
		const stub = await stubServer({
			status: 502,
			body: `Bad gateway ${'y'.repeat(1000)}`,
			contentType: 'text/plain',
		});
		try {
			const error = (await stub.client.products.get(1).catch((e) => e)) as ServerException;
			expect(error.message.startsWith('Bad gateway')).toBe(true);
			expect(error.message.length).toBeLessThanOrEqual(201);
		} finally {
			await stub.close();
		}
	});
});

describe('Webhook verification through the API', () => {
	it('returns false when the API rejects the signature with a 400', async () => {
		const stub = await stubServer(json({ error: 'signature mismatch' }, 400));
		try {
			await expect(stub.client.webhooks.verify({ a: 1 }, 'sha256=bad', '123')).resolves.toBe(
				false
			);
			expect(JSON.parse(stub.received[0].body)).toEqual({
				payload: { a: 1 },
				receivedSignature: 'sha256=bad',
				receivedTimestamp: '123',
			});
		} finally {
			await stub.close();
		}
	});

	it('accepts the raw body as a string, Buffer, Uint8Array or ArrayBuffer', async () => {
		const stub = await stubServer(json({ message: 'webhook verified!' }));
		const raw = '{"b":{},"a":[],"n":-0,"x":1.0}';
		try {
			for (const payload of [
				raw,
				Buffer.from(raw),
				new TextEncoder().encode(raw),
				new TextEncoder().encode(raw).buffer,
			]) {
				await expect(
					stub.client.webhooks.verify(payload, 'sha256=good', '123')
				).resolves.toBe(true);
			}
			for (const recorded of stub.received) {
				// Sent exactly as received: {} stays {}, [] stays [], -0 stays -0.
				expect(recorded.body).toBe(
					'{"payload":{"a":[],"b":{},"n":-0,"x":1},"receivedSignature":"sha256=good","receivedTimestamp":"123"}'
				);
			}
		} finally {
			await stub.close();
		}
	});

	it('returns true when the API accepts the signature', async () => {
		const stub = await stubServer(json({ message: 'valid' }));
		try {
			await expect(stub.client.webhooks.verify({ a: 1 }, 'sha256=good', '123')).resolves.toBe(
				true
			);
		} finally {
			await stub.close();
		}
	});

	it.each([
		[401, UnauthorizedException],
		[403, ForbiddenException],
		[422, ValidationException],
		[500, ServerException],
	])('throws rather than returning false on a %i', async (status, expected) => {
		const stub = await stubServer(json({ error: 'x' }, status));
		try {
			await expect(
				stub.client.webhooks.verify({ a: 1 }, 'sha256=good', '123')
			).rejects.toThrow(expected);
		} finally {
			await stub.close();
		}
	});

	it('throws rather than returning false when the API is unreachable', async () => {
		const client = new QBitFlow({
			apiKey: 'sk_dummy',
			baseUrl: 'http://127.0.0.1:1',
			maxRetries: 0,
		});
		await expect(client.webhooks.verify({ a: 1 }, 'sha256=good', '123')).rejects.toThrow(
			NetworkException
		);
	});

	it('rejects missing arguments, invalid JSON and non-finite numbers client-side', async () => {
		const stub = await stubServer(json({}));
		try {
			for (const [payload, signature] of [
				[{ a: 1 }, ''],
				[null, 'sha256=x'],
				['{not json', 'sha256=x'],
				[Buffer.from('nope'), 'sha256=x'],
				[{ a: NaN }, 'sha256=x'],
				[{ a: Infinity }, 'sha256=x'],
			] as Array<[unknown, string]>) {
				await expect(
					stub.client.webhooks.verify(payload, signature, '123')
				).rejects.toThrow(ValidationException);
			}
			expect(stub.received).toHaveLength(0);
		} finally {
			await stub.close();
		}
	});
});
