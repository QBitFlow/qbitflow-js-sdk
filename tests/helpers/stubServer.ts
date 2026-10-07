/**
 * A throwaway local HTTP server for offline tests: it records every request it receives and
 * answers with whatever the route function returns, so the real axios path is exercised.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { QBitFlow } from '../../src';
import type { QBitFlowConfig } from '../../src/types';

export interface Recorded {
	method: string;
	url: string;
	headers: http.IncomingHttpHeaders;
	body: string;
}

export interface Reply {
	status?: number;
	body?: string;
	contentType?: string;
	headers?: Record<string, string>;
}

export interface Stub {
	client: QBitFlow;
	baseUrl: string;
	received: Recorded[];
	close: () => Promise<void>;
}

/**
 * Start a stub server.
 *
 * @param route - The reply for each request (a fixed reply, or a function of the request)
 * @param clientOptions - Extra client configuration (retries are disabled by default)
 */
export async function stubServer(
	route: Reply | ((req: Recorded) => Reply),
	clientOptions: Partial<QBitFlowConfig> = {}
): Promise<Stub> {
	const received: Recorded[] = [];

	const server = http.createServer((req, res) => {
		let data = '';
		req.on('data', (chunk) => (data += chunk));
		req.on('end', () => {
			const recorded: Recorded = {
				method: req.method ?? '',
				url: req.url ?? '',
				headers: req.headers,
				body: data,
			};
			received.push(recorded);
			const reply = typeof route === 'function' ? route(recorded) : route;
			res.writeHead(reply.status ?? 200, {
				'Content-Type': reply.contentType ?? 'application/json',
				...reply.headers,
			});
			res.end(reply.body ?? '{}');
		});
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	const baseUrl = `http://127.0.0.1:${port}`;

	return {
		client: new QBitFlow({ apiKey: 'sk_dummy', baseUrl, maxRetries: 0, ...clientOptions }),
		baseUrl,
		received,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

/** A JSON reply. */
export const json = (body: unknown, status = 200): Reply => ({
	status,
	body: JSON.stringify(body),
});

/** Walk a decoded value and collect the paths of every `undefined` member. */
export function undefinedPaths(value: unknown, path = ''): string[] {
	if (value === undefined) {
		return [path || '<root>'];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item, index) => undefinedPaths(item, `${path}[${index}]`));
	}
	if (value !== null && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, item]) =>
			undefinedPaths(item, path ? `${path}.${key}` : key)
		);
	}
	return [];
}
