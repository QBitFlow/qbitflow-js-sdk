/**
 * Tests for TypeScript type definitions — verifies types compile and carry correct values.
 */

import {
	CreatePaymentSessionDto,
	CreateSubscriptionSessionDto,
	Duration,
	OneTimePaymentSession,
	SubscriptionSession,
	PaygSubscriptionSession,
	QBitFlowConfig,
	RefundStatus,
	SubscriptionStatus,
	TransactionStatusValue,
	TransactionType,
} from '../src/types';

import type { AccountingEvent } from '../src/types/accounting';
import type { ClaimFunds, ClaimRequest, Organization } from '../src/types/claim';
import type { RefundEntry } from '../src/types/refund';

describe('Type Definitions', () => {
	describe('Duration', () => {
		it('should accept valid duration', () => {
			const duration: Duration = { value: 1, unit: 'months' };
			expect(duration.value).toBe(1);
			expect(duration.unit).toBe('months');
		});
	});

	describe('TransactionType', () => {
		it('should have correct enum values', () => {
			expect(TransactionType.ONE_TIME_PAYMENT).toBe('payment');
			expect(TransactionType.CREATE_SUBSCRIPTION).toBe('createSubscription');
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

	describe('SubscriptionStatus', () => {
		it('should have correct enum values', () => {
			expect(SubscriptionStatus.ACTIVE).toBe('active');
			expect(SubscriptionStatus.CANCELLED).toBe('cancelled');
			expect(SubscriptionStatus.PAST_DUE).toBe('past_due');
			expect(SubscriptionStatus.LOW_ON_FUNDS).toBe('low_on_funds');
			expect(SubscriptionStatus.TRIAL).toBe('trial');
			expect(SubscriptionStatus.TRIAL_EXPIRED).toBe('trial_expired');
		});
	});

	describe('CreatePaymentSessionDto', () => {
		it('should accept session with productId', () => {
			const dto: CreatePaymentSessionDto = {
				productId: 1,
				customerUUID: 'uuid',
			};
			expect(dto.productId).toBe(1);
		});

		it('should accept session with inline product details', () => {
			const dto: CreatePaymentSessionDto = {
				productName: 'Product',
				description: 'Description',
				price: 99.99,
				customerUUID: 'uuid',
			};
			expect(dto.productName).toBe('Product');
		});

		it('should accept optional webhook and redirect URLs', () => {
			const dto: CreatePaymentSessionDto = {
				productId: 1,
				successUrl: 'https://example.com/success',
				cancelUrl: 'https://example.com/cancel',
				webhookUrl: 'https://example.com/webhook',
			};
			expect(dto.successUrl).toBeDefined();
			expect(dto.cancelUrl).toBeDefined();
		});
	});

	describe('CreateSubscriptionSessionDto', () => {
		it('should require frequency', () => {
			const dto: CreateSubscriptionSessionDto = {
				productId: 1,
				frequency: { value: 1, unit: 'months' },
			};
			expect(dto.frequency.value).toBe(1);
			expect(dto.frequency.unit).toBe('months');
		});

		it('should accept optional trial period and min periods', () => {
			const dto: CreateSubscriptionSessionDto = {
				productId: 1,
				frequency: { value: 1, unit: 'months' },
				trialPeriod: { value: 7, unit: 'days' },
				minPeriods: 3,
			};
			expect(dto.trialPeriod?.unit).toBe('days');
			expect(dto.minPeriods).toBe(3);
		});
	});

	describe('Session types', () => {
		it('OneTimePaymentSession should compile with required fields', () => {
			const session: OneTimePaymentSession = {
				uuid: 'sess-uuid',
				organizationId: 1,
				organizationName: 'My Org',
				feeBps: 150,
				test: false,
				customerUUID: '',
				availableCurrencies: [],
			};
			expect(session.uuid).toBeDefined();
			expect(session.feeBps).toBe(150);
		});

		it('SubscriptionSession should include frequency in seconds', () => {
			const session: SubscriptionSession = {
				uuid: 'sess-uuid',
				organizationId: 1,
				organizationName: 'My Org',
				feeBps: 150,
				test: false,
				customerUUID: '',
				availableCurrencies: [],
				frequency: 2592000, // 30 days in seconds
				trialPeriod: 604800, // 7 days
				minPeriods: 3,
			};
			expect(session.frequency).toBe(2592000);
			expect(session.trialPeriod).toBe(604800);
		});

		it('PaygSubscriptionSession should include structured Duration frequency', () => {
			const session: PaygSubscriptionSession = {
				uuid: 'sess-uuid',
				organizationId: 1,
				organizationName: 'My Org',
				feeBps: 150,
				test: false,
				customerUUID: '',
				availableCurrencies: [],
				frequency: { value: 1, unit: 'months' },
				freeCredits: 10.0,
			};
			expect(session.frequency.unit).toBe('months');
			expect(session.freeCredits).toBe(10.0);
		});
	});

	describe('QBitFlowConfig', () => {
		it('should accept minimal config', () => {
			const config: QBitFlowConfig = { apiKey: 'test-key' };
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

	describe('RefundEntry', () => {
		it('should accept a valid refund entry', () => {
			const entry: RefundEntry = {
				uuid: 'refund-uuid',
				txId: 'pay@payment-uuid',
				test: false,
				reason: 'Customer requested refund',
				status: RefundStatus.PENDING,
				createdAt: '2024-01-01T00:00:00Z',
				organizationId: 1,
				amountMinUnits: '100000',
			};
			expect(entry.uuid).toBeDefined();
			expect(entry.status).toBe(RefundStatus.PENDING);
		});
	});

	describe('AccountingEvent', () => {
		it('should accept a valid accounting event', () => {
			const event: AccountingEvent = {
				paymentId: 'pay-uuid',
				type: 'one_time',
				txTimeUtc: '2024-01-15T12:00:00Z',
				receiptUrl: 'https://example.com/receipt',
				productId: 1,
				productName: 'Test Product',
				productDescription: 'Description',
				customerUuid: 'customer-uuid',
				chain: 'solana',
				blockNumberOrSlot: '123456789',
				txHash: '0xabc123',
				fromAddress: '0xfrom',
				toAddress: '0xto',
				tokenSymbol: 'USDC',
				currencyDecimals: 6,
				tokenContractOrMint: 'EPjFW...',
				explorerUrl: 'https://explorer.solana.com/tx/0xabc123',
				grossAmount: '100.000000',
				grossAmountUsd: 100.0,
				platformFeePercent: 1.5,
				platformFeeUsd: 1.5,
				platformFee: '1.500000',
				organizationFeePercent: 0,
				organizationFeeUsd: 0,
				organizationFee: '0',
				netAmountUsd: 98.5,
				netAmount: '98.500000',
			};
			expect(event.type).toBe('one_time');
			expect(event.netAmountUsd).toBe(98.5);
		});
	});

	describe('Claim types', () => {
		it('should accept a valid ClaimRequest', () => {
			const req: ClaimRequest = {
				uuid: 'claim-uuid',
				userId: 42,
				createdAt: '2024-01-01T00:00:00Z',
			};
			expect(req.userId).toBe(42);
		});

		it('should accept a valid Organization', () => {
			const org: Organization = {
				id: 1,
				name: 'My Org',
				feePercentage: 1.5,
				createdAt: '2024-01-01T00:00:00Z',
			};
			expect(org.name).toBe('My Org');
		});

		it('should accept a valid ClaimFunds', () => {
			const funds: ClaimFunds = {
				userId: 42,
				totalAmountOwed: 250.5,
				funded: false,
				test: false,
				createdAt: '2024-01-01T00:00:00Z',
			};
			expect(funds.totalAmountOwed).toBe(250.5);
		});
	});
});
