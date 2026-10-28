/**
 * Cursor pagination: the lazy walk behind every `iterate*` method.
 *
 * @internal Not part of the public API.
 */

import type { Page } from './models/common.js';

/**
 * Walks a cursor-paginated list lazily, one request per page, from `cursor` (absent = the first
 * page). `fetchPage` requests one page with the given cursor, keeping the caller's filters and
 * page size. The walk stops when the caller stops, on the last page (`hasMore` false), or on an
 * error, which it throws. Defensively, it also stops on a page claiming more without a
 * `nextCursor`, on one whose `nextCursor` is the cursor just requested (which would loop on the
 * same page forever), and on an empty page that claims more (the API never answers one: a server
 * fault, which could otherwise cycle between cursors).
 */
export async function* iteratePages<T>(
	cursor: string | undefined,
	fetchPage: (cursor: string | undefined) => Promise<Page<T>>
): AsyncGenerator<T, void, undefined> {
	let current = cursor === '' ? undefined : cursor;
	for (;;) {
		const page = await fetchPage(current);
		for (const item of page.items) yield item;
		const next = page.nextCursor ?? '';
		if (!page.hasMore || next === '' || next === (current ?? '') || page.items.length === 0) {
			return;
		}
		current = next;
	}
}
