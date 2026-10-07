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
