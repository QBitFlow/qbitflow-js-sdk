import type { DecodeContext, Schema } from '../src/decode';
import {
	Chain,
	FeeLineType,
	LedgerEntryType,
	NetworkFeesPayer,
	RefundStatus,
	Role,
	TransactionKind,
} from '../src/enums';
import type { AccountingEvent } from '../src/models/accounting';
import type { SubscriptionSessionData } from '../src/models/checkout';
import type { Currency, CustomerSummary, Page, ReferralFee } from '../src/models/common';
import type { CreatedInvitation, HeldFunds, Invitation, Me, Member } from '../src/models/members';
import type { Payment, Transaction } from '../src/models/payments';
import type { Refund } from '../src/models/refunds';
import type { Subscription, TestBill } from '../src/models/subscriptions';
import type { Wallet } from '../src/models/wallets';
import * as S from '../src/schemas';
import { MODEL_FIXTURES } from './fixtures/models';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SCHEMAS: Record<string, Schema<any>> = {
	Currency: S.CurrencySchema,
	'Currency/native': S.CurrencySchema,
	Payment: S.PaymentSchema,
	PaymentCompleted: S.EVENT_DATA_SCHEMAS['payment.completed'],
	SubscriptionSessionData: S.SubscriptionSessionDataSchema,
	Bill: S.BillSchema,
	Transaction: S.TransactionSchema,
	Failure: S.FailureSchema,
	CreatedCheckoutSession: S.CreatedCheckoutSessionSchema,
	CheckoutSessionStatus: S.CheckoutSessionStatusSchema,
	Subscription: S.SubscriptionSchema,
	TestBill: S.TestBillSchema,
	Refund: S.RefundSchema,
	Customer: S.CustomerSchema,
	Product: S.ProductSchema,
	Member: S.MemberSchema,
	MemberJoined: S.EVENT_DATA_SCHEMAS['member.joined'],
	HeldFunds: S.HeldFundsSchema,
	MemberHeldFunds: S.MemberHeldFundsSchema,
	HeldFundsReleased: S.EVENT_DATA_SCHEMAS['heldFunds.released'],
	Wallet: S.WalletSchema,
	Invitation: S.InvitationSchema,
	CreatedInvitation: S.CreatedInvitationSchema,
	AccountingEvent: S.AccountingEventSchema,
	WebhookEndpointCreated: S.WebhookEndpointCreatedSchema,
	EventDetail: S.EventDetailSchema,
	Me: S.MeSchema,
	Page: S.page(S.CustomerSummarySchema),
};

const ctx: DecodeContext = {
	fail: (path, expected) => new Error(`${path} should be ${expected}`),
};

/** Decodes `json` with `schema`, a wrong type throwing `"<path> should be <expected>"`. */
const decode = <T>(schema: Schema<T>, json: string): T => schema.decode(JSON.parse(json), '', ctx);

function decodeStrict(name: string): { value: any; unknown: string[] } {
	const unknown: string[] = [];
	const value = SCHEMAS[name].decode(JSON.parse(MODEL_FIXTURES[name]), '', {
		fail: (path, expected) => new Error(`${name}: ${path} should be ${expected}`),
		unknown: (path) => unknown.push(path),
	});
	return { value, unknown };
}

const fixture = <T>(name: string): T => decodeStrict(name).value as T;

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
		const kb = Object.keys(b).sort();
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
		const wire = JSON.parse(MODEL_FIXTURES[name]);
		if (name === 'EventDetail') {
			// The envelope's decoder leaves `data` and `deliveries` to the event's own decoders,
			// and `data` is decoded eagerly by the event's type (the Go SDK keeps it raw),
			// so its absent fields come back at their zero values: compare the rest.
			expect(unknown).toEqual(['data', 'deliveries']);
			expect(value.data.uuid).toBe('pay@1');
			delete wire.data;
			delete value.data;
		} else {
			expect(unknown).toEqual([]);
		}
		expect(keysDiffer(wire, value, name)).toBe('');
	});
});

describe('model values', () => {
	it('a payment: token amount, USD amounts, settlement, refund state', () => {
		const p = fixture<Payment>('Payment');
		expect([p.amount, p.amountMinUnits, p.amountUsd, p.priceUsd, p.productName]).toEqual([
			'10',
			'10000000',
			'10',
			'8.5',
			'Pro',
		]);
		expect([p.currency.code, p.currency.chain, p.currency.mainCurrencyId]).toEqual([
			'BASE:USDC',
			Chain.BASE,
			3,
		]);
		expect([p.metadata.orderId, p.paid, p.paidUsd]).toEqual(['order-1', '10.0042', '10.0042']);
		expect([p.customer?.deleted, p.customer?.firstName]).toEqual([true, 'Ada']);
		expect([p.refund?.status, p.refund?.refundPercent, p.refund?.amount]).toEqual([
			RefundStatus.Approved,
			'50',
			'5.0021',
		]);
		expect(p.refund?.respondedAt).toBe('2026-10-01T13:00:00Z');
		expect([p.refundable, p.notRefundableReason]).toEqual([false, 'refundExists']);

		const st = p.settlement;
		expect([st.feePercent, st.organizationFee, st.referralFee?.feePercent]).toEqual([
			'0.99',
			{ address: '0xorg', feePercent: '10' },
			'20',
		]);
		expect([
			st.split?.merchant.amount,
			st.split?.platform.amountMinUnits,
			st.split?.networkFee?.amountUsd,
		]).toEqual(['8.9109', '79200', '0.0042']);
		const tx = st.transaction;
		expect([tx?.blockNumber, tx?.gasUsed, tx?.fee.amountMinUnits, tx?.nativePriceUsd]).toEqual([
			'52468103',
			95000,
			'1140000000000',
			'4512.37',
		]);
		expect(tx?.l1Fee?.amount).toBe('0.0000001');
		expect(Date.parse(tx?.blockTime ?? '')).toBe(Date.UTC(2026, 9, 1, 11, 59, 58));
		expect(p.fees).toEqual([
			{
				type: FeeLineType.Custom,
				label: 'VAT (20%)',
				description: 'French VAT',
				amountUsd: '1.30',
			},
			{ type: FeeLineType.ProcessingFee, label: 'Processing fee', amountUsd: '0.20' },
		]);
		expect('description' in p.fees[1]).toBe(false);
	});

	it('a native coin has no address nor main currency', () => {
		const native = fixture<Currency>('Currency/native');
		expect(['address' in native, 'mainCurrencyId' in native]).toEqual([false, false]);
		expect([native.code, native.decimals]).toEqual(['ETH', 18]);
	});

	it("a subscription session's amounts, currencies, metadata and terms", () => {
		const ss = fixture<SubscriptionSessionData>('SubscriptionSessionData');
		expect([ss.amountUsd, ss.priceUsd, ss.fees.length, ss.txType]).toEqual([
			'4.81',
			'3.99',
			2,
			'createSubscription',
		]);
		expect([ss.metadata.orderId, ss.frequency, ss.minPeriods, ss.upgradingFromTrial]).toEqual([
			'order-1044',
			{ value: 1, unit: 'months' },
			3,
			true,
		]);
	});

	it('a subscription: price, allowance, billing dates, metadata, dunning', () => {
		const sb = fixture<Subscription>('Subscription');
		expect(sb.priceUsd).toBe('9.99');
		expect(sb.allowance).toEqual({
			amount: '110',
			amountMinUnits: '110000000',
			amountUsd: '110',
			remainingPeriods: 0,
			maxPerPeriod: '30',
			maxPerPeriodMinUnits: '30000000',
		});
		expect([sb.lastBilledAt, sb.nextBillingAt, sb.cancellableAt]).toEqual([
			'2026-10-01T12:00:00Z',
			'2026-10-31T12:00:00Z',
			'2026-12-01T12:00:00Z',
		]);
		expect(sb.metadata).toEqual({ plan: 'pro', 'crm:account': 'A-1042' });
		expect(sb.managementPageLink).toContain('manage?uuid=sub@1');
		expect([sb.dunning?.remainingAttempts, sb.currency.symbol]).toEqual([3, 'USDC']);
	});

	it('a transactions feed row, a test bill, a refund', () => {
		const tx = fixture<Transaction>('Transaction');
		expect([tx.type, tx.priceUsd, tx.periodEnd, tx.metadata.k]).toEqual([
			TransactionKind.Bill,
			'8.5',
			'2026-10-31T12:00:00Z',
			'v',
		]);
		expect(tx.settlement.split).toBeDefined();

		const tb = fixture<TestBill>('TestBill');
		expect(tb.billUuid.startsWith('sub-hist@')).toBe(true);
		expect([tb.stage, tb.nextAttemptAt]).toEqual(['waiting', '2026-10-02T12:00:00Z']);

		const r = fixture<Refund>('Refund');
		expect([r.paid, r.refundPercent, r.amount, r.currency.id, r.customerUuid]).toEqual([
			'10.0042',
			'50',
			'5.0021',
			8,
			'c-1',
		]);
		expect(r.settlement?.transaction?.blockNumber).toBe('52468103');
	});

	it('an accounting refund row: decimal strings, the network fees apart, CSV order', () => {
		const ae = fixture<AccountingEvent>('AccountingEvent');
		expect([ae.currency, ae.currencyPriceUsd, ae.networkFeesPaidBy]).toEqual([
			'USDC',
			'1.00002',
			NetworkFeesPayer.Merchant,
		]);
		expect([
			ae.networkFeesCurrency,
			ae.networkFeesCurrencyDecimals,
			ae.networkFeesCurrencyPriceUsd,
		]).toEqual(['ETH', 18, '4512.37']);
		expect([ae.netAmount, ae.grossAmountMinUnits, ae.txUuid, ae.relatedTxUuid]).toEqual([
			'-10.0042',
			'-10004200',
			'refund@1',
			'pay@0',
		]);
		expect([ae.platformFeePercent, ae.txTimeUtc]).toEqual(['0.99', '2026-09-13T19:23:26.62Z']);
		for (const gone of [
			'paymentUuid',
			'relatedPaymentUuid',
			'paymentReference',
			'tokenSymbol',
		]) {
			expect(gone in ae).toBe(false);
		}
		// The fields come in the CSV's column order (the fixture's).
		expect(Object.keys(ae)).toEqual(Object.keys(JSON.parse(MODEL_FIXTURES.AccountingEvent)));
	});

	it('a referralFee row: only what the referrer earned; an absent fee is absent, never "0"', () => {
		const rf = decode(
			S.AccountingEventSchema,
			'{"txTimeUtc":"2026-09-13T19:23:26Z","type":"referralFee","referralFeeUsd":"0.02",' +
				'"chain":"SOL","currency":"SOL","currencyDecimals":9,"currencyPriceUsd":"150.5",' +
				'"referralFee":"0.000132","referralFeeMinUnits":"132000","referralFeePercent":"20",' +
				'"blockNumberOrSlot":"1"}'
		);
		expect([rf.type, rf.currency, rf.referralFee]).toEqual(['referralFee', 'SOL', '0.000132']);
		for (const absent of [
			'networkFeesPaidBy',
			'networkFeesCurrencyDecimals',
			'networkFees',
			'grossAmountUsd',
			'organizationFee',
			'tokenContractOrMint',
			'txUuid',
		]) {
			expect(absent in rf).toBe(false);
		}
	});

	it('keeps an unknown payer', () => {
		const ev = decode(
			S.AccountingEventSchema,
			'{"type":"refund","networkFeesPaidBy":"relayer"}'
		);
		expect(ev.networkFeesPaidBy).toBe('relayer');
	});

	it('a created invitation is flat; an invitation decodes without its optional fields', () => {
		const inv = fixture<CreatedInvitation>('CreatedInvitation');
		expect([inv.uuid, inv.test, inv.holdFunds, inv.organizationFeePercent]).toEqual([
			'i-1',
			true,
			false,
			'0',
		]);
		expect(inv.link).toBeTruthy();

		const bare = decode<Invitation>(
			S.InvitationSchema,
			'{"uuid":"i-2","email":"a@b.co","expiresAt":"2026-10-08T12:00:00Z",' +
				'"createdAt":"2026-10-01T12:00:00Z","status":"pending"}'
		);
		expect(bare.status).toBe('pending');
		for (const absent of ['test', 'holdFunds', 'organizationFeePercent', 'acceptedAt']) {
			expect(absent in bare).toBe(false);
		}
	});

	it('held funds, a wallet, a member, me, a page', () => {
		const hf = fixture<HeldFunds>('HeldFunds');
		expect(hf.totalUsd).toBe('-1.0933');
		expect(hf.ledgers[0].settlement).toBeDefined();
		expect('settlement' in hf.ledgers[1]).toBe(false);
		expect([hf.ledgers[1].type, hf.ledgers[1].owed, hf.ledgers[1].refundedTxUuid]).toEqual([
			LedgerEntryType.Refund,
			'-10.0042',
			'pay@1',
		]);

		const w = fixture<Wallet>('Wallet');
		expect([w.address, w.currency.code, w.tokenWallets[0].currency.code]).toEqual([
			'0xpk',
			'ETH',
			'BASE:USDC',
		]);
		expect([w.tokenWallets[0].balance?.amount, w.tokenWallets[0].balance?.currency.id]).toEqual(
			['12.5', 8]
		);

		const m = fixture<Member>('Member');
		expect([m.firstName, m.organizationFeePercent]).toEqual(['Ada', '7.5']);
		expect(m.acceptedCurrencies.map((c) => c.code)).toEqual(['BASE:USDC']);

		const me = fixture<Me>('Me');
		expect([me.onBehalfOfUserUuid, me.space?.role, me.space?.organizationFeePercent]).toEqual([
			'm-1',
			Role.Admin,
			'7.5',
		]);
		expect([me.space?.member?.firstName, me.space?.trustedAt]).toEqual([
			'Ada',
			'2026-10-01T12:00:00Z',
		]);
		// The session-only fields (user, spaces, reauthenticatedUntil) are not modelled: kept raw.
		const me2 = decode<Me>(
			S.MeSchema,
			'{"credential":"apiKey","apiKeyUuid":"k-2","spaces":[],"user":{"uuid":"u"}}'
		);
		expect(me2.apiKeyUuid).toBe('k-2');
		// The staff console's `space.staffView` is not modelled either (not typed; decoding accepts it).
		const me3 = decode<Me>(
			S.MeSchema,
			'{"credential":"apiKey","space":{"uuid":"s-1","createdAt":"2026-09-01T12:00:00Z","staffView":false}}'
		);
		expect(me3.space?.uuid).toBe('s-1');

		const page = fixture<Page<CustomerSummary>>('Page');
		expect([page.hasMore, page.nextCursor, page.items.length]).toEqual([
			true,
			'djF8MDE5Y2FkZmQ',
			1,
		]);
	});
});

describe('out-of-scope wire elements still decode', () => {
	/** Decodes `name`'s fixture with `patch` applied, collecting the unmodelled keys. */
	function decodePatched(
		name: string,
		patch: (wire: any) => void
	): { value: any; unknown: string[] } {
		const wire = JSON.parse(MODEL_FIXTURES[name]);
		patch(wire);
		const unknown: string[] = [];
		const value = SCHEMAS[name].decode(wire, '', { ...ctx, unknown: (p) => unknown.push(p) });
		return { value, unknown };
	}

	it('session-only and qbf.cash fields stay untyped, their enum values raw strings', () => {
		const me = decodePatched('Me', (w) => {
			w.userUuid = 'u-1';
			w.space.role = 'handle';
		});
		expect(me.unknown).toEqual(['userUuid']);
		expect(me.value.space.role).toBe('handle');

		const pay = decodePatched('Payment', (w) => (w.note = 'thanks'));
		expect(pay.unknown).toEqual(['note']);
		const done = decodePatched('PaymentCompleted', (w) => (w.note = 'thanks'));
		expect(done.unknown).toEqual(['note']);

		const ss = decodePatched('SubscriptionSessionData', (w) => {
			w.redirectUrl = 'https://x/thanks';
			w.txType = 'transfer';
		});
		expect(ss.unknown).toEqual(['redirectUrl']);
		expect(ss.value.txType).toBe('transfer');
	});

	it('the elements left out of the SDK (dashboard-only, or constant for a key) are ignored', () => {
		const me = decodePatched('Me', (w) => (w.credential = 'apiKey'));
		expect(me.unknown).toEqual(['credential']);

		const customer = decodePatched('Customer', (w) => (w.verified = true));
		expect(customer.unknown).toEqual(['verified']);

		// An API key only lists member invitations: their role is always `user`.
		const invitation = decodePatched('Invitation', (w) => (w.role = 'user'));
		expect(invitation.unknown).toEqual(['role']);

		const endpoint = decodePatched('WebhookEndpointCreated', (w) => {
			w.payloadVersion = 'v2';
			w.rotatedAt = '2026-10-01T12:00:00Z';
		});
		expect(endpoint.unknown).toEqual(['payloadVersion', 'rotatedAt']);

		const session = decodePatched('SubscriptionSessionData', (w) => {
			w.organizationName = 'Shop';
			w.userName = 'Ada';
			w.availableCurrencies = [{ id: 8, code: 'BASE:USDC' }];
		});
		expect(session.unknown).toEqual(['organizationName', 'userName', 'availableCurrencies']);

		const status = decodePatched('CheckoutSessionStatus', (w) => {
			w.lastAttempt.status = 'failed';
		});
		expect(status.unknown).toEqual(['lastAttempt.status']);

		const released = decodePatched('HeldFundsReleased', (w) => (w.type = 'heldFundsRelease'));
		expect(released.unknown).toEqual(['type']);

		const detail = decodePatched('EventDetail', (w) => (w.version = 'v2'));
		expect(detail.unknown).toContain('version');
		expect(detail.value.id).toBe('evt_1');

		// A refund status the SDK doesn't list still decodes, raw.
		const refund = decodePatched('Refund', (w) => (w.status = 'failed'));
		expect([refund.unknown, refund.value.status]).toEqual([[], 'failed']);
	});

	it('the role `owner` is not modelled: a key is at most admin, yet `owner` decodes raw', () => {
		expect(Object.values(Role)).toEqual(['admin', 'user']);
		// @ts-expect-error Role has no Owner: an API key is at most admin.
		void Role.Owner;
		const me = decodePatched('Me', (w) => (w.space.role = 'owner'));
		expect(me.unknown).toEqual([]);
		expect(me.value.space.role).toBe('owner');
	});

	it("a referral fee's internal deadline is not modelled, and decoding ignores it", () => {
		const pay = decodePatched(
			'Payment',
			(w) => (w.settlement.referralFee.deadline = '2027-01-01T00:00:00Z')
		);
		expect(pay.unknown).toEqual(['settlement.referralFee.deadline']);
		const fee: ReferralFee = (pay.value as Payment).settlement.referralFee!;
		expect([fee.address, fee.feePercent]).toEqual(['0xref', '20']);
		// @ts-expect-error ReferralFee is { address, feePercent }: no deadline.
		void fee.deadline;
	});

	it('a skipped delivery attempt (a policy off) has no statusCode', () => {
		const detail = decodePatched('EventDetail', (w) => {
			const a = w.deliveries[0].attempts[0];
			delete a.statusCode;
			a.error = 'the members.webhooks policy is off for this member';
		});
		const attempt = detail.value.deliveries[0].attempts[0];
		expect([attempt.delivered, attempt.skipped, attempt.error]).toEqual([
			false,
			true,
			'the members.webhooks policy is off for this member',
		]);
		expect('statusCode' in attempt).toBe(false);
	});
});

describe('optional fields', () => {
	it('every optional field absent decodes as absent, every list as []', () => {
		const sub = decode<Subscription>(
			S.SubscriptionSchema,
			'{"uuid":"sub@1","to":"0xt","status":"trial","priceUsd":"9.99","fees":[],"metadata":{},' +
				`"currency":${'{"id":8,"code":"BASE:USDC"}'},"frequency":{"value":1,"unit":"months"},` +
				'"currentPeriodEnd":"2026-10-15T12:00:00Z"}'
		);
		for (const absent of [
			'from',
			'productUuid',
			'subscriptionHash',
			'allowance',
			'lastBilledAt',
			'nextBillingAt',
			'cancellableAt',
			'dunning',
			'actionRequired',
			'accessUntil',
		]) {
			expect(absent in sub).toBe(false);
		}
		expect(sub.currentPeriodEnd).toBe('2026-10-15T12:00:00Z');

		const pay = decode<Payment>(
			S.PaymentSchema,
			'{"uuid":"pay@1","amount":"10","priceUsd":"10","fees":[],"metadata":{},' +
				'"settlement":{"feePercent":"0.99"}}'
		);
		expect(['split' in pay.settlement, 'transaction' in pay.settlement]).toEqual([
			false,
			false,
		]);
		for (const absent of [
			'confirmedAt',
			'paid',
			'refund',
			'refundable',
			'customer',
			'productDescription',
		]) {
			expect(absent in pay).toBe(false);
		}

		const ref = decode<Refund>(
			S.RefundSchema,
			'{"uuid":"refund@1","txUuid":"pay@1","status":"pending","paid":"10","paidMinUnits":"10000000",' +
				'"refundPercent":"100","amount":"10","amountMinUnits":"10000000"}'
		);
		for (const absent of [
			'reason',
			'merchantMessage',
			'respondedAt',
			'txHash',
			'paidUsd',
			'amountUsd',
			'settlement',
			'approval',
		]) {
			expect(absent in ref).toBe(false);
		}
	});

	it('lenient on absence and null: zero values, never an error', () => {
		const nulls = decode(
			S.ProductSchema,
			'{"uuid":"p-1","description":null,"metadata":null,"subscription":null,"priceUsd":null}'
		);
		expect([nulls.priceUsd, nulls.metadata, 'description' in nulls]).toEqual(['', {}, false]);
		expect('subscription' in nulls).toBe(false);
		// A required object absent: its zero value (a payment's currency, its settlement).
		const bare = decode(S.PaymentSchema, '{"uuid":"pay@1"}');
		expect([bare.currency.code, bare.settlement.feePercent, bare.metadata]).toEqual([
			'',
			'',
			{},
		]);
	});
});

describe('strict types', () => {
	it.each([
		['payment amount as a number', S.PaymentSchema, '{"amount":10}', 'amount'],
		['payment priceUsd as a number', S.PaymentSchema, '{"priceUsd":8.5}', 'priceUsd'],
		[
			'fee amountUsd as a number',
			S.PaymentSchema,
			'{"fees":[{"amountUsd":2}]}',
			'fees[0].amountUsd',
		],
		['fees as an object', S.PaymentSchema, '{"fees":{"type":"custom"}}', 'fees'],
		[
			'settlement feePercent as a number',
			S.PaymentSchema,
			'{"settlement":{"feePercent":0.99}}',
			'settlement.feePercent',
		],
		['product priceUsd as a number', S.ProductSchema, '{"priceUsd":1e2}', 'priceUsd'],
		[
			'member fee percent as a number',
			S.MemberSchema,
			'{"organizationFeePercent":5}',
			'organizationFeePercent',
		],
		['refund percent as a number', S.RefundSchema, '{"refundPercent":100}', 'refundPercent'],
		['held funds total as a number', S.HeldFundsSchema, '{"totalUsd":-10}', 'totalUsd'],
		[
			'balance amount as a number',
			S.WalletSchema,
			'{"tokenWallets":[{"balance":{"amount":12.5}}]}',
			'tokenWallets[0].balance.amount',
		],
		[
			'accounting gross as a number',
			S.AccountingEventSchema,
			'{"grossAmount":-10.0042}',
			'grossAmount',
		],
		['currency as an id', S.PaymentSchema, '{"currency":8}', 'currency'],
		['allowance as a string', S.SubscriptionSchema, '{"allowance":"110000000"}', 'allowance'],
		[
			'page hasMore as a string',
			S.page(S.ProductSchema),
			'{"items":[],"hasMore":"false"}',
			'hasMore',
		],
		['metadata value as a number', S.CustomerSchema, '{"metadata":{"k":1}}', 'metadata.k'],
		['metadata as a list', S.CustomerSchema, '{"metadata":[]}', 'metadata'],
	] as Array<[string, Schema<unknown>, string, string]>)('%s', (_name, schema, json, path) => {
		expect(() => decode(schema, json)).toThrow(`${path} should be`);
	});

	it('integral floats into integer fields', () => {
		const f = decode(S.FailureSchema, '{"attempt":2.0,"currency":{"id":8.0,"decimals":6.0}}');
		expect([f.attempt, f.currency.id, f.currency.decimals]).toEqual([2, 8, 6]);
		const s = decode(
			S.SubscriptionSchema,
			'{"allowance":{"amount":"1","amountMinUnits":"1","remainingPeriods":11.0}}'
		);
		expect(s.allowance?.remainingPeriods).toBe(11);
	});

	it('a null metadata value decodes to an empty string', () => {
		expect(decode(S.CustomerSchema, '{"metadata":{"k":null,"v":"x"}}').metadata).toEqual({
			k: '',
			v: 'x',
		});
	});
});

describe('checkout fees in the models', () => {
	it('an empty list, a null list, a line without description, an unknown line type kept', () => {
		const none = decode(
			S.PaymentSchema,
			'{"uuid":"pay@1","amount":"10","priceUsd":"10","fees":[]}'
		);
		expect([none.priceUsd, none.fees]).toEqual(['10', []]);
		const absent = decode(S.PaymentSchema, '{"uuid":"pay@1","fees":null}');
		expect([absent.priceUsd, absent.fees]).toEqual(['', []]);

		const p = decode(
			S.PaymentSchema,
			'{"amountUsd":"12.03","priceUsd":"10","fees":[{"type":"tip","label":"Tip","amountUsd":"2"},' +
				'{"type":"processingFee","label":"Processing fee","description":null,"amountUsd":"0.03"}]}'
		);
		expect([p.fees[0].type, p.fees[0].amountUsd, p.fees[1].type]).toEqual([
			'tip',
			'2',
			FeeLineType.ProcessingFee,
		]);
		expect('description' in p.fees[1]).toBe(false);
	});

	it("a subscription's price and fees", () => {
		const sb = fixture<Subscription>('Subscription');
		expect(sb.fees).toEqual([
			{ type: 'custom', label: 'VAT (20%)', description: 'French VAT', amountUsd: '1.30' },
			{ type: 'processingFee', label: 'Processing fee', amountUsd: '0.20' },
		]);
		expect(decode(S.SubscriptionSchema, '{"uuid":"sub@1","fees":null}').fees).toEqual([]);
		expect(decode(S.SubscriptionSchema, '{"uuid":"sub@1"}').fees).toEqual([]);
	});
});

describe('metadata', () => {
	it('keeps a `__proto__` key (a valid metadata key) as an own entry', () => {
		const c = decode<{ metadata: Record<string, string> }>(
			S.CustomerSchema,
			'{"uuid":"c-1","metadata":{"__proto__":"x","a":"b"}}'
		);
		expect(Object.prototype.hasOwnProperty.call(c.metadata, '__proto__')).toBe(true);
		expect(Object.getPrototypeOf(c.metadata)).toBe(Object.prototype);
		expect(Object.entries(c.metadata)).toEqual([
			['__proto__', 'x'],
			['a', 'b'],
		]);
	});

	it('hostile `__proto__` / `constructor` keys never touch a prototype', () => {
		const c = decode(
			S.PaymentSchema as unknown as Schema<Record<string, unknown>>,
			'{"uuid":"pay@1","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},' +
				'"settlement":{"__proto__":{"polluted":true}},"metadata":{"constructor":"x"}}'
		);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
		expect(Object.getPrototypeOf(c.settlement)).toBe(Object.prototype);
		expect((c as { polluted?: unknown }).polluted).toBeUndefined();
		expect((c.metadata as Record<string, string>).constructor).toBe('x');
	});
});
