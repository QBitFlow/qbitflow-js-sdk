/**
 * What every service holds: the shared transport and the client's `On-Behalf-Of`, with the call
 * helpers the service methods are built on.
 *
 * @internal Not part of the public API.
 */

import type { Schema } from './decode.js';
import { pathSegment } from './encode.js';
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

	/** Sends `e` and decodes its JSON answer, with the HTTP status (force-cancel: 202 = pending). */
	async callStatus<T>(
		schema: Schema<T>,
		e: Endpoint,
		options?: RequestOptions
	): Promise<{ value: T; status: number }> {
		const res = await this.transport.send(e, this.onBehalfOf, options);
		return { value: decodeResponse(schema, res), status: res.status };
	}

	/** Sends `e` and ignores the answer's body (deletes answer `{"message": …}`). */
	async callVoid(e: Endpoint, options?: RequestOptions): Promise<void> {
		await this.transport.send(e, this.onBehalfOf, options);
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

/**
 * Builds an API path from a template, escaping every segment: `path('/product/reference/:', ref)`
 * (each `:` placeholder takes one `[field, value]`).
 */
export function path(template: string, ...segments: Array<[field: string, value: string]>): string {
	let i = 0;
	return template.replace(/:/g, () => {
		const [field, value] = segments[i++];
		return pathSegment(field, value);
	});
}
