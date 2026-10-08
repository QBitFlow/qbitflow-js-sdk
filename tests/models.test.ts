import type { Schema } from '../src/decode';
import type { Payment } from '../src/models/payments';
import * as S from '../src/schemas';
import { MODEL_FIXTURES } from './fixtures/models';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SCHEMAS: Record<string, Schema<any>> = {
	Currency: S.CurrencySchema,
	Payment: S.PaymentSchema,
	Bill: S.BillSchema,
	CombinedPayment: S.CombinedPaymentSchema,
	Failure: S.FailureSchema,
	CheckoutSession: S.CheckoutSessionSchema,
	CheckoutSessionStatus: S.CheckoutSessionStatusSchema,
	Subscription: S.SubscriptionSchema,
	BillingState: S.BillingStateSchema,
	Refund: S.RefundSchema,
	Customer: S.CustomerSchema,
	Product: S.ProductSchema,
	Member: S.MemberSchema,
	HeldFunds: S.HeldFundsSchema,
	MemberHeldFundsSummary: S.MemberHeldFundsSummarySchema,
	Wallet: S.WalletSchema,
	Invitation: S.InvitationSchema,
	InvitationCreated: S.InvitationCreatedSchema,
	AccountingEvent: S.AccountingEventSchema,
	WebhookEndpointCreated: S.WebhookEndpointCreatedSchema,
	Me: S.MeSchema,
	Page: S.page(S.CustomerSummarySchema),
};

function decodeStrict(name: string): { value: any; unknown: string[] } {
	const unknown: string[] = [];
	const value = SCHEMAS[name].decode(JSON.parse(MODEL_FIXTURES[name]), '', {
		fail: (path, expected) => new Error(`${name}: ${path} should be ${expected}`),
		unknown: (path) => unknown.push(path),
	});
	return { value, unknown };
}

/** The object keys of two JSON trees differ at the returned path ('' when equal). */
function keysDiffer(a: any, b: any, path: string): string {
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return path;
		for (let i = 0; i < a.length; i++) {
			const d = keysDiffer(a[i], b[i], `${path}[]`);
			if (d) return d;
		}
	} else if (a !== null && typeof a === 'object') {
		if (b === null || typeof b !== 'object') return path;
		const ka = Object.keys(a).sort();
		const kb = Object.keys(b)
			.sort()
			.filter((k) => k !== 'hasMore');
		if (ka.join() !== kb.join())
			return `${path} ${JSON.stringify(ka)} vs ${JSON.stringify(kb)}`;
		for (const k of ka) {
			const d = keysDiffer(a[k], b[k], `${path}.${k}`);
			if (d) return d;
		}
	}
	return '';
}

describe('models match the wire', () => {
	it('covers every fixture', () => {
		expect(Object.keys(SCHEMAS).sort()).toEqual(Object.keys(MODEL_FIXTURES).sort());
	});

	it.each(Object.keys(MODEL_FIXTURES))('%s: every wire key is modelled, none is lost', (name) => {
		const { value, unknown } = decodeStrict(name);
		expect(unknown).toEqual([]);
		expect(keysDiffer(JSON.parse(MODEL_FIXTURES[name]), value, name)).toBe('');
	});

	it('decodes the values', () => {
		const p = decodeStrict('Payment').value as Payment;
		expect(p.customer?.deleted).toBe(true);
		expect(p.refund?.respondedAt).toBeNull();
		expect(p.refundable).toBe(false);
		expect(p.notRefundableReason).toBe('refundExists');
		expect(p.metadata.organizationFee?.feePercent).toBe(10);
		expect(p.metadata.txAmounts.usd.organization).toBe(0.98);

		const inv = decodeStrict('InvitationCreated').value;
		expect([inv.invitation.test, inv.invitation.trustLayer, inv.invitation.role]).toEqual([
			null,
			null,
			'admin',
		]);
		expect(inv.link).toBeTruthy();

		const hf = decodeStrict('HeldFunds').value;
		expect(hf.totalAmount).toBeLessThan(0);
		expect(hf.ledgers[0].metadata).toBeNull();
		expect(hf.ledgers[0].owedMinUnits).toBe('-10004200');

		const page = decodeStrict('Page').value;
		expect([page.nextCursor, page.hasMore]).toEqual(['c-1', true]);

		// Integral floats into integer fields; integers into percent floats.
		const m = S.MemberSchema.decode(
			JSON.parse('{"organizationFeePercent":2,"acceptedCurrencyIds":[8.0]}'),
			'',
			{
				fail: () => new Error('bad'),
			}
		);
		expect([m.organizationFeePercent, m.acceptedCurrencyIds[0]]).toEqual([2, 8]);
	});
});

describe('checkout fees in the models', () => {
	const ctx = {
		fail: (path: string, expected: string) => new Error(`${path} should be ${expected}`),
	};
	const payment = (extra: string): Payment =>
		S.PaymentSchema.decode(
			JSON.parse(`{"uuid":"pay@1","amount":10,"metadata":null${extra}}`),
			'',
			ctx
		);

	it('a payment with its price and fees', () => {
		const p = decodeStrict('Payment').value as Payment;
		expect([p.amount, p.price]).toEqual([10, 8.5]);
		expect(p.fees).toEqual([
			{ type: 'custom', label: 'VAT (20%)', description: 'France', amountUsd: '1.35' },
			{ type: 'processingFee', label: 'Processing fee', amountUsd: '0.15' },
		]);
		expect('description' in p.fees[1]).toBe(false);
		// amount = price + Σ fees, the decimal strings untouched.
		const cents = p.fees.reduce((sum, f) => sum + Math.round(Number(f.amountUsd) * 100), 0);
		expect(Math.round(p.price * 100) + cents).toBe(Math.round(p.amount * 100));
	});

	it('a payment without fees (or recorded before them)', () => {
		const withPrice = payment(',"price":10');
		expect([withPrice.price, withPrice.fees]).toEqual([10, []]);
		const before = payment('');
		expect([before.price, before.fees]).toEqual([0, []]);
		expect(payment(',"price":10,"fees":null').fees).toEqual([]);
	});

	it('keeps an unknown line type; refuses a wrong JSON type', () => {
		const p = payment(
			',"price":9,"fees":[{"type":"giftWrap","label":"Gift wrap","amountUsd":"1"}]'
		);
		expect(p.fees[0].type).toBe('giftWrap');
		expect(() => payment(',"fees":[{"type":"custom","label":"VAT","amountUsd":1.5}]')).toThrow(
			'fees[0].amountUsd should be a string'
		);
		expect(() => payment(',"fees":{}')).toThrow('fees should be an array');
		expect(() => payment(',"price":"10"')).toThrow('price should be a number');
	});

	it("a payment session's fees and amount", () => {
		const s = S.PaymentSessionDataSchema.decode(
			JSON.parse(
				'{"uuid":"pay@1","txType":"payment","price":4.99,"amount":6,"organizationName":"Shop","test":true,' +
					'"availableCurrencyIds":[8],"fees":[{"type":"custom","label":"Shipping","description":"Standard, 3 to 5 days","amountUsd":"0.75"},' +
					'{"type":"processingFee","label":"Processing fee","amountUsd":"0.26"}]}'
			),
			'',
			ctx
		);
		expect([s.price, s.amount, s.fees.length]).toEqual([4.99, 6, 2]);
		expect(s.fees[0]).toEqual({
			type: 'custom',
			label: 'Shipping',
			description: 'Standard, 3 to 5 days',
			amountUsd: '0.75',
		});
		expect(s.fees[1].type).toBe('processingFee');

		const plain = S.PaymentSessionDataSchema.decode(
			JSON.parse('{"uuid":"pay@1","txType":"payment","price":4.99}'),
			'',
			ctx
		);
		expect([plain.fees, plain.amount, 'amount' in plain]).toEqual([[], undefined, false]);
	});
});
