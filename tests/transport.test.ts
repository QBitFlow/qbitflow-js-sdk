import { TRANSPORT } from '../src/client';
import {
	boolean,
	type DecodeContext,
	integer,
	type Schema,
	list,
	nullable,
	number,
	object,
	optional,
	string,
	timestamp,
	unsigned,
	ZERO_TIME,
} from '../src/decode';
import { encodeBody, pathSegment, Query } from '../src/encode';
import { isRetryable, ServerError, ValidationError } from '../src/errors';
import * as P from '../src/params';
import { paymentListQuery } from '../src/params';
import { page, ProductSchema, SubscriptionSchema } from '../src/schemas';
import { decodeResponse, type RawResponse } from '../src/transport';
import {
	closeServers,
	rejection,
	reply,
	staticReply,
	testClient,
	testServer,
	thrown,
} from './helpers/server';

const MEMBER = '019eca82-5680-7b00-8000-0000000000b1';

afterEach(closeServers);

describe('path escaping', () => {
	it.each([
		['a/b c', 'a%2Fb%20c'],
		['pay@019c-1', 'pay@019c-1'],
		['a+b@example.com', 'a+b@example.com'],
		['v1..2', 'v1..2'],
		['?q=1#f', '%3Fq=1%23f'],
		['%41', '%2541'],
		['ord:1', 'ord:1'],
		['Zoë', 'Zo%C3%AB'],
	])('%j → %j', (segment, want) => {
		expect(pathSegment('reference', segment)).toBe(want);
	});

	it.each(['.', '..'])('refuses the dot segment %j (fetch would resolve it)', (segment) => {
		const err = thrown(() => pathSegment('reference', segment)) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe('reference');
	});

	it('reaches the server as is (a / is never a separator)', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		const { client } = testClient(ts);
		await client.webhooks.events.get('evt_a/b c').catch(() => undefined);
		expect(ts.recorded[0].path).toBe('/webhooks/events/evt_a%2Fb%20c');
	});

	it('sends a getByReference as its list filter, escaped in the query', async () => {
		const ts = await testServer(staticReply(200, '{"items":[],"hasMore":false}'));
		const { client } = testClient(ts);
		await client.products.getByReference('ord:1@shop.x').catch(() => undefined);
		expect(ts.recorded[0].path).toBe('/products');
		expect(ts.recorded[0].query).toBe('reference=ord%3A1%40shop.x');
	});
});

describe('query encoding', () => {
	it('encodes times with their offset, sorted, with + escaped', () => {
		const q = paymentListQuery({
			limit: 25,
			cursor: 'djF8Y3Vyc29y',
			customerUuid: MEMBER,
			createdAfter: '2026-10-04T12:00:00+02:00',
			createdBefore: new Date(Date.UTC(2026, 9, 5, 0, 0, 0, 500)),
			includeMembers: true,
			reference: 'order-1042',
			refunded: false,
		});
		expect(q).toBe(
			'createdAfter=2026-10-04T12%3A00%3A00%2B02%3A00&createdBefore=2026-10-05T00%3A00%3A00.500Z&cursor=djF8Y3Vyc29y&customerUuid=' +
				MEMBER +
				'&includeMembers=true&limit=25&reference=order-1042&refunded=false'
		);
		expect(paymentListQuery({})).toBe('');
		expect(paymentListQuery(undefined)).toBe('');
	});

	it('omits unset values and false flags; sends a given 0', () => {
		const q = new Query()
			.string('a', '')
			.string('b', undefined)
			.flag('c', false)
			.bool('d', false)
			.int('e', 0)
			.int('f', -1)
			.int('h', undefined)
			.time('g', undefined);
		expect(q.encode()).toBe('d=false&e=0&f=-1');
		// limit is sent as given, 0 included (the server treats 0 or less as its default).
		expect(new Query().page(0, '').encode()).toBe('limit=0');
		expect(new Query().page(undefined, undefined).encode()).toBe('');
	});

	it('repeats a key, keeping its values in order, keys sorted', () => {
		const q = new Query()
			.add('status', 'pending')
			.set('limit', '5')
			.add('status', 'cancelled')
			.add('a', 'x');
		expect(q.encode()).toBe('a=x&limit=5&status=pending&status=cancelled');
		expect(new Query().add('k', '1').set('k', '2').encode()).toBe('k=2');
	});

	it.each<[string, string, string]>([
		[
			'products',
			P.productListQuery({ limit: 50, cursor: 'c', reference: 'pro' }),
			'cursor=c&limit=50&reference=pro',
		],
		['customers', P.customerListQuery({ reference: 'crm:1' }), 'reference=crm%3A1'],
		[
			'transactions',
			P.transactionListQuery({
				type: 'bill',
				subscriptionUuid: `sub@${MEMBER}`,
				refunded: true,
			}),
			`refunded=true&subscriptionUuid=sub%40${MEMBER}&type=bill`,
		],
		[
			'refunds held',
			P.refundListQuery({ includeMembers: false, held: true }),
			'held=true&includeMembers=false',
		],
		[
			'refunds member',
			P.refundListQuery({ limit: 3, cursor: 'c', userUuid: MEMBER }),
			`cursor=c&limit=3&userUuid=${MEMBER}`,
		],
		[
			'refunds statuses',
			P.refundListQuery({ status: ['approved', 'rejected'], txUuid: `pay@${MEMBER}` }),
			`status=approved&status=rejected&txUuid=pay%40${MEMBER}`,
		],
		[
			'events',
			P.eventListQuery({
				cursor: 'djF8ZXZ0',
				type: 'payment.completed',
				includeMembers: true,
			}),
			'cursor=djF8ZXZ0&includeMembers=true&type=payment.completed',
		],
		['endpoints', P.pageQuery({ limit: 10, cursor: 'c' }), 'cursor=c&limit=10'],
		[
			'accepted currencies',
			P.acceptedCurrenciesQuery({ userUuid: MEMBER }),
			`userUuid=${MEMBER}`,
		],
		['currencies', P.currencyListQuery({ main: true }), 'main=true'],
		['currencies test', P.currencyListQuery({ test: true, main: false }), 'test=true'],
		['wallets', P.walletListQuery({ withBalances: true }), 'withBalances=true'],
		['cancel', P.cancelSubscriptionQuery({ immediate: false }), 'immediate=false'],
		['read', P.readQuery({ includeMembers: true }), 'includeMembers=true'],
	])('encodes %s', (_name, got, want) => {
		expect(got).toBe(want);
	});

	it('refuses an invalid instant', () => {
		for (const bad of ['yesterday', '2026-10-04 12:00:00', new Date(Number.NaN)]) {
			const err = thrown(() => paymentListQuery({ createdAfter: bad })) as ValidationError;
			expect(err.fieldErrors[0].field).toBe('createdAfter');
		}
	});
});

describe('body encoding', () => {
	it.each([
		[{ name: 'Pro', n: Number.NaN }, 'n'],
		[{ n: Number.POSITIVE_INFINITY }, 'n'],
		[{ firstName: 'Ad\ud800a', email: 'a@b.co' }, 'firstName'],
		[{ metadata: { k: 'v\ud800' } }, 'metadata.k'],
		[{ address: 'bad \udfff' }, 'address'],
		[{ frequency: { value: 1, unit: 'mon\ud800ths' } }, 'frequency.unit'],
		[{ ['bad\ud800key']: 1 }, 'body'],
		[{ events: ['payment.completed', 'x\ud800'] }, 'events[1]'],
		[{ n: BigInt(1) }, 'n'],
	])('refuses %p', (body, field) => {
		const err = thrown(() => encodeBody(body)) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe(field);
	});

	it('sends nothing for an unencodable body', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		const { client } = testClient(ts);
		expect(
			await rejection(client.customers.create({ firstName: 'Ad\ud800a', email: 'a@b.co' }))
		).toBeInstanceOf(ValidationError);
		expect(ts.recorded).toHaveLength(0);
	});

	it('sends valid Unicode untouched, U+FFFD included', () => {
		expect(encodeBody({ name: 'O’Brien ☃ �' })).toBe('{"name":"O’Brien ☃ �"}');
	});
});

describe('decoding policy', () => {
	interface Target {
		s: string;
		n: number;
		u: number;
		f: number;
		b: boolean;
		t: string;
		p: string | null;
		o?: string;
		l: number[];
		obj: { x: number };
		e: string;
		dec: string;
	}
	const schema = object<Target>({
		s: string,
		n: integer,
		u: unsigned,
		f: number,
		b: boolean,
		t: timestamp,
		p: nullable(timestamp),
		o: optional(string),
		l: list(integer),
		obj: object<{ x: number }>({ x: integer }),
		e: string,
		dec: string,
	});
	const res = (body: string, status = 200): RawResponse => ({
		status,
		headers: new Headers({ 'X-Request-Id': 'rid' }),
		body,
	});

	it('fills zero values for absent and null fields', () => {
		for (const body of [
			'{}',
			'{"s":null,"n":null,"f":null,"b":null,"t":null,"p":null,"o":null,"l":null,"obj":null}',
		]) {
			const v = decodeResponse(schema, res(body));
			expect(v).toEqual({
				s: '',
				n: 0,
				u: 0,
				f: 0,
				b: false,
				t: ZERO_TIME,
				p: null,
				l: [],
				obj: { x: 0 },
				e: '',
				dec: '',
			});
			expect('o' in v).toBe(false);
		}
	});

	it('keeps unknown keys, unknown enums and decimal strings', () => {
		const v = decodeResponse(
			schema,
			res('{"zzz":{"a":[1]},"s":"x","e":"hibernating","dec":"-10004200.000001"}')
		);
		expect(v.s).toBe('x');
		expect(v.e).toBe('hibernating');
		expect(v.dec).toBe('-10004200.000001');
		expect((v as unknown as Record<string, unknown>).zzz).toEqual({ a: [1] });
	});

	it('widens numbers and keeps timestamps as sent', () => {
		const v = decodeResponse(
			schema,
			res('{"f":3,"n":2.0,"u":1e3,"t":"2026-09-13T21:23:26.620071+02:00"}')
		);
		expect([v.f, v.n, v.u]).toEqual([3, 2, 1000]);
		expect(v.t).toBe('2026-09-13T21:23:26.620071+02:00');
	});

	it.each([
		['empty body', ''],
		['blank body', '  \n'],
		['html', '<html>ok</html>'],
		['string for int', '{"n":"5"}'],
		['number for string', '{"s":5}'],
		['bool for string', '{"s":true}'],
		['object for list', '{"l":{}}'],
		['number for time', '{"t":5}'],
		['bad time', '{"t":"yesterday"}'],
		['fractional into int', '{"n":2.5}'],
		['negative into unsigned', '{"u":-1}'],
		['array for object', '[1]'],
		['truncated', '{"s":"x"'],
		['null for an object', 'null'],
	])('%s is a ServerError with the status', (_name, body) => {
		const err = thrown(() => decodeResponse(schema, res(body, 201))) as ServerError;
		expect(err).toBeInstanceOf(ServerError);
		expect(err.status).toBe(201);
		expect(err.requestId).toBe('rid');
		expect(isRetryable(err)).toBe(false);
	});

	it('a null body is a ServerError for every schema (lists are pages)', () => {
		const schemas: Array<Schema<unknown>> = [
			ProductSchema,
			page(ProductSchema),
			list(ProductSchema),
		];
		for (const s of schemas) {
			const err = thrown(() => decodeResponse(s, res('null'))) as ServerError;
			expect(err).toBeInstanceOf(ServerError);
			expect(err.message).toContain('null where an object was expected');
		}
	});

	it('decodes a page: absent items are empty, nextCursor present iff hasMore', () => {
		expect(decodeResponse(page(ProductSchema), res('{"items":null,"hasMore":false}'))).toEqual({
			items: [],
			hasMore: false,
		});
		const p = decodeResponse(
			page(ProductSchema),
			res('{"items":[{"uuid":"p-1","priceUsd":"9.99"}],"hasMore":true,"nextCursor":"djF8"}')
		);
		expect([p.items[0].priceUsd, p.hasMore, p.nextCursor]).toEqual(['9.99', true, 'djF8']);
		// A bare array is no page.
		expect(thrown(() => decodeResponse(page(ProductSchema), res('[]')))).toBeInstanceOf(
			ServerError
		);
	});

	it('a JSON number where a decimal string is expected is a ServerError', () => {
		expect(
			thrown(() => decodeResponse(ProductSchema, res('{"priceUsd":9.99}')))
		).toBeInstanceOf(ServerError);
		expect(
			thrown(() => decodeResponse(ProductSchema, res('{"metadata":{"n":1}}')))
		).toBeInstanceOf(ServerError);
	});

	it('reports a wrong type through the decode context', () => {
		const ctx: DecodeContext = { fail: (path) => new Error(`bad ${path}`) };
		expect(() => SubscriptionSchema.decode({ frequency: { value: '1' } }, '', ctx)).toThrow(
			'bad frequency.value'
		);
	});
});

describe('status, text and void answers', () => {
	it('handles 202, CSV, 204 deletes and empty bodies', async () => {
		const ts = await testServer((req, res) => {
			if (req.path === '/subscriptions/sub@019eca82-5680-7b00-8000-0000000000d2/cancel') {
				reply(res, 202, '{"uuid":"sub@1","status":"active"}');
			} else if (req.path === '/accounting/export') {
				if (req.query.includes('2026-01-01')) {
					reply(
						res,
						400,
						'{"error":"validation failed","code":"validation_failed","details":{"max":92,' +
							'"errors":[{"field":"to","message":"to must be at most 92 days after from, both included"}]}}'
					);
				} else {
					res.writeHead(200, { 'Content-Type': 'text/csv' });
					res.end('txTimeUtc,type,txUuid\n2026-09-01T12:00:00Z,payment,pay@1\n');
				}
			} else if (req.method === 'DELETE') {
				res.writeHead(204); // every DELETE: no body
				res.end();
			} else {
				res.writeHead(200);
				res.end();
			}
		});
		const { client } = testClient(ts);
		const cancel = await client.subscriptions.cancel(
			'sub@019eca82-5680-7b00-8000-0000000000d2'
		);
		expect(cancel.pending).toBe(true);
		expect(cancel.subscription.uuid).toBe('sub@1');
		expect(ts.recorded[0].method).toBe('POST');

		expect(await client.accounting.exportCsv('2026-09-01', '2026-09-30')).toBe(
			'txTimeUtc,type,txUuid\n2026-09-01T12:00:00Z,payment,pay@1\n'
		);
		expect(ts.recorded[1].headers.accept).toBe('text/csv, application/json');
		// The CSV export's errors are JSON, typed as usual (the 92-day window is the API's).
		const csvErr = (await rejection(
			client.accounting.exportCsv('2026-01-01', '2026-09-30')
		)) as ValidationError;
		expect(csvErr).toBeInstanceOf(ValidationError);
		expect(csvErr.fieldErrors[0].field).toBe('to');
		expect(csvErr.details.max).toBe(92);

		const uuid = '019eca82-5680-7b00-8000-0000000000c1';
		expect(await client.products.delete(uuid)).toBeUndefined();
		expect(await client.customers.delete(uuid)).toBeUndefined();
		expect(await client.webhooks.endpoints.delete(uuid)).toBeUndefined();
		expect(await client.members.remove(uuid)).toBeUndefined();
		expect(await client.invitations.revoke(uuid)).toBeUndefined();
		expect(ts.recorded.slice(3).map((r) => `${r.method} ${r.path}`)).toEqual([
			`DELETE /products/${uuid}`,
			`DELETE /customers/${uuid}`,
			`DELETE /webhooks/endpoints/${uuid}`,
			`DELETE /members/${uuid}`,
			`DELETE /invitations/${uuid}`,
		]);
		// A 2xx without the JSON a model needs is a ServerError.
		expect(await rejection(client.products.get(uuid))).toBeInstanceOf(ServerError);
		expect(client[TRANSPORT]).toBeDefined();
	});

	it('sends updates as PATCH', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		const { client } = testClient(ts);
		const uuid = '019eca82-5680-7b00-8000-0000000000c1';
		await client.products.update(uuid, { name: 'Pro plan' });
		await client.customers.update(uuid, { lastName: '' });
		await client.subscriptions.update(`sub@${uuid}`, { metadata: { plan: 'pro' } });
		await client.members.update(MEMBER, { organizationFeePercent: '5' });
		await client.webhooks.endpoints.update(uuid, { enabled: false });
		expect(ts.recorded.map((r) => `${r.method} ${r.path} ${r.body}`)).toEqual([
			`PATCH /products/${uuid} {"name":"Pro plan"}`,
			`PATCH /customers/${uuid} {"lastName":""}`,
			`PATCH /subscriptions/sub@${uuid} {"metadata":{"plan":"pro"}}`,
			`PATCH /members/${MEMBER} {"organizationFeePercent":"5"}`,
			`PATCH /webhooks/endpoints/${uuid} {"enabled":false}`,
		]);
	});
});
