/**
 * Tests for how error responses are turned into exceptions.
 *
 * These run against a throwaway local HTTP server rather than a mocked axios, so the
 * real request path is exercised. The payloads below are the API's actual error
 * envelopes, captured from the server:
 *
 *   400 -> {"errors":[{"field":"ProductName","message":"ProductName is too short"},
 *                     {"field":"Price","message":"Price is too short"}]}
 *   401 -> {"error":"invalid or missing authentication token"}
 *   404 -> {"error":"resource not found"}
 *
 * Note there is no top-level `message` key on an error response; `message` is the
 * success envelope.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { QBitFlow } from '../src';
import {
	ForbiddenException,
	NotFoundException,
	QBitFlowError,
	UnauthorizedException,
	ValidationException,
} from '../src/exceptions';

/** A server that answers every request with the given status and body. */
const serverReturning = async (
	status: number,
	body: string
): Promise<{ client: QBitFlow; close: () => Promise<void> }> => {
	const server = http.createServer((_req, res) => {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(body);
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

	const { port } = server.address() as AddressInfo;

	return {
		client: new QBitFlow({ apiKey: 'sk_dummy', baseUrl: `http://127.0.0.1:${port}` }),
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
};

describe('Error response parsing', () => {
	describe('validation envelope', () => {
		it('reports every field failure, not just the first', async () => {
			const body = JSON.stringify({
				errors: [
					{ field: 'ProductName', message: 'ProductName is too short' },
					{ field: 'Price', message: 'Price is too short' },
				],
			});
			const { client, close } = await serverReturning(400, body);

			try {
				await expect(client.products.get(1)).rejects.toThrow(ValidationException);

				// Surfacing only errors[0] leaves the caller to discover the rest one
				// round-trip at a time.
				await expect(client.products.get(1)).rejects.toThrow(/ProductName is too short/);
				await expect(client.products.get(1)).rejects.toThrow(/Price is too short/);
			} finally {
				await close();
			}
		});

		it('exposes the field names structurally', async () => {
			const body = JSON.stringify({
				errors: [
					{ field: 'ProductName', message: 'ProductName is too short' },
					{ field: 'Price', message: 'Price is too short' },
				],
			});
			const { client, close } = await serverReturning(400, body);

			try {
				await client.products.get(1);
				throw new Error('expected the request to reject');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationException);
				const { fields } = error as ValidationException;

				expect(fields).toHaveLength(2);
				expect(fields[0]).toEqual({
					field: 'ProductName',
					message: 'ProductName is too short',
				});
				expect(fields[1]).toEqual({ field: 'Price', message: 'Price is too short' });
			} finally {
				await close();
			}
		});

		it('prefixes the message with the field name when the API supplies one', async () => {
			const body = JSON.stringify({ errors: [{ field: 'Price', message: 'Price is too short' }] });
			const { client, close } = await serverReturning(400, body);

			try {
				await expect(client.products.get(1)).rejects.toThrow('Price: Price is too short');
			} finally {
				await close();
			}
		});

		it('handles a bare string entry with no field', async () => {
			const body = JSON.stringify({ errors: ['name is required'] });
			const { client, close } = await serverReturning(400, body);

			try {
				await expect(client.products.get(1)).rejects.toThrow('name is required');
			} finally {
				await close();
			}
		});
	});

	describe('single-message envelope', () => {
		it.each([
			[401, 'invalid or missing authentication token', UnauthorizedException],
			[403, 'Forbidden', ForbiddenException],
			[404, 'resource not found', NotFoundException],
		])('maps %i to its exception type and message', async (status, message, expected) => {
			const { client, close } = await serverReturning(status, JSON.stringify({ error: message }));

			try {
				await expect(client.products.get(1)).rejects.toThrow(expected);
				await expect(client.products.get(1)).rejects.toThrow(message);
			} finally {
				await close();
			}
		});

		it('leaves fields empty when the body is not a validation list', async () => {
			const body = JSON.stringify({ error: 'resource not found' });
			const { client, close } = await serverReturning(404, body);

			try {
				await client.products.get(1);
				throw new Error('expected the request to reject');
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
				expect((error as QBitFlowError).fields).toEqual([]);
			} finally {
				await close();
			}
		});

		it('prefers `error` over a synthesised `message`', async () => {
			const body = JSON.stringify({ error: 'First', message: 'Second' });
			const { client, close } = await serverReturning(400, body);

			try {
				await expect(client.products.get(1)).rejects.toThrow('First');
			} finally {
				await close();
			}
		});
	});

	describe('malformed bodies', () => {
		it('uses a non-JSON body as the message', async () => {
			const { client, close } = await serverReturning(400, 'Gateway timeout');

			try {
				await expect(client.products.get(1)).rejects.toThrow('Gateway timeout');
			} finally {
				await close();
			}
		});

		it('falls back to a generic message for an unrecognised shape', async () => {
			const { client, close } = await serverReturning(400, JSON.stringify({ detail: 'nope' }));

			try {
				await expect(client.products.get(1)).rejects.toThrow('An error occurred');
			} finally {
				await close();
			}
		});
	});
});
