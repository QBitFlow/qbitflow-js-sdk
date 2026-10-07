/**
 * A local HTTP server for the offline tests: it records every request it receives and answers
 * with a scripted handler, so the real `fetch` path (timeouts, redirects, dropped connections)
 * is exercised. The clients built on it record their back-off sleeps instead of waiting.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { QBitFlow, TRANSPORT, type ClientOptions } from '../../src/client';
import type { Transport } from '../../src/transport';

export const TEST_API_KEY = 'sk_test_key_123';

/** One request the server received. */
export interface Recorded {
	method: string;
	/** The escaped path, as sent. */
	path: string;
	/** The raw query string, as sent (no `?`). */
	query: string;
	headers: http.IncomingHttpHeaders;
	body: string;
}

/** Answers request number `n` (0-based). */
export type Handler = (req: Recorded, res: http.ServerResponse, n: number) => void;

export interface TestServer {
	url: string;
	recorded: Recorded[];
	handler: Handler;
	close(): Promise<void>;
}

const open: TestServer[] = [];

/** Closes every server opened by the test file (call from `afterAll`/`afterEach`). */
export async function closeServers(): Promise<void> {
	await Promise.all(open.splice(0).map((s) => s.close()));
}

/** Starts a server answering with `handler`. */
export async function testServer(handler: Handler): Promise<TestServer> {
	const sockets = new Set<import('node:net').Socket>();
	const ts: TestServer = {
		url: '',
		recorded: [],
		handler,
		close: () =>
			new Promise<void>((resolve) => {
				for (const s of sockets) s.destroy();
				server.close(() => resolve());
			}),
	};
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			const raw = req.url ?? '';
			const q = raw.indexOf('?');
			const rec: Recorded = {
				method: req.method ?? '',
				path: q < 0 ? raw : raw.slice(0, q),
				query: q < 0 ? '' : raw.slice(q + 1),
				headers: req.headers,
				body: Buffer.concat(chunks).toString('utf8'),
			};
			const n = ts.recorded.length;
			ts.recorded.push(rec);
			ts.handler(rec, res, n);
		});
	});
	server.on('connection', (s) => {
		sockets.add(s);
		s.on('close', () => sockets.delete(s));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	ts.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	open.push(ts);
	return ts;
}

/** Writes a JSON answer. */
export function reply(
	res: http.ServerResponse,
	status: number,
	body: string,
	headers: Record<string, string> = {}
): void {
	res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
	res.end(body);
}

/** Answers every request with the same status and body. */
export const staticReply =
	(status: number, body: string): Handler =>
	(_req, res) =>
		reply(res, status, body);

/** Answers the scripted `[status, body]` pairs in order, then repeats the last one. */
export const sequence =
	(...replies: Array<[number, string]>): Handler =>
	(_req, res, n) => {
		const [status, body] = replies[Math.min(n, replies.length - 1)];
		reply(res, status, body);
	};

/** Drops the connection without an answer. */
export function hangUp(res: http.ServerResponse): void {
	res.socket?.destroy();
}

/** A client on `ts` whose back-off sleeps are recorded (in ms) instead of waited. */
export function testClient(
	ts: TestServer,
	options: ClientOptions = {}
): { client: QBitFlow; sleeps: number[]; transport: Transport } {
	const client = new QBitFlow(TEST_API_KEY, { baseUrl: ts.url, ...options });
	const transport = client[TRANSPORT];
	const sleeps: number[] = [];
	transport.sleep = async (ms, signal) => {
		sleeps.push(ms);
		if (signal?.aborted) throw signal.reason;
	};
	return { client, sleeps, transport };
}

/** The error a promise rejects with (fails the test when it resolves). */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (err) {
		return err;
	}
	throw new Error('expected the promise to reject');
}

/** Catches a synchronous throw. */
export function thrown(fn: () => unknown): unknown {
	try {
		fn();
	} catch (err) {
		return err;
	}
	throw new Error('expected a throw');
}

/** Collects an async iterator, up to `max` items (0 = all). */
export async function collect<T>(it: AsyncIterable<T>, max = 0): Promise<T[]> {
	const out: T[] = [];
	for await (const v of it) {
		out.push(v);
		if (max > 0 && out.length === max) break;
	}
	return out;
}

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
