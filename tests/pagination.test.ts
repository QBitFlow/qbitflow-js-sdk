import { ServerError, ValidationError } from '../src/errors';
import type { Page } from '../src/models/common';
import { iteratePages } from '../src/pagination';
import { CustomerSchema, page } from '../src/schemas';
import { decodeResponse } from '../src/transport';
import {
	closeServers,
	collect,
	rejection,
	reply,
	testClient,
	testServer,
	type TestServer,
	thrown,
} from './helpers/server';

afterEach(closeServers);

/**
 * Serves /customers in pages of 2 over 5 customers (c0…c4), keyed by an opaque cursor; the last
 * page answers `hasMore: false` (a full last page never adds an empty one).
 */
function pagedServer(failOn = ''): Promise<TestServer> {
	const pages: Record<string, string> = {
		'': '{"items":[{"uuid":"c0"},{"uuid":"c1"}],"hasMore":true,"nextCursor":"djF8YzE"}',
		djF8YzE: '{"items":[{"uuid":"c2"},{"uuid":"c3"}],"hasMore":true,"nextCursor":"djF8YzM"}',
		djF8YzM: '{"items":[{"uuid":"c4"}],"hasMore":false}',
	};
	return testServer((req, res) => {
		const cursor = new URLSearchParams(req.query).get('cursor') ?? '';
		if (failOn !== '' && cursor === failOn) {
			reply(
				res,
				400,
				'{"error":"bad cursor","code":"validation_failed","details":{"errors":[{"field":"cursor","message":"cursor is unknown"}]}}'
			);
			return;
		}
		reply(res, 200, pages[cursor]);
	});
}

describe('iterators', () => {
	it('walk every page, keeping the filters and the page size', async () => {
		const ts = await pagedServer();
		const { client } = testClient(ts);
		const got = await collect(client.customers.iterate({ limit: 2, email: 'a@b.co' }));
		expect(got.map((c) => c.uuid)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
		expect(ts.recorded.map((r) => `${r.path}?${r.query}`)).toEqual([
			'/customers?email=a%40b.co&limit=2',
			'/customers?cursor=djF8YzE&email=a%40b.co&limit=2',
			'/customers?cursor=djF8YzM&email=a%40b.co&limit=2',
		]);
	});

	it('start from a cursor, or the first page without params', async () => {
		const ts = await pagedServer();
		const { client } = testClient(ts);
		expect(
			(await collect(client.customers.iterate({ cursor: 'djF8YzM' }))).map((c) => c.uuid)
		).toEqual(['c4']);
		expect(ts.recorded).toHaveLength(1);
		expect(await collect(client.customers.iterate())).toHaveLength(5);
	});

	it('are lazy: an early break stops the requests', async () => {
		const ts = await pagedServer();
		const { client } = testClient(ts);
		const got: string[] = [];
		for await (const c of client.customers.iterate()) {
			got.push(c.uuid);
			if (c.uuid === 'c2') break;
		}
		expect(got).toEqual(['c0', 'c1', 'c2']);
		expect(ts.recorded).toHaveLength(2);
	});

	it('throw a page error after the items before it', async () => {
		const ts = await pagedServer('djF8YzM');
		const { client } = testClient(ts);
		const got: string[] = [];
		const err = (await rejection(
			(async () => {
				for await (const c of client.customers.iterate()) got.push(c.uuid);
			})()
		)) as ValidationError;
		expect(got).toEqual(['c0', 'c1', 'c2', 'c3']);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe('cursor');
	});
});

describe('the stop rules', () => {
	/** Walks `pages` (called with the 1-based call number) and returns the items and the calls. */
	async function walk(
		next: (call: number) => Page<number>,
		cursor?: string
	): Promise<{ got: number[]; calls: number }> {
		let calls = 0;
		const got = await collect(
			iteratePages<number>(cursor, async () => {
				calls++;
				if (calls > 10) throw new Error('the walk does not stop');
				return next(calls);
			})
		);
		return { got, calls };
	}

	it('stop after the page whose hasMore is false', async () => {
		const pages: Array<Page<number>> = [
			{ items: [1], hasMore: true, nextCursor: 'a' },
			{ items: [2], hasMore: true, nextCursor: 'b' },
			{ items: [3], hasMore: false },
		];
		expect(await walk((n) => pages[n - 1])).toEqual({ got: [1, 2, 3], calls: 3 });
	});

	it('hasMore false stops even with a cursor present (the API never sends one then)', async () => {
		expect(await walk(() => ({ items: [1], hasMore: false, nextCursor: 'x' }))).toEqual({
			got: [1],
			calls: 1,
		});
	});

	it('hasMore true without a nextCursor: a defensive stop', async () => {
		expect(await walk(() => ({ items: [1], hasMore: true }))).toEqual({ got: [1], calls: 1 });
	});

	it('an empty page that claims more, cursors alternating: a defensive stop', async () => {
		const r = await walk((n) => ({ items: [], hasMore: true, nextCursor: ['a', 'b'][n % 2] }));
		expect(r).toEqual({ got: [], calls: 1 });
	});

	it('a cursor that does not move: a defensive stop', async () => {
		expect(
			await walk(() => ({ items: [1], hasMore: true, nextCursor: 'same' }), 'same')
		).toEqual({ got: [1], calls: 1 });
		// The first page's cursor equal to the next one ('' never moves either).
		expect(await walk(() => ({ items: [1], hasMore: true, nextCursor: '' }))).toEqual({
			got: [1],
			calls: 1,
		});
	});
});

describe('page decoding', () => {
	const decodePage = (body: string): Page<unknown> =>
		decodeResponse(page(CustomerSchema), { status: 200, headers: new Headers(), body });

	it('a page that has more, and a last page', () => {
		const p = decodePage('{"items":[{"uuid":"c0"}],"hasMore":true,"nextCursor":"djF8eA"}');
		expect([p.hasMore, p.nextCursor, p.items.length]).toEqual([true, 'djF8eA', 1]);
		const last = decodePage('{"items":[],"hasMore":false}');
		expect(last).toEqual({ items: [], hasMore: false });
		expect('nextCursor' in last).toBe(false);
	});

	it('lenient on absence and null: an empty page', () => {
		expect(decodePage('{"items":null}')).toEqual({ items: [], hasMore: false });
		expect(decodePage('{}')).toEqual({ items: [], hasMore: false });
	});

	it.each([
		'{"items":[],"hasMore":"true"}',
		'{"items":{},"hasMore":false}',
		'{"items":[],"nextCursor":5}',
		'[]',
		'null',
	])('strict on type: %s is a ServerError', (body) => {
		expect(thrown(() => decodePage(body))).toBeInstanceOf(ServerError);
	});
});

describe('bounded lists', () => {
	it('are returned as their items', async () => {
		const ts = await testServer((_req, res) =>
			reply(
				res,
				200,
				'{"items":[{"id":8,"code":"BASE:USDC"},{"id":1,"code":"ETH"}],"hasMore":false}'
			)
		);
		const list = await testClient(ts).client.currencies.list({ main: true });
		expect(list.map((c) => c.code)).toEqual(['BASE:USDC', 'ETH']);
		expect(ts.recorded[0].query).toBe('main=true');

		const empty = await testServer((_req, res) =>
			reply(res, 200, '{"items":[],"hasMore":false}')
		);
		expect(await testClient(empty).client.wallets.list()).toEqual([]);
	});

	it('follow a nextCursor that claims more, the query kept, under the guards', async () => {
		const ts = await testServer((req, res) => {
			const cursor = new URLSearchParams(req.query).get('cursor');
			if (cursor === null)
				reply(res, 200, '{"items":[{"id":8}],"hasMore":true,"nextCursor":"djF8Mg"}');
			else if (cursor === 'djF8Mg')
				reply(res, 200, '{"items":[{"id":9}],"hasMore":true,"nextCursor":"djF8Mg"}');
			else reply(res, 500, '{}');
		});
		const list = await testClient(ts).client.currencies.list({ test: true });
		// The second page's cursor did not move: the walk stops there.
		expect(list.map((c) => c.id)).toEqual([8, 9]);
		expect(ts.recorded.map((r) => r.query)).toEqual(['test=true', 'cursor=djF8Mg&test=true']);
	});

	it('a bare JSON array is a ServerError (bounded lists are pages too)', async () => {
		const ts = await testServer((_req, res) => reply(res, 200, '[{"id":8}]'));
		expect(await rejection(testClient(ts).client.currencies.list())).toBeInstanceOf(
			ServerError
		);
	});
});
