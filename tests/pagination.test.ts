import { ValidationError } from '../src/errors';
import type { Page } from '../src/models/common';
import { iteratePages } from '../src/pagination';
import {
	closeServers,
	collect,
	rejection,
	reply,
	testClient,
	testServer,
	type TestServer,
} from './helpers/server';

afterEach(closeServers);

/** Serves /customer/all in pages of 2 over 5 customers (c0…c4), keyed by cursor. */
function pagedServer(failOn = ''): Promise<TestServer> {
	const pages: Record<string, string> = {
		'': '{"items":[{"uuid":"c0"},{"uuid":"c1"}],"nextCursor":"c1"}',
		c1: '{"items":[{"uuid":"c2"},{"uuid":"c3"}],"nextCursor":"c3"}',
		c3: '{"items":[{"uuid":"c4"}],"nextCursor":null}',
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
		expect(ts.recorded.map((r) => r.query)).toEqual([
			'email=a%40b.co&limit=2',
			'cursor=c1&email=a%40b.co&limit=2',
			'cursor=c3&email=a%40b.co&limit=2',
		]);
	});

	it('start from a cursor, or the first page without params', async () => {
		const ts = await pagedServer();
		const { client } = testClient(ts);
		expect(
			(await collect(client.customers.iterate({ cursor: 'c3' }))).map((c) => c.uuid)
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
		const ts = await pagedServer('c3');
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

	it('stop on an empty page or a cursor that does not move', async () => {
		let calls = 0;
		const got = await collect(
			iteratePages<number>(undefined, async () => {
				calls++;
				const next = `n${calls}`;
				return calls === 2
					? { items: [], nextCursor: next, hasMore: true }
					: { items: [calls], nextCursor: next, hasMore: true };
			})
		);
		expect(got).toEqual([1]);
		expect(calls).toBe(2);

		calls = 0;
		const stuck: Page<number> = { items: [1], nextCursor: 'same', hasMore: true };
		await collect(
			iteratePages<number>('same', async () => {
				calls++;
				return stuck;
			})
		);
		expect(calls).toBe(1);
	});

	it('decode a null page as empty with hasMore', async () => {
		const ts = await testServer((_req, res) =>
			reply(res, 200, '{"items":null,"nextCursor":null}')
		);
		const { client } = testClient(ts);
		const page = await client.customers.list();
		expect(page).toEqual({ items: [], nextCursor: null, hasMore: false });
		const ts2 = await testServer((_req, res) =>
			reply(res, 200, '{"items":[],"nextCursor":"x"}')
		);
		expect((await testClient(ts2).client.customers.list()).hasMore).toBe(true);
	});
});
