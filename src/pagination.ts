/**
 * Cursor pagination: the lazy walk behind every `iterate*` method.
 *
 * @internal Not part of the public API.
 */

import type { Page } from './models/common.js';

/**
 * Walks a cursor-paginated list lazily, one request per page, from `cursor` (absent = the first
 * page). `fetchPage` requests one page with the given cursor, keeping the caller's filters and
 * page size. The walk stops when the caller stops, on the last page (`nextCursor` null), on an
 * empty page, on a cursor that does not move, or on an error, which it throws.
 */
export async function* iteratePages<T>(
	cursor: string | undefined,
	fetchPage: (cursor: string | undefined) => Promise<Page<T>>
): AsyncGenerator<T, void, undefined> {
	let current = cursor === '' ? undefined : cursor;
	for (;;) {
		const page = await fetchPage(current);
		for (const item of page.items) yield item;
		if (
			page.nextCursor === null ||
			page.items.length === 0 ||
			page.nextCursor === (current ?? '')
		) {
			return;
		}
		current = page.nextCursor;
	}
}
