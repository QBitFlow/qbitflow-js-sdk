/**
 * Tests for the main QBitFlow client
 */

import { QBitFlow } from '../src/QBitFlow';
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

		it('should throw error when API key is not provided', () => {
			expect(() => new QBitFlow('')).toThrow('API key is required');
		});
	});

	describe('Request handlers', () => {
		it('should initialize all request handlers', () => {
			const client = new QBitFlow('test-api-key');
			expect(client.customers).toBeDefined();
			expect(client.products).toBeDefined();
			expect(client.users).toBeDefined();
			expect(client.apiKeys).toBeDefined();

			expect(client.oneTimePayments).toBeDefined();
			expect(client.subscriptions).toBeDefined();
			expect(client.payAsYouGo).toBeDefined();
			expect(client.transactionStatus).toBeDefined();
		});
	});
});
