/**
 * The response decoder: absent/null → zero value for non-nullable fields, nullable fields
 * always present, wrong JSON type → ServerException naming the path, unknown keys and enum
 * values preserved. Also covers every schema and the webhook parse helpers.
 */

import {
	boolean,
	decodeWith,
	integer,
	list,
	nullable,
	number,
	object,
	string,
	timestamp,
	ZERO_TIME,
} from '../src/decode';
import { ServerException, ValidationException } from '../src/exceptions';
import * as schemas from '../src/schemas';
import {
	isSubscriptionBillingWebhook,
	isSubscriptionSession,
	isSubscriptionStatusTransitionWebhook,
	parseSessionWebhook,
	parseSubscriptionWebhook,
	SubscriptionWebhookType,
	TransactionType,
} from '../src';
import { undefinedPaths } from './helpers/stubServer';

const CURRENCY = {
	id: 7,
	symbol: 'USDC',
	name: 'USD Coin',
	decimals: 6,
	address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
	mainCurrencyId: 4,
	mainCurrency: {
		id: 4,
		symbol: 'SOL',
		name: 'Solana',
		decimals: 9,
		address: '',
		mainCurrency: null,
		test: false,
	},
	test: false,
};

const METADATA = {
	feeBps: 100,
	txMetadata: {
		networkFees: { amount: '5000', unitsConsumed: 150 },
		blockData: { number: '123', timestamp: 1758539990 },
	},
	txAmounts: {
		usd: { platform: 0.2, merchant: 19.79 },
		minUnits: { platform: '200000', organization: '0', referral: '0', merchant: '19790000' },
	},
};

describe('decoder primitives', () => {
	it('turns absent and null into the zero value for non-nullable types', () => {
		for (const raw of [undefined, null]) {
			expect(decodeWith(string, raw)).toBe('');
			expect(decodeWith(number, raw)).toBe(0);
			expect(decodeWith(integer, raw)).toBe(0);
			expect(decodeWith(boolean, raw)).toBe(false);
			expect(decodeWith(timestamp, raw)).toBe(ZERO_TIME);
			expect(decodeWith(list(string), raw)).toEqual([]);
			expect(decodeWith(nullable(string), raw)).toBeNull();
		}
		expect(ZERO_TIME).toBe('0001-01-01T00:00:00Z');
	});

	it('decodes an absent nested object into a zero-valued object', () => {
		const schema = object<{ a: { b: number; c: string[] } }>({
			a: object<{ b: number; c: string[] }>({ b: integer, c: list(string) }),
		});
		expect(decodeWith(schema, {})).toEqual({ a: { b: 0, c: [] } });
		expect(decodeWith(schema, { a: null })).toEqual({ a: { b: 0, c: [] } });
	});

	it('keeps unknown keys', () => {
		const schema = object<{ a: number }>({ a: integer });
		expect(decodeWith(schema, { a: 1, extra: 'kept' })).toEqual({ a: 1, extra: 'kept' });
	});

	it('accepts an integral float for an integer and any number for a float', () => {
		expect(decodeWith(integer, 3.0)).toBe(3);
		expect(decodeWith(number, 3)).toBe(3);
		expect(decodeWith(number, 2.5)).toBe(2.5);
	});

	it.each([
		[string, 5, 'expected a string, got a number'],
		[number, '5', 'expected a number, got a string'],
		[integer, 1.5, 'expected an integer, got a number'],
		[boolean, 'true', 'expected a boolean, got a string'],
		[timestamp, 17, 'expected an RFC3339 timestamp string, got a number'],
		[list(string), {}, 'expected an array, got an object'],
		[object<{ a: number }>({ a: integer }), [], 'expected an object, got an array'],
	])('rejects a value of the wrong JSON type (%#)', (schema, raw, message) => {
		expect(() => decodeWith(schema as never, raw, { statusCode: 200 })).toThrow(message);
	});

	it('names the field path and carries the HTTP status', () => {
		try {
			decodeWith(
				schemas.PaymentSchema,
				{ metadata: { txAmounts: { usd: { platform: 'x' } } } },
				{
					statusCode: 201,
				}
			);
			throw new Error('expected a shape error');
		} catch (error) {
			expect(error).toBeInstanceOf(ServerException);
			expect((error as ServerException).statusCode).toBe(201);
			expect((error as Error).message).toContain('metadata.txAmounts.usd.platform');
		}

		expect(() =>
			decodeWith(list(schemas.ProductSchema), [{ id: 1 }, { id: 'two' }], { statusCode: 200 })
		).toThrow('[1].id');
	});
});

describe('every response schema', () => {
	const all = Object.entries(schemas).filter(
		([name, value]) =>
			name.endsWith('Schema') && typeof (value as { decode?: unknown }).decode === 'function'
	) as Array<[string, { decode: (v: unknown, p: string, c: object) => unknown }]>;

	it.each(all)('%s decodes an empty object with no undefined member', (_name, schema) => {
		const decoded = schema.decode({}, '', {});
		expect(undefinedPaths(decoded)).toEqual([]);
	});
});

describe('response types', () => {
	it('Payment: whenAuth fields, currency and zero values', () => {
		const payment = decodeWith(schemas.PaymentSchema, {
			uuid: 'pay@1',
			createdAt: '2026-09-21T22:02:09Z',
			amount: 19.99,
			amountMinUnits: '19990000',
			currencyId: 7,
			currency: CURRENCY,
			organizationId: 3,
			metadata: METADATA,
		});
		expect(payment.reference).toBeNull();
		expect(payment.customerUUID).toBeNull();
		expect(payment.productId).toBe(0);
		expect(payment.userId).toBe(0); // absent for an org-level payment
		expect(payment.organizationId).toBe(3);
		expect(payment.currency.symbol).toBe('USDC');
		expect(payment.currency.mainCurrency?.symbol).toBe('SOL');
		expect(payment.currency.mainCurrency?.mainCurrencyId).toBeNull();
		expect(payment.metadata.organizationFee).toBeNull();
		expect(payment.metadata.referralFee).toBeNull();
		expect(payment.metadata.txMetadata.mainCurrencyPriceUSD).toBe(0);
		expect(payment.metadata.txAmounts.usd.organization).toBe(0);
		expect(payment.metadata.txAmounts.usd.referral).toBe(0);
	});

	it('CombinedPayment: nullable productId / subscriptionUUID / metadata', () => {
		const item = decodeWith(schemas.CombinedPaymentSchema, {
			source: 'payment',
			customerUUID: '00000000-0000-0000-0000-000000000000',
			currency: CURRENCY,
			metadata: null,
		});
		expect(item.productId).toBeNull();
		expect(item.subscriptionUUID).toBeNull();
		expect(item.metadata).toBeNull();
		expect(item.currency.id).toBe(7);
	});

	it('Subscription: non-null billing dates, nullable minimumCancellationDate, currency', () => {
		const sub = decodeWith(schemas.SubscriptionSchema, {
			uuid: 'sub@1',
			subscriptionStatus: 'paused_by_merchant',
			currency: CURRENCY,
		});
		expect(sub.lastBillingDate).toBe(ZERO_TIME);
		expect(sub.nextBillingDate).toBe(ZERO_TIME);
		expect(sub.minimumCancellationDate).toBeNull();
		expect(sub.reference).toBeNull();
		expect(sub.customerUUID).toBeNull();
		expect(sub.subscriptionStatus).toBe('paused_by_merchant'); // unknown enum kept raw
		expect(sub.currency.decimals).toBe(6);
	});

	it('RefundEntry: plain-string merchantMessage and txHash, nullable respondedAt and metadata', () => {
		const refund = decodeWith(schemas.RefundEntrySchema, {
			uuid: 'refund@1',
			merchantMessage: null,
			respondedAt: null,
		});
		expect(refund.merchantMessage).toBe('');
		expect(refund.txHash).toBe('');
		expect(refund.respondedAt).toBeNull();
		expect(refund.metadata).toBeNull();
		expect(refund.userId).toBe(0);
		expect(refund.organizationId).toBe(0);
	});

	it('Customer / ApiKey / User zero and nullable fields', () => {
		const customer = decodeWith(schemas.CustomerSchema, { uuid: 'c', organizationId: 1 });
		expect([customer.phoneNumber, customer.address, customer.reference]).toEqual(['', '', '']);
		expect(customer.userId).toBe(0);

		const key = decodeWith(schemas.ApiKeySchema, { id: 1 });
		expect(key.userId).toBe(0);
		expect(key.expiresAt).toBeNull();

		const user = decodeWith(schemas.UserSchema, { id: 1, role: 'owner' });
		expect(user.claimedAt).toBeNull();
		expect(user.role).toBe('owner');
	});

	it('TransactionStatus: zero txHash/message, nullable settlementDetails', () => {
		const status = decodeWith(schemas.TransactionStatusSchema, { status: 'created' });
		expect(status).toEqual({
			status: 'created',
			txHash: '',
			message: '',
			settlementDetails: null,
		});
	});

	it('sessions are decoded by txType', () => {
		const payment = decodeWith(schemas.SessionCheckoutSchema, {
			uuid: 'pay@1',
			txType: 'payment',
			availableCurrencies: null,
		});
		expect(isSubscriptionSession(payment)).toBe(false);
		expect(payment.availableCurrencies).toEqual([]);
		expect(payment.customerUUID).toBeNull();
		expect(payment.reference).toBe('');
		expect(payment.price).toBe(0);
		expect('frequency' in payment).toBe(false);

		const sub = decodeWith(schemas.SessionCheckoutSchema, {
			uuid: 'sub@1',
			txType: 'createSubscription',
			frequency: 2592000,
		});
		expect(isSubscriptionSession(sub)).toBe(true);
		expect(sub).toMatchObject({
			frequency: 2592000,
			trialPeriod: 0,
			minPeriods: 0,
			upgradingFromTrial: false,
		});
	});
});

describe('parseSessionWebhook', () => {
	const body = {
		uuid: 'pay@1',
		txType: 'payment',
		status: { status: 'completed', txHash: '0xabc' },
		session: { uuid: 'pay@1', txType: 'payment', productName: 'Coffee', price: 3.5 },
	};

	it('decodes a raw string, a Buffer, a Uint8Array or a parsed object alike', () => {
		const text = JSON.stringify(body);
		for (const input of [
			text,
			Buffer.from(text),
			new TextEncoder().encode(text),
			new TextEncoder().encode(text).buffer,
			body,
		]) {
			const event = parseSessionWebhook(input);
			expect(event.status?.status).toBe('completed');
			expect(event.status?.message).toBe('');
			expect(event.managementPageLink).toBe('');
			expect(event.session.productName).toBe('Coffee');
			expect(event.session.availableCurrencies).toEqual([]);
			expect(event.txType).toBe(TransactionType.ONE_TIME_PAYMENT);
		}
	});

	it('keeps a null status as null and decodes a subscription session', () => {
		const event = parseSessionWebhook({
			uuid: 'sub@1',
			txType: 'createSubscription',
			status: null,
			session: { uuid: 'sub@1', txType: 'createSubscription', frequency: 60 },
		});
		expect(event.status).toBeNull();
		expect(isSubscriptionSession(event.session)).toBe(true);
	});

	it('rejects invalid JSON with ValidationException and a wrong type with ServerException', () => {
		expect(() => parseSessionWebhook('{not json')).toThrow(ValidationException);
		expect(() => parseSessionWebhook(undefined)).toThrow(ValidationException);
		expect(() => parseSessionWebhook({ uuid: 5 })).toThrow(ServerException);
		expect(() => parseSessionWebhook({ uuid: 5 })).toThrow('uuid');
	});
});

describe('parseSubscriptionWebhook', () => {
	it('decodes a status transition', () => {
		const event = parseSubscriptionWebhook({
			subscriptionUUID: 'sub@1',
			type: 'status_transition',
			data: { previousStatus: 'active', currentStatus: 'low_on_funds', updatedAt: 'now' },
		});
		expect(event.subscriptionReference).toBe('');
		expect(isSubscriptionStatusTransitionWebhook(event)).toBe(true);
		if (isSubscriptionStatusTransitionWebhook(event)) {
			expect(event.data.currentStatus).toBe('low_on_funds');
		}
	});

	it('decodes a billing delivery as a SubscriptionHistory', () => {
		const event = parseSubscriptionWebhook(
			JSON.stringify({
				subscriptionUUID: 'sub@1',
				subscriptionReference: 'plan-pro',
				type: 'billing',
				data: { uuid: 'sub-hist@1', amount: 9.99, currency: CURRENCY, metadata: METADATA },
			})
		);
		expect(event.type).toBe(SubscriptionWebhookType.BILLING);
		expect(isSubscriptionBillingWebhook(event)).toBe(true);
		if (isSubscriptionBillingWebhook(event)) {
			expect(event.data.amount).toBe(9.99);
			expect(event.data.customerUUID).toBeNull();
			expect(event.data.currency.symbol).toBe('USDC');
			expect(event.data.metadata.feeBps).toBe(100);
		}
	});

	it('keeps an unknown type as its raw string with raw data', () => {
		const data = { anything: [1, 2] };
		const event = parseSubscriptionWebhook({ subscriptionUUID: 'sub@1', type: 'paused', data });
		expect(event.type).toBe('paused');
		expect(isSubscriptionBillingWebhook(event)).toBe(false);
		expect(isSubscriptionStatusTransitionWebhook(event)).toBe(false);
		expect(event.data).toEqual(data);
	});
});
