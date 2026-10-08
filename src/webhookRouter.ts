/**
 * The webhook router: verifies a delivery, parses it, runs the handlers registered for its type
 * and turns the outcome into the HTTP answer QBitFlow expects.
 *
 * ```ts
 * import { webhooks } from 'qbitflow';
 *
 * const router = webhooks
 *   .router(process.env.QBITFLOW_WEBHOOK_SECRET!)
 *   .on('payment.completed', async (payment, event) => fulfil(payment.reference, event.id));
 *
 * export const POST = router.fetchHandler(); // Next.js, Hono, Bun, Deno, Workers
 * app.post('/webhooks/qbitflow', express.raw({ type: 'application/json' }), router.nodeHandler());
 * ```
 *
 * @module
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { EventType, type KnownEventType } from './enums.js';
import { fieldError, WebhookSignatureError } from './errors.js';
import type { Event, EventOf, UnknownEvent } from './models/events.js';
import {
	isUnknownEvent,
	parseEvent,
	type RawBody,
	SIGNATURE_HEADER,
	type SignatureHeader,
	verify,
	type VerifyOptions,
} from './webhooks.js';

/** The largest body the adapters read: 1 MiB (larger: 413). */
export const MAX_WEBHOOK_BODY_BYTES = 1 << 20;

/** Handles the events of type `T`: `data` is the event's typed data. It may be async. */
export type WebhookHandler<T extends KnownEventType> = (
	data: EventOf<T>['data'],
	event: EventOf<T>
) => unknown;

/** Handles any event (`onAny`), or an event of a type this SDK does not know (`onUnknown`). It may be async. */
export type WebhookEventHandler<E extends Event = Event> = (event: E) => unknown;

/** Options of {@link router}: {@link VerifyOptions} (`tolerance`, `now`) and an error hook. */
export interface WebhookRouterOptions extends VerifyOptions {
	/**
	 * Called for every result carrying an error: a 400 (bad signature, or not a valid v2 event:
	 * `event` is then `null`) and a 500 (a handler failed: QBitFlow retries it later). Not called
	 * for the adapters' 405 and 413. The adapters answer without the error's details: log it here.
	 */
	onError?: (event: Event | null, error: Error) => void;
}

/** What {@link WebhookRouter.handle} made of a delivery. */
export interface WebhookResult {
	/**
	 * The HTTP status to answer: 200 (handled, or ignored), 400 (bad signature or not a v2 event:
	 * no handler ran), 500 (a handler failed: QBitFlow retries).
	 */
	status: number;
	/** The event, once verified and parsed; `null` on a 400. */
	event: Event | null;
	/** Why it is not a 200: the `WebhookSignatureError`, the `ValidationError` or the handler's error. */
	error: Error | null;
}

const KNOWN_EVENT_TYPES: readonly string[] = Object.values(EventType);

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** An adapter's answer. */
interface Answer {
	status: number;
	body: Record<string, unknown>;
	headers?: Record<string, string>;
}

const answer = (status: number, error?: string, headers?: Record<string, string>): Answer => ({
	status,
	body: error === undefined ? { received: true } : { error },
	headers,
});

const METHOD_NOT_ALLOWED = (): Answer => answer(405, 'method not allowed', { Allow: 'POST' });
const TOO_LARGE = (): Answer => answer(413, 'body too large', { Connection: 'close' });
const ALREADY_PARSED =
	'the request body was already parsed or read: give this route the raw body ' +
	"(express.raw({ type: 'application/json' }), or no body parser), never express.json() before it";

/** The answer to a {@link WebhookResult}: short reasons only, never the secret or a stack. */
function answerFor(result: WebhookResult): Answer {
	if (result.status === 200) return answer(200);
	if (result.status === 400) {
		return answer(
			400,
			result.error instanceof WebhookSignatureError ? 'invalid signature' : 'invalid event'
		);
	}
	return answer(result.status, 'internal error');
}

const asError = (err: unknown): Error =>
	err instanceof Error ? err : new Error(`webhook handler failed: ${String(err)}`);

/** A declared `Content-Length` above the limit. */
function declaredTooLarge(value: string | null | undefined): boolean {
	if (typeof value !== 'string' || !/^\s*[0-9]+\s*$/.test(value)) return false;
	return Number(value) > MAX_WEBHOOK_BODY_BYTES;
}

const byteLength = (body: string | Uint8Array): number =>
	typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.byteLength;

/**
 * Routes verified webhook deliveries to handlers. Build it with `webhooks.router(secret)` (or
 * `client.webhooks.router(secret)`), register handlers with {@link on}, {@link onUnknown} and
 * {@link onAny} (each returns the router), then serve it with {@link fetchHandler} or
 * {@link nodeHandler}, or call {@link handle} yourself.
 *
 * Deliveries are at least once: make the handlers idempotent (deduplicate on `event.id`).
 */
export class WebhookRouter {
	readonly #secret: string;
	readonly #options: WebhookRouterOptions;
	readonly #byType = new Map<string, Array<WebhookHandler<KnownEventType>>>();
	readonly #unknown: WebhookEventHandler<UnknownEvent>[] = [];
	readonly #any: WebhookEventHandler[] = [];

	/**
	 * @param secret - The endpoint's `whsec_…` secret (an empty one is a `ValidationError`).
	 * @param options - `tolerance` (seconds, default 300), `now` (tests), `onError`.
	 */
	constructor(secret: string, options: WebhookRouterOptions = {}) {
		if (typeof secret !== 'string' || secret === '') {
			throw fieldError('secret', "is required (the endpoint's whsec_… secret)");
		}
		this.#secret = secret;
		this.#options = { ...options };
	}

	/**
	 * Runs `handler(data, event)` for the events of type `type`, `data` typed to the type's model
	 * (several handlers of a type run in registration order). A type this SDK does not know is a
	 * `ValidationError`: use {@link onUnknown}.
	 */
	on<T extends KnownEventType>(type: T, handler: WebhookHandler<T>): this {
		if (typeof type !== 'string' || !KNOWN_EVENT_TYPES.includes(type)) {
			throw fieldError(
				'type',
				`is not an event type this SDK knows (${String(type)}): use onUnknown`
			);
		}
		checkHandler(handler);
		const list = this.#byType.get(type) ?? [];
		list.push(handler as unknown as WebhookHandler<KnownEventType>);
		this.#byType.set(type, list);
		return this;
	}

	/** Runs `handler(event)` for the events of a type this SDK does not know (their `data` is raw). */
	onUnknown(handler: WebhookEventHandler<UnknownEvent>): this {
		checkHandler(handler);
		this.#unknown.push(handler);
		return this;
	}

	/** Runs `handler(event)` for every event, after the type's handlers (registration order). */
	onAny(handler: WebhookEventHandler): this {
		checkHandler(handler);
		this.#any.push(handler);
		return this;
	}

	/**
	 * Verifies a delivery (`rawBody` exactly as received, its `QBitFlow-Signature` header), parses
	 * it and runs its handlers: the type's (or the `onUnknown` ones), then the `onAny` ones, each
	 * awaited in turn. It never throws: the {@link WebhookResult} says what to answer.
	 *
	 * - bad signature (`WebhookSignatureError`), or not a v2 event (`ValidationError`) → 400, no
	 *   handler runs;
	 * - a handler throws (or rejects) → 500 with its error; the remaining handlers do not run;
	 * - otherwise → 200, also when no handler is registered for the type.
	 */
	async handle(rawBody: RawBody, signatureHeader: SignatureHeader): Promise<WebhookResult> {
		let event: Event;
		try {
			verify(rawBody, signatureHeader, this.#secret, this.#options);
			event = parseEvent(rawBody);
		} catch (err) {
			return this.#failed({ status: 400, event: null, error: asError(err) });
		}
		try {
			if (isUnknownEvent(event)) {
				for (const h of this.#unknown) await h(event);
			} else {
				const known = event as EventOf<KnownEventType>;
				for (const h of this.#byType.get(known.type) ?? []) await h(known.data, known);
			}
			for (const h of this.#any) await h(event);
		} catch (err) {
			return this.#failed({ status: 500, event, error: asError(err) });
		}
		return { status: 200, event, error: null };
	}

	/** Reports a result carrying an error to `onError` (a failing hook changes nothing). */
	#failed(result: WebhookResult & { error: Error }): WebhookResult {
		try {
			this.#options.onError?.(result.event, result.error);
		} catch {
			// the answer stays the same
		}
		return result;
	}

	/**
	 * A Web-standard handler, `(request: Request) => Promise<Response>`: a Next.js App Router
	 * route (`export const POST = router.fetchHandler()`), Hono (`(c) => handler(c.req.raw)`), Bun,
	 * Deno, Cloudflare Workers. It answers 405 to anything but POST, 413 to a body above 1 MiB,
	 * then the status of {@link handle}, with a small JSON body (`{"received":true}` or
	 * `{"error":"…"}`).
	 */
	fetchHandler(): (request: Request) => Promise<Response> {
		return async (request) => {
			let a: Answer;
			try {
				if (request.method !== 'POST') a = METHOD_NOT_ALLOWED();
				else if (declaredTooLarge(request.headers.get('content-length'))) a = TOO_LARGE();
				else {
					const body = await readWebBody(request);
					a =
						body === undefined
							? TOO_LARGE()
							: answerFor(
									await this.handle(body, request.headers.get(SIGNATURE_HEADER))
								);
				}
			} catch {
				a = answer(400, 'cannot read the body');
			}
			return new Response(JSON.stringify(a.body), {
				status: a.status,
				headers: { ...JSON_HEADERS, ...a.headers },
			});
		};
	}

	/**
	 * A Node.js handler, `(req, res) => Promise<void>`, for `node:http` and the frameworks built
	 * on it (Express, Fastify's `raw`, Koa's `req`/`res`…). It reads the raw body itself, or uses
	 * `req.body` when it is a `Buffer` or a string: with Express, mount `express.raw({ type:
	 * 'application/json' })` (or no body parser) on the route. A `req.body` already parsed into an
	 * object (`express.json()` ran first: the signature can no longer be checked) is answered 500
	 * with a message saying so. Same answers as {@link fetchHandler}.
	 */
	nodeHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
		return async (req, res) => {
			let a: Answer;
			try {
				a = await this.#nodeAnswer(req as IncomingMessage & { body?: unknown });
			} catch {
				a = answer(400, 'cannot read the body');
			}
			if (res.headersSent) return;
			res.writeHead(a.status, { ...JSON_HEADERS, ...a.headers });
			res.end(JSON.stringify(a.body));
		};
	}

	async #nodeAnswer(req: IncomingMessage & { body?: unknown }): Promise<Answer> {
		if (req.method !== 'POST') return METHOD_NOT_ALLOWED();
		const header = req.headers[SIGNATURE_HEADER.toLowerCase()];
		const given = req.body;
		let body: RawBody;
		if (typeof given === 'string' || given instanceof Uint8Array) {
			if (byteLength(given) > MAX_WEBHOOK_BODY_BYTES) return TOO_LARGE();
			body = given;
		} else if (given !== undefined && given !== null) {
			return answer(500, ALREADY_PARSED);
		} else if (req.readableEnded) {
			return answer(500, ALREADY_PARSED);
		} else {
			const contentLength = req.headers['content-length'];
			if (declaredTooLarge(contentLength)) {
				req.resume(); // discard the body
				return TOO_LARGE();
			}
			const read = await readNodeBody(req);
			if (read === undefined) return TOO_LARGE();
			body = read;
		}
		return answerFor(await this.handle(body, header));
	}
}

function checkHandler(handler: unknown): void {
	if (typeof handler !== 'function') throw fieldError('handler', 'must be a function');
}

/** Reads a `Request`'s body up to the limit (`undefined`: larger). */
async function readWebBody(request: Request): Promise<Uint8Array | undefined> {
	if (request.body === null) return new Uint8Array(0);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_WEBHOOK_BODY_BYTES) {
			await reader.cancel().catch(() => undefined);
			return undefined;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

/** Reads a Node request's body up to the limit (`undefined`: larger; the rest is discarded). */
function readNodeBody(req: IncomingMessage): Promise<Buffer | undefined> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		const onData = (chunk: Buffer | string) => {
			const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
			size += buf.length;
			if (size > MAX_WEBHOOK_BODY_BYTES) {
				cleanup();
				req.resume(); // discard the rest, so that the answer can be sent
				resolve(undefined);
				return;
			}
			chunks.push(buf);
		};
		const onEnd = () => {
			cleanup();
			resolve(Buffer.concat(chunks));
		};
		const onError = (err: Error) => {
			cleanup();
			reject(err);
		};
		const cleanup = () => {
			req.off('data', onData);
			req.off('end', onEnd);
			req.off('error', onError);
		};
		req.on('data', onData);
		req.on('end', onEnd);
		req.on('error', onError);
	});
}

/**
 * A webhook router for the endpoint whose secret is `secret` (see {@link WebhookRouter}):
 *
 * ```ts
 * const router = webhooks.router(secret).on('payment.completed', (payment) => fulfil(payment));
 * ```
 */
export function router(secret: string, options?: WebhookRouterOptions): WebhookRouter {
	return new WebhookRouter(secret, options);
}
