/**
 * Tests for TypeScript type definitions
 * This file mainly tests that types compile correctly
 */

import {
	Duration,
	TransactionType,
	TransactionStatusValue,
	CreateSessionDto,
	QBitFlowConfig,
} from '../src/types';

describe('Type Definitions', () => {
	describe('Duration', () => {
		it('should accept valid duration', () => {
			const duration: Duration = {
				value: 1,
				unit: 'months',
			};
			expect(duration.value).toBe(1);
			expect(duration.unit).toBe('months');
		});
	});

	describe('TransactionType', () => {
		it('should have correct enum values', () => {
			expect(TransactionType.ONE_TIME_PAYMENT).toBe('payment');
			expect(TransactionType.CREATE_SUBSCRIPTION).toBe('createSubscription');
			expect(TransactionType.CREATE_PAYG_SUBSCRIPTION).toBe('createPAYGSubscription');
		});
	});

	describe('TransactionStatusValue', () => {
		it('should have correct enum values', () => {
			expect(TransactionStatusValue.CREATED).toBe('created');
			expect(TransactionStatusValue.PENDING).toBe('pending');
			expect(TransactionStatusValue.COMPLETED).toBe('completed');
			expect(TransactionStatusValue.FAILED).toBe('failed');
		});
	});

	describe('CreateSessionDto', () => {
		it('should accept session with productId', () => {
			const dto: CreateSessionDto = {
				productId: 1,
				customerUUID: 'uuid',
			};
			expect(dto.productId).toBe(1);
		});

		it('should accept session with product details', () => {
			const dto: CreateSessionDto = {
				productName: 'Product',
				description: 'Description',
				price: 99.99,
				customerUUID: 'uuid',
			};
			expect(dto.productName).toBe('Product');
		});
	});

	describe('QBitFlowConfig', () => {
		it('should accept minimal config', () => {
			const config: QBitFlowConfig = {
				apiKey: 'test-key',
			};
			expect(config.apiKey).toBe('test-key');
		});

		it('should accept full config', () => {
			const config: QBitFlowConfig = {
				apiKey: 'test-key',
				baseUrl: 'https://api.example.com',
				timeout: 30000,
				maxRetries: 3,
			};
			expect(config.baseUrl).toBe('https://api.example.com');
		});
	});
});
