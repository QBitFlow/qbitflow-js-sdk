/**
 * Tests for TypeScript type definitions — verifies types compile and carry correct values.
 * This file is type-checked by `npm run typecheck`, so the `Equals<>` assertions below are
 * compile-time guarantees: each response field is pinned to exactly the type the decoder
 * guarantees (no `?:`; `T | null` only for Go pointers).
 */

import {
	Currency,
	UserRole,
	CreatePaymentSessionDto,
	CreateSubscriptionSessionDto,
	CreateUserDto,
	Duration,
	OneTimePaymentSession,
	QBitFlowConfig,
	RefundStatus,
	SubscriptionSession,
	SubscriptionStatus,
	TransactionStatusValue,
	TransactionType,
	isPaymentSession,
	isSubscriptionSession,
	isSubscriptionBillingWebhook,
	isSubscriptionStatusTransitionWebhook,
	SessionWebhookResponse,
	SubscriptionWebhook,
	SubscriptionWebhookType,
} from '../src/types';

import type { AccountingEvent } from '../src/types/accounting';
import type { ApiKey } from '../src/types/api-key';
import type { ClaimFunds, ClaimRequestResponse, Organization } from '../src/types/claim';
import type {
	OrganizationFee,
	PaymentMetadata,
	ReferralFee,
	TxMetadata,
} from '../src/types/common';
import type { Customer } from '../src/types/customer';
import type { Payment, CombinedPayment } from '../src/types/payment';
import type { Product } from '../src/types/product';
import type { RefundEntry } from '../src/types/refund';
import type { TransactionStatus } from '../src/types/status';
import type { Subscription, SubscriptionHistory } from '../src/types/subscription';
import type { User } from '../src/types/user';

/** `true` only when `A` and `B` are exactly the same type. */
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Keys of `T` declared optional (`?:`). */
type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];

/** Compile-time assertion helper: `assertType<Equals<A, B>>(true)`. */
const assertType = <T extends true>(value: T): T => value;

describe('Type Definitions', () => {
	describe('Duration', () => {
		it('should accept valid duration', () => {
			const duration: Duration = { value: 1, unit: 'months' };
			expect(duration.value).toBe(1);
			expect(duration.unit).toBe('months');
		});
	});

	describe('TransactionType', () => {
		it('has all 13 members the API defines', () => {
			expect(Object.values(TransactionType)).toEqual([
				'payment',
				'transfer',
				'tokenTransfer',
				'createSubscription',
				'cancelSubscription',
				'executeSubscription',
				'createPAYGSubscription',
				'cancelPAYGSubscription',
				'increaseAllowance',
				'updateMaxAmount',
				'refund',
				'faucet',
				'claimFunds',
			]);
		});
	});

	describe('TransactionStatusValue', () => {
		it('has the 7 documented members', () => {
			expect(Object.values(TransactionStatusValue).sort()).toEqual(
				[
					'created',
					'waitingConfirmation',
					'pending',
					'completed',
					'failed',
					'cancelled',
					'expired',
				].sort()
			);
		});
	});

	describe('SubscriptionStatus', () => {
		it('has the 7 documented members', () => {
			expect(Object.values(SubscriptionStatus).sort()).toEqual(
				[
					'active',
					'cancelled',
					'past_due',
					'low_on_funds',
					'pending',
					'trial',
					'trial_expired',
				].sort()
			);
		});
	});

	describe('RefundStatus', () => {
		it('has the 4 documented members ("rejected" is not one of them)', () => {
			expect(Object.values(RefundStatus)).toEqual([
				'pending',
				'approved',
				'refused',
				'failed',
			]);
		});
	});

	describe('CreatePaymentSessionDto', () => {
		it('should accept session with productId', () => {
			const dto: CreatePaymentSessionDto = { productId: 1, customerUUID: 'uuid' };
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

		it('should accept optional redirect URLs', () => {
			const dto: CreatePaymentSessionDto = {
				productId: 1,
				successUrl: 'https://example.com/success',
				cancelUrl: 'https://example.com/cancel',
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
		const base: OneTimePaymentSession = {
			uuid: 'pay@1',
			reference: '',
			productId: 0,
			productReference: '',
			productName: 'Coffee',
			description: 'Hot',
			price: 3.5,
			successUrl: '',
			cancelUrl: '',
			organizationId: 1,
			organizationName: 'My Org',
			feeBps: 150,
			organizationFeeBps: 0,
			userId: 0,
			userName: '',
			test: false,
			customerUUID: null,
			customerReference: '',
			txType: TransactionType.ONE_TIME_PAYMENT,
			availableCurrencies: [1, 2, 3],
		};

		it('every session field is required; customerUUID is the only nullable one', () => {
			assertType<Equals<OptionalKeys<OneTimePaymentSession>, never>>(true);
			assertType<Equals<OptionalKeys<SubscriptionSession>, never>>(true);
			assertType<Equals<OneTimePaymentSession['customerUUID'], string | null>>(true);
			assertType<Equals<OneTimePaymentSession['availableCurrencies'], number[]>>(true);
			assertType<Equals<SubscriptionSession['trialPeriod'], number>>(true);
			assertType<Equals<SubscriptionSession['upgradingFromTrial'], boolean>>(true);
			expect(base.availableCurrencies).toEqual([1, 2, 3]);
		});

		it('isSubscriptionSession / isPaymentSession follow txType, then frequency', () => {
			const sub: SubscriptionSession = {
				...base,
				uuid: 'sub@1',
				txType: TransactionType.CREATE_SUBSCRIPTION,
				frequency: 2592000,
				trialPeriod: 0,
				minPeriods: 0,
				upgradingFromTrial: false,
			};
			expect(isSubscriptionSession(sub)).toBe(true);
			expect(isPaymentSession(sub)).toBe(false);
			expect(isSubscriptionSession(base)).toBe(false);
			expect(isPaymentSession(base)).toBe(true);
			// Unknown txType (e.g. from a newer API): a billing frequency makes it a subscription.
			expect(isSubscriptionSession({ ...sub, txType: 'somethingNew' })).toBe(true);
			expect(isSubscriptionSession({ ...base, txType: 'somethingNew' })).toBe(false);
			expect(isPaymentSession({ ...base, txType: 'somethingNew' })).toBe(false);
			// No txType at all and no frequency: a payment (the rule every SDK applies).
			expect(isPaymentSession({ ...base, txType: '' })).toBe(true);
			expect(isPaymentSession({ ...sub, txType: '' })).toBe(false);
		});
	});

	describe('QBitFlowConfig', () => {
		it('should accept minimal and full configs, including maxRetries: 0', () => {
			const minimal: QBitFlowConfig = { apiKey: 'test-key' };
			const full: QBitFlowConfig = {
				apiKey: 'test-key',
				baseUrl: 'https://api.example.com',
				timeout: 30000,
				maxRetries: 0,
			};
			expect(minimal.apiKey).toBe('test-key');
			expect(full.maxRetries).toBe(0);
		});
	});

	describe('Response types say exactly what the decoder guarantees (compile-time)', () => {
		it('no response type has an optional (?:) field', () => {
			assertType<Equals<OptionalKeys<Payment>, never>>(true);
			assertType<Equals<OptionalKeys<CombinedPayment>, never>>(true);
			assertType<Equals<OptionalKeys<Subscription>, never>>(true);
			assertType<Equals<OptionalKeys<SubscriptionHistory>, never>>(true);
			assertType<Equals<OptionalKeys<Customer>, never>>(true);
			assertType<Equals<OptionalKeys<Product>, never>>(true);
			assertType<Equals<OptionalKeys<User>, never>>(true);
			assertType<Equals<OptionalKeys<ApiKey>, never>>(true);
			assertType<Equals<OptionalKeys<RefundEntry>, never>>(true);
			assertType<Equals<OptionalKeys<Currency>, never>>(true);
			assertType<Equals<OptionalKeys<TransactionStatus>, never>>(true);
			assertType<Equals<OptionalKeys<PaymentMetadata>, never>>(true);
			assertType<Equals<OptionalKeys<TxMetadata>, never>>(true);
			assertType<Equals<OptionalKeys<AccountingEvent>, never>>(true);
			assertType<Equals<OptionalKeys<SessionWebhookResponse>, never>>(true);
			expect(true).toBe(true);
		});

		it('pins the nullable (Go pointer) fields and the required ones', () => {
			// Payment
			assertType<Equals<Payment['reference'], string | null>>(true);
			assertType<Equals<Payment['customerUUID'], string | null>>(true);
			assertType<Equals<Payment['currency'], Currency>>(true);
			assertType<Equals<Payment['metadata'], PaymentMetadata>>(true);
			assertType<Equals<Payment['organizationId'], number>>(true);
			assertType<Equals<Payment['userId'], number>>(true);
			assertType<Equals<Payment['productId'], number>>(true);
			// CombinedPayment
			assertType<Equals<CombinedPayment['productId'], number | null>>(true);
			assertType<Equals<CombinedPayment['subscriptionUUID'], string | null>>(true);
			assertType<Equals<CombinedPayment['metadata'], PaymentMetadata | null>>(true);
			assertType<Equals<CombinedPayment['customerUUID'], string>>(true);
			assertType<Equals<CombinedPayment['currency'], Currency>>(true);
			// Subscription / history
			assertType<Equals<Subscription['currency'], Currency>>(true);
			assertType<Equals<Subscription['lastBillingDate'], string>>(true);
			assertType<Equals<Subscription['minimumCancellationDate'], string | null>>(true);
			assertType<Equals<Subscription['reference'], string | null>>(true);
			assertType<Equals<SubscriptionHistory['currency'], Currency>>(true);
			assertType<Equals<SubscriptionHistory['metadata'], PaymentMetadata>>(true);
			// Metadata
			assertType<Equals<PaymentMetadata['organizationFee'], OrganizationFee | null>>(true);
			assertType<Equals<PaymentMetadata['referralFee'], ReferralFee | null>>(true);
			assertType<Equals<OrganizationFee['organizationId'], number>>(true);
			assertType<Equals<ReferralFee['referrer'], string>>(true);
			assertType<Equals<TxMetadata['mainCurrencyPriceUSD'], number>>(true);
			// Others
			assertType<Equals<Currency['mainCurrency'], Currency | null>>(true);
			assertType<Equals<Currency['mainCurrencyId'], number | null>>(true);
			assertType<Equals<User['claimedAt'], string | null>>(true);
			assertType<Equals<ApiKey['expiresAt'], string | null>>(true);
			assertType<Equals<ApiKey['userId'], number>>(true);
			assertType<Equals<Customer['userId'], number>>(true);
			assertType<Equals<Customer['reference'], string>>(true);
			assertType<Equals<Product['reference'], string>>(true);
			assertType<Equals<RefundEntry['merchantMessage'], string>>(true);
			assertType<Equals<RefundEntry['txHash'], string>>(true);
			assertType<Equals<RefundEntry['respondedAt'], string | null>>(true);
			assertType<Equals<RefundEntry['metadata'], TxMetadata | null>>(true);
			assertType<Equals<TransactionStatus['txHash'], string>>(true);
			assertType<Equals<TransactionStatus['settlementDetails'], PaymentMetadata | null>>(
				true
			);
			assertType<Equals<SessionWebhookResponse['status'], TransactionStatus | null>>(true);
			assertType<Equals<SessionWebhookResponse['managementPageLink'], string>>(true);
			expect(true).toBe(true);
		});

		it('unknown enum values stay assignable as raw strings, members still autocomplete', () => {
			const sub = { subscriptionStatus: 'paused_by_merchant' } as Pick<
				Subscription,
				'subscriptionStatus'
			>;
			const status: SubscriptionStatus | (string & {}) = sub.subscriptionStatus;
			const known: Subscription['subscriptionStatus'] = SubscriptionStatus.ACTIVE;
			const source: CombinedPayment['source'] = 'subscription_history';
			const txType: TransactionStatus['status'] = TransactionStatusValue.COMPLETED;
			const refund: RefundEntry['status'] = RefundStatus.REFUSED;
			const role: User['role'] = 'handle';
			expect(status).toBe('paused_by_merchant');
			expect(status === SubscriptionStatus.ACTIVE).toBe(false);
			expect([known, source, txType, refund, role]).toHaveLength(5);
		});

		it('CombinedPayment has no organizationId/userId', () => {
			assertType<
				Equals<'organizationId' extends keyof CombinedPayment ? true : false, false>
			>(true);
			assertType<Equals<'userId' extends keyof CombinedPayment ? true : false, false>>(true);
			expect(true).toBe(true);
		});

		it('request enums accept the string values too', () => {
			const user: CreateUserDto = {
				name: 'A',
				lastName: 'B',
				email: 'a@b.co',
				role: 'user',
			};
			const admin: CreateUserDto = { ...user, role: UserRole.ADMIN };
			// @ts-expect-error owner cannot be assigned on create
			const owner: CreateUserDto = { ...user, role: 'owner' };
			expect([user.role, admin.role, owner.role]).toEqual(['user', 'admin', 'owner']);
		});
	});

	describe('Subscription webhook envelope', () => {
		it('narrows data with the type guards; an unknown type keeps raw data', () => {
			const events: SubscriptionWebhook[] = [
				{
					subscriptionUUID: 'sub@1',
					subscriptionReference: '',
					type: SubscriptionWebhookType.STATUS_TRANSITION,
					data: {
						previousStatus: SubscriptionStatus.TRIAL,
						currentStatus: SubscriptionStatus.ACTIVE,
						updatedAt: 'now',
					},
				},
				{
					subscriptionUUID: 'sub@1',
					subscriptionReference: 'ref',
					type: 'paused',
					data: { raw: true },
				},
			];
			const [transition, unknown] = events;
			if (isSubscriptionStatusTransitionWebhook(transition)) {
				const current: string = transition.data.currentStatus;
				expect(current).toBe('active');
			} else {
				throw new Error('unexpected type');
			}
			expect(isSubscriptionBillingWebhook(unknown)).toBe(false);
			expect(isSubscriptionStatusTransitionWebhook(unknown)).toBe(false);
			expect(unknown.data).toEqual({ raw: true });
		});
	});

	describe('AccountingEvent', () => {
		it('should accept a valid accounting event (network fees always present)', () => {
			const event: AccountingEvent = {
				paymentId: 'pay-uuid',
				paymentReference: 'order-123',
				type: 'payment',
				txTimeUtc: '2024-01-15T12:00:00Z',
				receiptUrl: 'https://example.com/receipt',
				relatedPaymentId: '',
				relatedPaymentReference: '',
				productId: 1,
				productReference: 'prod-ref',
				productName: 'Test Product',
				productDescription: 'Description',
				customerUUID: 'customer-uuid',
				customerReference: 'cust-ref',
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
				networkFeesUsd: 0,
				networkFees: '0',
				netAmountUsd: 98.5,
				netAmount: '98.500000',
			};
			expect(event.type).toBe('payment');
			expect(event.netAmountUsd).toBe(98.5);
		});
	});

	describe('Claim types', () => {
		it('should accept a ClaimRequestResponse, an Organization and a ClaimFunds', () => {
			const req: ClaimRequestResponse = { message: 'ok', link: 'https://x' };
			const org: Organization = {
				id: 1,
				name: 'My Org',
				feePercentage: 1.5,
				createdAt: '2024-01-01T00:00:00Z',
			};
			const funds: ClaimFunds = {
				userId: 42,
				totalAmountOwed: 250.5,
				funded: false,
				test: false,
				createdAt: '2024-01-01T00:00:00Z',
			};
			expect(req.link).toContain('http');
			expect(org.name).toBe('My Org');
			expect(funds.totalAmountOwed).toBe(250.5);
		});
	});
});

describe('UserRole hierarchy', () => {
	it('covers every role the API returns', () => {
		expect(Object.values(UserRole)).toEqual(['handle', 'user', 'admin', 'owner']);
	});
});
