import { join } from 'node:path';

import * as errors from '../src/errors';
import {
	ApiError,
	AuthenticationError,
	BadRequestError,
	ConflictError,
	fieldError,
	GoneError,
	IdempotencyError,
	NotFoundError,
	PermissionDeniedError,
	QBitFlowError,
	RateLimitError,
	ServerError,
	ValidationError,
	WebhookSignatureError,
} from '../src/errors';
import { errorFromResponse } from '../src/transport';
import { closeServers, rejection, reply, testClient, testServer } from './helpers/server';

afterEach(closeServers);

const response = (status: number, body: string, headers: Record<string, string> = {}) => ({
	status,
	headers: new Headers(headers),
	body,
});

describe('error mapping', () => {
	it.each<[number, string, typeof ApiError]>([
		[400, 'validation_failed', ValidationError],
		[400, 'bad_request', BadRequestError],
		[400, 'foreign_key_violation', BadRequestError],
		[400, 'invalid_signature', BadRequestError],
		[400, '', BadRequestError],
		[401, 'unauthorized', AuthenticationError],
		[403, 'forbidden', PermissionDeniedError],
		[403, 'policy_disabled', PermissionDeniedError],
		[403, 'plan_required', PermissionDeniedError],
		[404, 'not_found', NotFoundError],
		[409, 'unique_violation', ConflictError],
		[409, 'tx_already_sent', ConflictError],
		[409, 'merchant_not_ready', ConflictError],
		[409, 'refund_already_exists', ConflictError],
		[409, 'held_funds_pending', ConflictError],
		[409, 'idempotency_key_in_use', ConflictError],
		[410, 'merchant_closed', GoneError],
		[422, 'idempotency_key_reused', IdempotencyError],
		[422, 'something_else', ApiError],
		[413, 'request_too_large', ApiError],
		[405, '', ApiError],
		[429, 'rate_limit_exceeded', RateLimitError],
		[500, 'internal', ServerError],
		[503, 'network_unavailable', ServerError],
		[504, 'timeout', ServerError],
		[301, '', ServerError],
		[304, '', ServerError],
	])('%d %s', (status, code, cls) => {
		const body = JSON.stringify({ error: 'the message', code, requestId: 'req-body' });
		const err = errorFromResponse(response(status, body), Date.now());
		expect(Object.getPrototypeOf(err)).toBe(cls.prototype);
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toBeInstanceOf(QBitFlowError);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe(cls.name);
		expect([err.status, err.code, err.rawMessage, err.requestId]).toEqual([
			status,
			code,
			'the message',
			'req-body',
		]);
		expect(err.details).toEqual({});
	});
});

describe('error payload', () => {
	it('reads details.errors, never the top-level errors', () => {
		const body = JSON.stringify({
			error: 'name must be at least 2 characters',
			code: 'validation_failed',
			details: {
				errors: [
					{ field: 'name', message: 'name must be at least 2 characters' },
					{ field: 'frequency.unit', message: 'frequency.unit is required' },
					'garbage',
					{ other: 1 },
				],
				max: 5,
			},
			errors: [{ field: 'TOPLEVEL', message: 'must be ignored' }],
			requestId: 'abc-123',
			debug: 'stack trace',
		});
		const err = errorFromResponse(
			response(400, body, { 'X-Request-Id': 'from-header' }),
			Date.now()
		);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors).toEqual([
			{ field: 'name', message: 'name must be at least 2 characters' },
			{ field: 'frequency.unit', message: 'frequency.unit is required' },
		]);
		expect(err.requestId).toBe('abc-123');
		expect(err.details.max).toBe(5);
		expect(err.message).toBe(
			'name must be at least 2 characters (status 400, code validation_failed, request abc-123); ' +
				'name: name must be at least 2 characters; frequency.unit: frequency.unit is required'
		);
		expect(err.rawBody).toBe(body);
	});

	it.each([
		['no body', '', 'hdr-1', 404, 'not found', 'hdr-1', ''],
		['html body', '<html>gateway</html>', '', 502, 'bad gateway', '', ''],
		['json array', '[1,2]', 'hdr-2', 500, 'internal server error', 'hdr-2', ''],
		[
			'wrong types',
			'{"error": 5, "code": ["x"], "details": "str", "requestId": 7}',
			'hdr-3',
			403,
			'forbidden',
			'hdr-3',
			'',
		],
		['legacy code', '{"error":"boom","code":"error"}', '', 409, 'boom', '', 'error'],
		['header only id', '{"error":"x"}', 'hdr-4', 401, 'x', 'hdr-4', ''],
		['unknown status', '{}', '', 499, 'http status 499', '', ''],
	])('falls back: %s', (_name, body, header, status, message, requestId, code) => {
		const err = errorFromResponse(
			response(status, body, header ? { 'X-Request-Id': header } : {}),
			Date.now()
		);
		expect([err.rawMessage, err.requestId, err.code]).toEqual([message, requestId, code]);
		expect(err.details).toEqual({});
		expect(err.fieldErrors).toEqual([]);
	});

	it.each([
		[
			{ message: 'not found', status: 404, code: 'not_found', requestId: 'r1' },
			'not found (status 404, code not_found, request r1)',
		],
		[{ message: 'boom', status: 500 }, 'boom (status 500)'],
		[
			{
				message: 'validation failed',
				fieldErrors: [{ field: 'apiKey', message: 'apiKey is required' }],
			},
			'validation failed; apiKey: apiKey is required',
		],
		[
			{ message: 'request failed', cause: new Error('dial tcp: refused') },
			'request failed: dial tcp: refused',
		],
		[{ message: '' }, 'qbitflow error'],
	])('formats %p', (init, want) => {
		expect(new ApiError(init).message).toBe(want);
	});

	it('builds client-side errors without a status', () => {
		const ve = fieldError('price', 'must be a number above 0');
		expect(ve.status).toBeUndefined();
		expect(ve.code).toBe('');
		expect(ve.details).toEqual({});
		expect(ve.message).toBe('validation failed; price: price must be a number above 0');
		expect(ve).toBeInstanceOf(QBitFlowError);
	});
});

describe('errors through the client', () => {
	it('arrive typed with their details', async () => {
		const ts = await testServer((_req, res) =>
			reply(
				res,
				403,
				'{"error":"members.products is off","code":"policy_disabled","details":{"policy":"members.products"}}',
				{
					'X-Request-Id': 'hdr-id',
				}
			)
		);
		const { client } = testClient(ts);
		const err = (await rejection(client.me())) as PermissionDeniedError;
		expect(err).toBeInstanceOf(PermissionDeniedError);
		expect(err.details.policy).toBe('members.products');
		expect(err.requestId).toBe('hdr-id');
		expect(err.code).toBe('policy_disabled');
	});
});

describe('instanceof across builds', () => {
	it('matches an error created by another copy of the classes', () => {
		jest.isolateModules(() => {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const other = require(join(__dirname, '..', 'src', 'errors')) as typeof errors;
			expect(other.NotFoundError).not.toBe(NotFoundError);
			const foreign = new other.NotFoundError({ message: 'x', status: 404 });
			expect(foreign).toBeInstanceOf(NotFoundError);
			expect(foreign).toBeInstanceOf(ApiError);
			expect(foreign).toBeInstanceOf(QBitFlowError);
			expect(foreign).not.toBeInstanceOf(ConflictError);
			const sig = new other.WebhookSignatureError({ message: 'x', reason: 'missingHeader' });
			expect(sig).toBeInstanceOf(WebhookSignatureError);
			expect(sig).not.toBeInstanceOf(NotFoundError);
		});
	});
});
