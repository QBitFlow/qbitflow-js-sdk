/**
 * Retry policy: only GET is retried, only on network errors and 5xx, with exponential
 * back-off; POST/PUT/DELETE and the two action GETs (force-cancel, execute-billing) are sent
 * exactly once. Uses a throwaway HTTP server that counts requests.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { QBitFlow } from '../src';
import { NetworkException, RateLimitException, ServerException } from '../src/exceptions';
import { isRetriableTransportError } from '../src/requests/Transport';

interface Stub {
	client: QBitFlow;
	hits: () => number;
	close: () => Promise<void>;
}

const stubServer = async (
	status: number,
	body = '{"error":"boom"}',
	maxRetries = 1,
	headers: Record<string, string> = {}
): Promise<Stub> => {
	let count = 0;
	const server = http.createServer((req, res) => {
		count++;
		req.on('data', () => undefined);
		req.on('end', () => {
			res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
			res.end(body);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return {
		client: new QBitFlow({
			apiKey: 'sk_dummy',
			baseUrl: `http://127.0.0.1:${port}/`,
			maxRetries,
		}),
		hits: () => count,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
};

describe('Retry policy', () => {
	it('retries a GET on 5xx up to maxRetries with back-off, then throws ServerException', async () => {
		const stub = await stubServer(503, '{"error":"unavailable"}', 1);
		try {
			const started = Date.now();
			await expect(stub.client.products.getAll()).rejects.toThrow(ServerException);
			expect(stub.hits()).toBe(2); // 1 attempt + 1 retry
			expect(Date.now() - started).toBeGreaterThanOrEqual(900); // 1s * 2^0
		} finally {
			await stub.close();
		}
	}, 10000);

	it('never retries a POST, even on 5xx', async () => {
		const stub = await stubServer(502, '{"error":"bad gateway"}', 3);
		try {
			await expect(
				stub.client.customers.create({ name: 'John', lastName: 'Doe', email: 'j@d.com' })
			).rejects.toThrow(ServerException);
			expect(stub.hits()).toBe(1);
		} finally {
			await stub.close();
		}
	});

	it('never retries a PUT or a DELETE', async () => {
		const stub = await stubServer(500, '{"error":"boom"}', 3);
		try {
			await expect(stub.client.products.update(1, { price: 2 })).rejects.toThrow(
				ServerException
			);
			await expect(stub.client.products.delete(1)).rejects.toThrow(ServerException);
			expect(stub.hits()).toBe(2);
		} finally {
			await stub.close();
		}
	});

	it('never retries the action GETs force-cancel and execute-billing', async () => {
		const stub = await stubServer(500, '{"error":"boom"}', 3);
		try {
			await expect(stub.client.subscriptions.forceCancel('sub@1')).rejects.toThrow(
				ServerException
			);
			await expect(stub.client.subscriptions.executeTestBilling('sub@1')).rejects.toThrow(
				ServerException
			);
			await expect(stub.client.claims.triggerTestClaimFunds(7)).rejects.toThrow(
				ServerException
			);
			expect(stub.hits()).toBe(3);
		} finally {
			await stub.close();
		}
	});

	it('does not retry 4xx or 429', async () => {
		const notFound = await stubServer(404, '{"error":"resource not found"}', 3);
		const limited = await stubServer(429, '{"error":"slow down"}', 3, { 'Retry-After': '7' });
		try {
			await expect(notFound.client.products.getAll()).rejects.toThrow();
			expect(notFound.hits()).toBe(1);
			await expect(limited.client.products.getAll()).rejects.toThrow(RateLimitException);
			expect(limited.hits()).toBe(1);
		} finally {
			await notFound.close();
			await limited.close();
		}
	});

	it('does not retry a 3xx and reports it as a misconfigured base URL', async () => {
		const stub = await stubServer(302, '', 3, { Location: 'https://elsewhere.example/' });
		try {
			await expect(stub.client.products.getAll()).rejects.toThrow(ServerException);
			await expect(stub.client.products.getAll()).rejects.toThrow(/redirect \(302\)/);
			expect(stub.hits()).toBe(2); // two calls, one request each
		} finally {
			await stub.close();
		}
	});

	it('never follows a redirect to a real Location (the API key is not forwarded)', async () => {
		const target = await stubServer(200, '[]', 0);
		const redirecting = await stubServer(307, '', 3, {
			Location: `${target.client.getBaseUrl()}/product/`,
		});
		try {
			const error = (await redirecting.client.products
				.getAll()
				.catch((e) => e)) as ServerException;
			expect(error).toBeInstanceOf(ServerException);
			expect(error.statusCode).toBe(307);
			expect(error.message).toContain(target.client.getBaseUrl());
			expect(redirecting.hits()).toBe(1);
			expect(target.hits()).toBe(0);
		} finally {
			await redirecting.close();
			await target.close();
		}
	});

	it('honours maxRetries: 0 (a single attempt)', async () => {
		const stub = await stubServer(500, '{"error":"boom"}', 0);
		try {
			await expect(stub.client.products.getAll()).rejects.toThrow(ServerException);
			expect(stub.hits()).toBe(1);
		} finally {
			await stub.close();
		}
	});

	it('retries a GET on a network error, then throws NetworkException', async () => {
		// Nothing listens on port 1; every attempt is refused immediately.
		const client = new QBitFlow({
			apiKey: 'sk_dummy',
			baseUrl: 'http://127.0.0.1:1',
			maxRetries: 1,
		});
		const started = Date.now();
		await expect(client.products.getAll()).rejects.toThrow(NetworkException);
		expect(Date.now() - started).toBeGreaterThanOrEqual(900);
	}, 10000);

	it('classifies transport failures as retriable and configuration errors as not', () => {
		for (const code of [
			'ECONNREFUSED',
			'ECONNRESET',
			'ETIMEDOUT',
			'ECONNABORTED',
			'ENOTFOUND',
			'ERR_NETWORK',
		]) {
			expect(isRetriableTransportError({ code })).toBe(true);
		}
		expect(isRetriableTransportError(new Error('socket hang up'))).toBe(true);
		for (const code of [
			'ERR_INVALID_URL',
			'ERR_BAD_OPTION_VALUE',
			'ERR_BAD_OPTION',
			'ERR_BAD_REQUEST',
			'ERR_NOT_SUPPORT',
			'ERR_CANCELED',
		]) {
			expect(isRetriableTransportError({ code })).toBe(false);
		}
	});

	it('does not retry a POST on a network error', async () => {
		const client = new QBitFlow({
			apiKey: 'sk_dummy',
			baseUrl: 'http://127.0.0.1:1',
			maxRetries: 3,
		});
		const started = Date.now();
		await expect(
			client.customers.create({ name: 'John', lastName: 'Doe', email: 'j@d.com' })
		).rejects.toThrow(NetworkException);
		expect(Date.now() - started).toBeLessThan(900); // no back-off happened
	});
});
