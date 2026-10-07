import { TRANSPORT } from '../src/client';
import {
	boolean,
	type DecodeContext,
	integer,
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
import { BadRequestError, isRetryable, ServerError, ValidationError } from '../src/errors';
import { paymentListQuery } from '../src/params';
import { ProductSchema, SubscriptionSchema } from '../src/schemas';
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
		await client.products.getByReference('a/b').catch(() => undefined);
		expect(ts.recorded[0].path).toBe('/product/reference/a%2Fb');
	});
});

describe('query encoding', () => {
	it('encodes times with their offset, sorted, with + escaped', () => {
		const q = paymentListQuery({
			limit: 25,
			cursor: '019c-cursor',
			customerUuid: MEMBER,
			createdAfter: '2026-10-04T12:00:00+02:00',
			createdBefore: new Date(Date.UTC(2026, 9, 5, 0, 0, 0, 500)),
			includeMembers: true,
			refunded: false,
		});
		expect(q).toBe(
			'createdAfter=2026-10-04T12%3A00%3A00%2B02%3A00&createdBefore=2026-10-05T00%3A00%3A00.500Z&cursor=019c-cursor&customerUuid=' +
				MEMBER +
				'&includeMembers=true&limit=25&refunded=false'
		);
		expect(paymentListQuery({})).toBe('');
		expect(paymentListQuery(undefined)).toBe('');
	});

	it('omits unset values and false flags', () => {
		const q = new Query()
			.string('a', '')
			.string('b', undefined)
			.flag('c', false)
			.bool('d', false)
			.int('e', 0)
			.int('f', -1)
			.time('g', undefined);
		expect(q.encode()).toBe('d=false&f=-1');
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
		[{ name: 'Pro', price: Number.NaN }, 'price'],
		[{ price: Number.POSITIVE_INFINITY }, 'price'],
		[{ name: 'Ad\ud800a', email: 'a@b.co' }, 'name'],
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
			await rejection(client.customers.create({ name: 'Ad\ud800a', email: 'a@b.co' }))
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

	it('decodes a null list as empty', () => {
		expect(decodeResponse(list(ProductSchema), res('null'))).toEqual([]);
	});

	it('reports a wrong type through the decode context', () => {
		const ctx: DecodeContext = { fail: (path) => new Error(`bad ${path}`) };
		expect(() => SubscriptionSchema.decode({ frequency: { value: '1' } }, '', ctx)).toThrow(
			'bad frequency.value'
		);
	});
});

describe('status, text and void answers', () => {
	it('handles 202, CSV, deletes and empty bodies', async () => {
		const ts = await testServer((req, res) => {
			if (req.path.endsWith('/force-cancel/sub@019eca82-5680-7b00-8000-0000000000d2')) {
				reply(res, 202, '{"uuid":"sub@1","status":"active"}');
			} else if (req.path === '/accounting/export') {
				if (req.query.includes('2026-01-01')) {
					reply(
						res,
						400,
						'{"error":"\'to\' date cannot be more than 3 months after \'from\' date","code":"bad_request"}'
					);
				} else {
					res.writeHead(200, { 'Content-Type': 'text/csv' });
					res.end('paymentUuid,type\npay@1,payment\n');
				}
			} else if (req.path === '/product/019eca82-5680-7b00-8000-0000000000c1') {
				reply(res, 200, '{"message":"deleted"}');
			} else if (req.path === '/customer/uuid/019eca82-5680-7b00-8000-0000000000c1') {
				res.writeHead(204);
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

		expect(await client.accounting.exportCsv('2026-09-01', '2026-09-30')).toBe(
			'paymentUuid,type\npay@1,payment\n'
		);
		expect(ts.recorded[1].headers.accept).toBe('text/csv, application/json');
		expect(
			await rejection(client.accounting.exportCsv('2026-01-01', '2026-09-30'))
		).toBeInstanceOf(BadRequestError);

		await client.products.delete('019eca82-5680-7b00-8000-0000000000c1');
		await client.customers.delete('019eca82-5680-7b00-8000-0000000000c1');
		await client.webhooks.endpoints.delete('019eca82-5680-7b00-8000-0000000000c1');
		expect(
			await rejection(client.products.get('019eca82-5680-7b00-8000-0000000000c1'))
		).toBeInstanceOf(ServerError);
		expect(client[TRANSPORT]).toBeDefined();
	});
});
