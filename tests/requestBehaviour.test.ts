/**
 * Tests for request construction and success-body handling.
 *
 * These run against a throwaway local HTTP server that records what it received, so the
 * real axios path is exercised and the request URL can be asserted.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { QBitFlow } from '../src';
import {
	NetworkException,
	ServerException,
	UnauthorizedException,
	ValidationException,
} from '../src/exceptions';



interface Recorded {
	method: string;
	url: string;
}

interface Stub {
	client: QBitFlow;
	received: Recorded[];
	close: () => Promise<void>;
}

/**
 * A server answering every request with the given status/body, recording what it got.
 *
 * @param status - Status code to answer with
 * @param body - Raw body to answer with
 * @param contentType - Content-Type to declare
 */
const stubServer = async (
	status = 200,
	body = '{}',
	contentType = 'application/json'
): Promise<Stub> => {
	const received: Recorded[] = [];

	const server = http.createServer((req, res) => {
		received.push({ method: req.method ?? '', url: req.url ?? '' });
		// Drain the body so the socket closes cleanly on POST/PUT.
		req.on('data', () => undefined);
		req.on('end', () => {
			res.writeHead(status, { 'Content-Type': contentType });
			res.end(body);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;

	return {
		client: new QBitFlow({ apiKey: 'sk_dummy', baseUrl: `http://127.0.0.1:${port}` }),
		received,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
};

describe('Request construction', () => {
	it('sends the claim test-trigger user id as a path segment, not a query param', async () => {
		// The route is `GET /user/claim/funds/test-trigger/:userID`. Sent as `?userID=`
		// the id never binds, so the call cannot work.
		const stub = await stubServer(200, JSON.stringify({ message: 'ok' }));

		try {
			await stub.client.claims.triggerTestClaimFunds(42);

			expect(stub.received).toHaveLength(1);
			expect(stub.received[0].url).toBe('/user/claim/funds/test-trigger/42');
			expect(stub.received[0].url).not.toContain('?');
		} finally {
			await stub.close();
		}
	});

	it('sends the claim request user id as a path segment', async () => {
		const stub = await stubServer(200, JSON.stringify({ message: 'ok', link: 'https://x' }));

		try {
			await stub.client.claims.getRequestByUser(42);

			expect(stub.received[0].url).toBe('/user/claim/request/42');
		} finally {
			await stub.close();
		}
	});
});

describe('Success body handling', () => {
	it('rejects a 200 whose body is not JSON', async () => {
		// Axios leaves an unparseable body as a raw string. Returning it would hand the
		// caller a string typed as Product, failing later somewhere unrelated.
		const stub = await stubServer(200, '<html><body>Proxy error</body></html>', 'text/html');

		try {
			await expect(stub.client.products.get(1)).rejects.toThrow(ServerException);
			await expect(stub.client.products.get(1)).rejects.toThrow(/could not be parsed/);
			await expect(stub.client.products.get(1)).rejects.toThrow(/Proxy error/);
		} finally {
			await stub.close();
		}
	});

	it('still returns a JSON object body', async () => {
		const product = { id: 1, name: 'Widget', price: 10 };
		const stub = await stubServer(200, JSON.stringify(product));

		try {
			await expect(stub.client.products.get(1)).resolves.toMatchObject(product);
		} finally {
			await stub.close();
		}
	});

	it('still returns a JSON array body', async () => {
		const stub = await stubServer(200, JSON.stringify([{ id: 1 }]));

		try {
			await expect(stub.client.products.getAll()).resolves.toHaveLength(1);
		} finally {
			await stub.close();
		}
	});

	it('passes a text body through when the caller asked for text', async () => {
		// The CSV accounting export opts in via responseType, so a string body is correct
		// there and must not be rejected as unparseable JSON.
		const csv = 'paymentId,type\npay@1,payment\n';
		const stub = await stubServer(200, csv, 'text/csv');

		try {
			const result = await stub.client.accounting.export('2026-01-01', '2026-01-31', 'csv');

			expect(result).toBe(csv);
		} finally {
			await stub.close();
		}
	});

	it('treats an empty body as an empty result rather than an error', async () => {
		const stub = await stubServer(200, '');

		try {
			await expect(stub.client.products.get(1)).resolves.toBe('');
		} finally {
			await stub.close();
		}
	});
});

describe('Declared types match the wire format', () => {
	// NOTE: this documents the contract but cannot enforce it. The wire value is always a
	// string (the SDK does no hydration), so re-declaring the field as `Date` would not
	// fail this assertion — only a type check would, and nothing type-checks `tests/`:
	// `tsconfig.json` excludes it and ts-jest is not running diagnostics. Until that gap
	// is closed, the `string` declarations are guarded by review only.
	it('returns timestamps as RFC3339 strings', async () => {
		const user = {
			id: 1,
			name: 'Test',
			lastName: 'User',
			email: 't@example.com',
			createdAt: '2026-09-21T22:02:09.986381+02:00',
			updatedAt: '2026-09-21T22:02:09.986381+02:00',
			claimedAt: null,
			role: 'user',
			organizationFeeBps: 0,
		};
		const stub = await stubServer(200, JSON.stringify(user));

		try {
			const result = await stub.client.users.getById(1);

			expect(typeof result.createdAt).toBe('string');
			expect(typeof result.updatedAt).toBe('string');
			expect(result.createdAt).toBe('2026-09-21T22:02:09.986381+02:00');
		} finally {
			await stub.close();
		}
	});
});

describe('Webhook verification', () => {
	it('returns false when the API rejects the signature with a 400', async () => {
		const stub = await stubServer(400, JSON.stringify({ error: 'invalid signature' }));

		try {
			await expect(stub.client.webhooks.verify({ a: 1 }, 'sha256=bad', '123')).resolves.toBe(
				false
			);
		} finally {
			await stub.close();
		}
	});

	it('returns true when the API accepts the signature', async () => {
		const stub = await stubServer(200, JSON.stringify({ message: 'valid' }));

		try {
			await expect(stub.client.webhooks.verify({ a: 1 }, 'sha256=good', '123')).resolves.toBe(
				true
			);
		} finally {
			await stub.close();
		}
	});

	it('throws rather than returning false when the API key is rejected', async () => {
		// Reporting this as "not verified" would make a credentials problem look like a
		// forged webhook, and a handler that drops unverified events would discard real
		// payments.
		const stub = await stubServer(401, JSON.stringify({ error: 'invalid token' }));

		try {
			await expect(
				stub.client.webhooks.verify({ a: 1 }, 'sha256=good', '123')
			).rejects.toThrow(UnauthorizedException);
		} finally {
			await stub.close();
		}
	});

	// Needs a raised timeout: a 5xx is retried 3 times with a 1s/2s/3s linear backoff,
	// so this takes ~6s. `maxRetries: 0` would not help — the constructor coalesces it
	// with `||`, so 0 falls back to the default of 3.
	it('throws rather than returning false when the API is failing', async () => {
		const stub = await stubServer(500, JSON.stringify({ error: 'boom' }));

		try {
			await expect(
				stub.client.webhooks.verify({ a: 1 }, 'sha256=good', '123')
			).rejects.toThrow(ServerException);
		} finally {
			await stub.close();
		}
	}, 20000);

	it('throws rather than returning false when the API is unreachable', async () => {
		// An outage must not be indistinguishable from a rejected signature.
		const client = new QBitFlow({
			apiKey: 'sk_dummy',
			// Reserved TEST-NET-1 address; nothing listens here.
			baseUrl: 'http://127.0.0.1:1',
			maxRetries: 1,
		});

		await expect(client.webhooks.verify({ a: 1 }, 'sha256=good', '123')).rejects.toThrow(
			NetworkException
		);
	}, 20000);

	it('exposes the signature rejection as a ValidationException to other callers', async () => {
		// Sanity check that 400 really maps to ValidationException, which is what
		// `verify` keys its false return on.
		const stub = await stubServer(400, JSON.stringify({ error: 'nope' }));

		try {
			await expect(stub.client.products.get(1)).rejects.toThrow(ValidationException);
		} finally {
			await stub.close();
		}
	});
});
