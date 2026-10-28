/**
 * What every service holds: the shared transport and the client's `On-Behalf-Of`, with the call
 * helpers the service methods are built on.
 *
 * @internal Not part of the public API.
 */

import type { Schema } from './decode.js';
import { pathSegment, queryEscape } from './encode.js';
import { CODE_NOT_FOUND, NotFoundError } from './errors.js';
import { referenceQuery } from './params.js';
import { page } from './schemas.js';
import { decodeResponse, type Endpoint, type RequestOptions, type Transport } from './transport.js';

export class Core {
	constructor(
		readonly transport: Transport,
		/** The client's default `On-Behalf-Of` (`''`: organization level). */
		readonly onBehalfOf: string
	) {}

	/** Sends `e` and decodes its JSON answer. */
	async call<T>(schema: Schema<T>, e: Endpoint, options?: RequestOptions): Promise<T> {
		return (await this.callStatus(schema, e, options)).value;
	}

	/** Sends `e` and decodes its JSON answer, with the HTTP status (a cancel: 202 = pending). */
	async callStatus<T>(
		schema: Schema<T>,
		e: Endpoint,
		options?: RequestOptions
	): Promise<{ value: T; status: number }> {
		const res = await this.transport.send(e, this.onBehalfOf, options);
		return { value: decodeResponse(schema, res), status: res.status };
	}

	/** Sends `e` and ignores the answer's body (every `DELETE` answers 204, no body). */
	async callVoid(e: Endpoint, options?: RequestOptions): Promise<void> {
		await this.transport.send(e, this.onBehalfOf, options);
	}

	/**
	 * Sends `e`, a bounded list (one page, `hasMore` false: currencies, wallets, held funds, the
	 * accounting export), and returns its items, never `null`. Defensively, a page that claims
	 * more is followed with its `nextCursor` (`e`'s query carrying it) until `hasMore` is false,
	 * so a list the server ever splits is never cut short silently; the walk stops on the same
	 * guards as the iterators (no next cursor, a cursor that did not move, an empty page).
	 */
	async callItems<T>(item: Schema<T>, e: Endpoint, options?: RequestOptions): Promise<T[]> {
		const schema = page(item);
		const items: T[] = [];
		let cursor = '';
		for (let next = e; ; ) {
			const p = await this.call(schema, next, options);
			items.push(...p.items);
			const nextCursor = p.nextCursor ?? '';
			if (!p.hasMore || nextCursor === '' || nextCursor === cursor || p.items.length === 0) {
				return items;
			}
			cursor = nextCursor;
			next = { ...e, query: withCursor(e.query, cursor) };
		}
	}

	/**
	 * Runs a list's `?reference=` filter (a page of 0 or 1 item) and returns the item whose
	 * `reference` is exactly the one asked for. No such item is a `NotFoundError`, like a 404
	 * (status 404, code `not_found`), carrying the list answer's request id; checking the
	 * reference means a server that ignored the filter can never hand back another resource.
	 * `what` names the resource in the error's message (`product`). The reference is checked like
	 * a created one's first (1 to 100 of `A-Z a-z 0-9 . _ : @ -`, not `.` or `..`).
	 */
	async getByReference<T extends { reference?: string }>(
		item: Schema<T>,
		path: string,
		what: string,
		reference: string,
		options?: RequestOptions
	): Promise<T> {
		const query = referenceQuery(reference);
		const res = await this.transport.send(
			{ method: 'GET', path, query },
			this.onBehalfOf,
			options
		);
		const found = decodeResponse(page(item), res).items.find((v) => v.reference === reference);
		if (found !== undefined) return found;
		throw new NotFoundError({
			message: `no ${what} with this reference`,
			status: 404,
			code: CODE_NOT_FOUND,
			details: {},
			requestId: res.headers.get('x-request-id') ?? '',
		});
	}

	/** Sends `e` and returns the answer's body as text (the CSV export); errors are still parsed as JSON. */
	async callText(e: Endpoint, options?: RequestOptions): Promise<string> {
		const res = await this.transport.send(
			{ ...e, accept: e.accept ?? 'text/csv, application/json' },
			this.onBehalfOf,
			options
		);
		return res.body;
	}
}

/** `query` with `cursor` set (a bounded list's next page), keys kept sorted. */
function withCursor(query: string | undefined, cursor: string): string {
	const parts = (query ?? '')
		.split('&')
		.filter((part) => part !== '' && !part.startsWith('cursor='));
	parts.push(`cursor=${queryEscape(cursor)}`);
	const key = (part: string): string => part.slice(0, part.indexOf('='));
	return parts.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).join('&');
}

/**
 * Builds an API path from a template, escaping every segment: `path('/products/:', uuid)` (each
 * `:` placeholder takes one `[field, value]`).
 */
export function path(template: string, ...segments: Array<[field: string, value: string]>): string {
	let i = 0;
	return template.replace(/:/g, () => {
		const [field, value] = segments[i++];
		return pathSegment(field, value);
	});
}
