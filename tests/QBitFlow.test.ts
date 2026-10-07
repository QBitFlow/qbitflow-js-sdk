/**
 * Tests for the main QBitFlow client
 */

import { QBitFlow } from '../src/QBitFlow';
import { ValidationException } from '../src/exceptions';
import { DEFAULT_BASE_URL } from '../src/config';

const LOCAL_URL = 'http://localhost:3001';

describe('QBitFlow', () => {
	describe('Constructor', () => {
		it('should initialize with API key string', () => {
			const client = new QBitFlow('test-api-key');
			expect(client.getApiKey()).toBe('test-api-key');
			expect(client.getBaseUrl()).toBe(DEFAULT_BASE_URL);
		});

		it('should initialize with config object', () => {
			const client = new QBitFlow({
				apiKey: 'test-api-key',
				baseUrl: LOCAL_URL,
				timeout: 60000,
				maxRetries: 5,
			});
			expect(client.getApiKey()).toBe('test-api-key');
			expect(client.getBaseUrl()).toBe(LOCAL_URL);
		});

		it('should use default values when not provided in config', () => {
			const client = new QBitFlow({
				apiKey: 'test-api-key',
			});
			expect(client.getApiKey()).toBe('test-api-key');
			expect(client.getBaseUrl()).toBe(DEFAULT_BASE_URL);
		});

		it('should throw error when API key is not provided or blank', () => {
			expect(() => new QBitFlow('')).toThrow('API key is required');
			expect(() => new QBitFlow('   ')).toThrow('API key is required');
			expect(() => new QBitFlow({ apiKey: '\t\n' })).toThrow('API key is required');
			expect(() => new QBitFlow({} as never)).toThrow('API key is required');
		});

		it('should reject a base URL that is not an absolute http(s) URL', () => {
			for (const baseUrl of [
				'not a url',
				'ftp://example.com',
				'api.qbitflow.app/v1',
				'http://[::1',
			]) {
				expect(() => new QBitFlow({ apiKey: 'k', baseUrl })).toThrow('baseUrl');
			}
			expect(
				() => new QBitFlow({ apiKey: 'k', baseUrl: 'HTTP://localhost:3001/' })
			).not.toThrow();
		});

		it('should reject invalid timeout and maxRetries', () => {
			expect(() => new QBitFlow({ apiKey: 'k', maxRetries: -1 })).toThrow('maxRetries');
			expect(() => new QBitFlow({ apiKey: 'k', maxRetries: 1.5 })).toThrow('maxRetries');
			expect(() => new QBitFlow({ apiKey: 'k', timeout: -1 })).toThrow('timeout');
			expect(() => new QBitFlow({ apiKey: 'k', timeout: NaN })).toThrow('timeout');
		});
	});

	describe('onBehalfOf', () => {
		it('returns a scoped client with the same configuration and every service', () => {
			const client = new QBitFlow({ apiKey: 'test-api-key', baseUrl: LOCAL_URL });
			const scoped = client.onBehalfOf(12);
			expect(scoped).toBeInstanceOf(QBitFlow);
			expect(scoped).not.toBe(client);
			expect(scoped.getApiKey()).toBe('test-api-key');
			expect(scoped.getBaseUrl()).toBe(LOCAL_URL);
			expect(scoped.products).not.toBe(client.products);
			expect(scoped.currencies).toBeDefined();
			expect(client.onBehalfOf(0)).toBeInstanceOf(QBitFlow);
		});

		it('rejects a negative, fractional, unsafe or non-number id', () => {
			const client = new QBitFlow('test-api-key');
			for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 2, NaN, Infinity, '3', true]) {
				expect(() => client.onBehalfOf(bad as number)).toThrow(ValidationException);
			}
		});
	});

	describe('Request handlers', () => {
		it('should initialize all request handlers', () => {
			const client = new QBitFlow('test-api-key');

			// Core handlers
			expect(client.customers).toBeDefined();
			expect(client.products).toBeDefined();
			expect(client.users).toBeDefined();
			expect(client.apiKeys).toBeDefined();
			expect(client.webhooks).toBeDefined();

			// Payment handlers
			expect(client.oneTimePayments).toBeDefined();
			expect(client.subscriptions).toBeDefined();
			expect(client.transactionStatus).toBeDefined();

			// New handlers
			expect(client.refunds).toBeDefined();
			expect(client.accounting).toBeDefined();
			expect(client.claims).toBeDefined();
			expect(client.currencies).toBeDefined();
		});
	});
});
