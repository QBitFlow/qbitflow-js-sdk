import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EventType, FeeLineType, LedgerEntryType } from '../src/enums';
import { ValidationError } from '../src/errors';
import { hasAccess } from '../src/helpers';
import type { Event, KnownEvent } from '../src/models/events';
import type { Refund } from '../src/models/refunds';
import { EVENT_DATA_SCHEMAS, EventDetailSchema } from '../src/schemas';
import { decodeResponse } from '../src/transport';
import {
	eventData,
	isEventType,
	isSubscriptionSession,
	isUnknownEvent,
	parseEvent,
} from '../src/webhooks';
import { thrown } from './helpers/server';

/**
 * The docs' example body of each event type (docs/api webhooks.md § Examples, generated from the
 * API's code), as the Go SDK's testdata.
 */
const FIXTURES = join(__dirname, 'fixtures', 'events');
const raw = (type: string): string => readFileSync(join(FIXTURES, `${type}.json`), 'utf8');

function load(type: string): Event {
	const e = parseEvent(raw(type));
	expect(e.type).toBe(type);
	expect(e.version).toBe('v2');
	expect(e.id.startsWith('evt_')).toBe(true);
	expect(Date.parse(e.createdAt)).not.toBeNaN();
	return e;
}

const KNOWN = Object.values(EventType);

describe('the 15 docs fixtures', () => {
	it('cover every known type', () => {
		expect(
			readdirSync(FIXTURES)
				.map((f) => f.replace(/\.json$/, ''))
				.sort()
		).toEqual([...KNOWN].sort());
	});

	it.each(KNOWN)('%s is fully modelled', (type) => {
		const data = JSON.parse(raw(type)).data;
		const unknown: string[] = [];
		EVENT_DATA_SCHEMAS[type].decode(data, 'data', {
			fail: (path) => new Error(`bad ${path}`),
			unknown: (path) => unknown.push(path),
		});
		expect(unknown).toEqual([]);
		expect(isUnknownEvent(load(type))).toBe(false);
	});
});

describe('typed data', () => {
	it('payment.completed', () => {
		const e = load('payment.completed');
		if (!isEventType(e, 'payment.completed')) throw new Error('narrowing');
		const p = e.data;
		expect(p.uuid).toBe('pay@01a0f755-f200-7000-8000-000000000001');
		expect([p.amount, p.amountMinUnits, p.amountUsd, p.reference, p.customerReference]).toEqual(
			['10', '10000000', '10', 'order-1042', 'crm-5521']
		);
		expect([p.chain, p.productName]).toEqual(['BASE', 'Pro plan (lifetime)']);
		expect(p.managementPageLink).toBeTruthy();
		expect([p.paid, p.paidMinUnits, p.paidUsd]).toEqual(['10.0042', '10004200', '10.0042']);
		expect(p.metadata).toMatchObject({ orderId: 'order-1042', 'crm:customer': 'C-5521' });
		const c = p.currency;
		expect([c.code, c.symbol, c.chain, c.mainCurrencyId]).toEqual([
			'BASE:USDC',
			'USDC',
			'BASE',
			3,
		]);
		expect(c.address).toBeTruthy();
		const st = p.settlement;
		expect([
			st.feePercent,
			st.split?.merchant.amountMinUnits,
			st.split?.platform.amount,
		]).toEqual(['0.99', '9901000', '0.099']);
		expect(st.split?.networkFee?.amount).toBe('0.0042');
		for (const absent of ['organization', 'referral'])
			expect(absent in (st.split ?? {})).toBe(false);
		expect(['organizationFee' in st, 'referralFee' in st]).toEqual([false, false]);
		const tx = st.transaction;
		expect([tx?.blockNumber, tx?.gasUsed, tx?.nativePriceUsd, tx?.fee.amountUsd]).toEqual([
			'52468103',
			95000,
			'4512.37',
			'0.005144',
		]);
		expect(tx && 'l1Fee' in tx).toBe(false);
		// Webhooks never carry the API-only fields.
		expect([p.customer, p.refund, p.refundable, p.notRefundableReason]).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
		]);
		expect(p.confirmedAt && p.checkoutOpenedAt).toBeTruthy();
		// The docs' payment has a price and no fees: amountUsd = priceUsd.
		expect([p.priceUsd, p.fees, p.amountUsd]).toEqual(['10', [], p.priceUsd]);
	});

	it('subscriptions', () => {
		const created = eventData(load('subscription.created'), 'subscription.created');
		expect(created.uuid.startsWith('sub@')).toBe(true);
		expect([created.frequency, created.status, created.priceUsd]).toEqual([
			{ value: 1, unit: 'months' },
			'active',
			'10',
		]);
		expect(
			created.currentPeriodEnd &&
				created.nextBillingAt &&
				created.lastBilledAt &&
				created.managementPageLink
		).toBeTruthy();
		expect([created.metadata.plan, created.reference, created.currency.code]).toEqual([
			'pro',
			'customer-7731',
			'BASE:USDC',
		]);
		expect([
			created.allowance?.amount,
			created.allowance?.remainingPeriods,
			created.allowance?.maxPerPeriodMinUnits,
		]).toEqual(['110', 11, '30000000']);
		expect(created.dunning).toBeUndefined();
		const end = Date.parse(created.currentPeriodEnd ?? '');
		expect(hasAccess(created, new Date(Date.UTC(2026, 9, 30)))).toBe(true);
		expect(hasAccess(created, new Date(end))).toBe(false);

		// subscription.billed is nested: {bill, subscription}.
		const { bill, subscription } = eventData(
			load('subscription.billed'),
			'subscription.billed'
		);
		expect(bill.uuid.startsWith('sub-hist@')).toBe(true);
		expect([bill.subscriptionUuid, bill.amount, bill.productName, bill.paid]).toEqual([
			subscription.uuid,
			'10',
			'Pro plan',
			'10.0042',
		]);
		expect(bill.periodStart && bill.periodEnd && bill.settlement.split).toBeTruthy();
		expect(bill.settlement.feePercent).toBe('0.99');
		expect([
			subscription.status,
			subscription.reference,
			subscription.metadata['crm:account'],
		]).toEqual(['active', 'customer-7731', 'A-1042']);
		expect(Date.parse(subscription.nextBillingAt ?? '')).toBe(Date.parse(bill.periodEnd ?? ''));

		const changed = eventData(load('subscription.statusChanged'), 'subscription.statusChanged');
		expect([changed.previousStatus, changed.status]).toEqual(['pastDue', 'active']);
		expect(changed.managementPageLink).toBeTruthy();

		const action = eventData(
			load('subscription.actionRequiredChanged'),
			'subscription.actionRequiredChanged'
		);
		expect(action.actionRequired).toBe('topUpAllowance');
		expect('previousActionRequired' in action).toBe(false);
		expect(action.allowance?.remainingPeriods).toBe(0);

		const failed = eventData(load('subscription.billingFailed'), 'subscription.billingFailed');
		expect([
			failed.reason,
			failed.amountUsd,
			failed.attempt,
			failed.remainingAttempts,
			failed.billUuid,
			failed.failureCode,
			failed.status,
		]).toEqual([
			'insufficientBalance',
			'10',
			1,
			4,
			'sub-hist@01a0f755-f200-7000-8000-000000000005',
			'insufficient_funds',
			'pastDue',
		]);
		expect(failed.nextAttemptAt && failed.managementPageLink).toBeTruthy();

		const upcoming = eventData(load('subscription.upcomingBill'), 'subscription.upcomingBill');
		expect([upcoming.amountUsd, upcoming.trialEnding, upcoming.balanceSufficient]).toEqual([
			'10',
			false,
			true,
		]);
		expect(Date.parse(upcoming.billingAt)).toBe(Date.UTC(2026, 9, 4, 12));
		expect(upcoming.allowanceSufficient).toBeDefined();
	});

	it.each<[KnownEvent['type'], string]>([
		['refund.requested', 'pending'],
		['refund.approved', 'approved'],
		['refund.rejected', 'rejected'],
	])('%s', (type, status) => {
		const r = load(type).data as Refund;
		expect(r.status).toBe(status);
		expect(r.uuid.startsWith('refund@') && r.txUuid.startsWith('pay@')).toBe(true);
		expect([r.initiatedBy, r.paid, r.currency.code]).toEqual([
			'customer',
			'10.0042',
			'BASE:USDC',
		]);
		expect(r.refundPercent && r.reason).toBeTruthy();
		expect(r.respondedAt === undefined).toBe(status === 'pending');
		for (const absent of ['approval', 'customer', 'customerUuid', 'productName'])
			expect(absent in r).toBe(false);
	});

	it('refund amounts, settlement and messages', () => {
		const approved = eventData(load('refund.approved'), 'refund.approved');
		expect([approved.refundPercent, approved.amount]).toEqual(['50', '5.0021']);
		expect(
			approved.settlement?.transaction && approved.txHash && approved.explorerUrl
		).toBeTruthy();
		expect('merchantMessage' in approved).toBe(false);
		const rejected = eventData(load('refund.rejected'), 'refund.rejected');
		expect(rejected.merchantMessage).toBeTruthy();
		expect(['settlement' in rejected, 'txHash' in rejected]).toEqual([false, false]);
		const requested = eventData(load('refund.requested'), 'refund.requested');
		expect([requested.refundPercent, requested.amount]).toEqual(['100', requested.paid]);
	});

	it('members and held funds', () => {
		const joined = eventData(load('member.joined'), 'member.joined');
		expect(joined.userUuid && joined.invitationUuid && joined.spaceUuid).toBeTruthy();
		expect([joined.firstName, joined.organizationFeePercent, 'trustedAt' in joined]).toEqual([
			'Alice',
			'5',
			false,
		]);
		expect(joined.acceptedCurrencies.map((c) => c.id)).toEqual([8]);
		expect(Date.parse(joined.joinedAt)).not.toBeNaN();
		const removed = eventData(load('member.removed'), 'member.removed');
		expect([removed.lastName, Boolean(removed.trustedAt), Boolean(removed.userUuid)]).toEqual([
			'Martin',
			true,
			true,
		]);

		const e = load('heldFunds.released');
		expect(e.userUuid).toBe('019eca82-5680-7b00-8000-0000000000b1');
		const released = eventData(e, 'heldFunds.released');
		expect([released.received, released.type, released.ledgers.length]).toEqual([
			true,
			'heldFundsRelease',
			3,
		]);
		expect([released.amount, released.amountUsd, released.currency.code]).toEqual([
			'98.9068',
			'98.9068',
			'BASE:USDC',
		]);
		expect(released.uuid.startsWith('transfer@')).toBe(true);
		expect(released.settlement.transaction).toBeDefined();
		const first = released.ledgers[0];
		expect([
			first.type,
			first.owed,
			first.owedMinUnits,
			first.owedUsd,
			first.amountUsd,
		]).toEqual([LedgerEntryType.Payment, '99.01', '99010000', '99.01', '100']);
		expect(first.settlement?.split).toBeDefined();
		const refund = released.ledgers[2];
		expect([refund.type, 'settlement' in refund]).toEqual([LedgerEntryType.Refund, false]);
		expect(refund.refundedTxUuid).toBeTruthy();
		expect(refund.owedMinUnits.startsWith('-')).toBe(true);
		// amount is the sum of the lines' owed (exact, in min units).
		const sum = released.ledgers.reduce((acc, l) => acc + BigInt(l.owedMinUnits), 0n);
		expect(sum.toString()).toBe(released.amountMinUnits);
	});

	it('checkout.expired: payment, with fees, subscription, unknown txType', () => {
		const p = eventData(load('checkout.expired'), 'checkout.expired');
		expect(isSubscriptionSession(p)).toBe(false);
		expect([p.txType, p.priceUsd, p.amountUsd, p.availableCurrencies.length]).toEqual([
			'payment',
			'10',
			'10',
			2,
		]);
		expect('address' in p.availableCurrencies[0]).toBe(false);
		expect(p.availableCurrencies[1].code).toBe('BASE:USDC');
		expect([p.metadata.orderId, p.organizationName, p.reference, p.redirectUrl]).toEqual([
			'order-1043',
			'Example Shop',
			'order-1043',
			undefined,
		]);
		expect(p.expiresAt && p.createdAt).toBeTruthy();
		// The docs' session has no fees.
		expect(p.fees).toEqual([]);

		const envelope =
			'"type":"checkout.expired","version":"v2","id":"evt_1","createdAt":"2026-10-01T12:00:00Z"';
		const withFees = eventData(
			parseEvent(
				`{${envelope},"data":{"uuid":"pay@2","txType":"payment","organizationName":"Shop","priceUsd":"3.99",` +
					'"amountUsd":"4.81","fees":[{"type":"custom","label":"Shipping","description":"Standard, 3 to 5 days",' +
					'"amountUsd":"0.75"},{"type":"processingFee","label":"Processing fee","amountUsd":"0.07"}],' +
					'"availableCurrencies":[],"metadata":{}}}'
			),
			'checkout.expired'
		);
		expect([withFees.fees.length, withFees.fees[0].label, withFees.fees[0].amountUsd]).toEqual([
			2,
			'Shipping',
			'0.75',
		]);
		expect([
			withFees.fees[1].type,
			'description' in withFees.fees[1],
			withFees.amountUsd,
		]).toEqual([FeeLineType.ProcessingFee, false, '4.81']);

		const s = eventData(
			parseEvent(
				`{${envelope},"data":{"uuid":"sub@1","txType":"createSubscription","organizationName":"Shop","test":true,` +
					'"priceUsd":"9.99","amountUsd":"9.99","fees":[],"availableCurrencies":[{"id":8,"code":"BASE:USDC"}],' +
					'"metadata":{"plan":"pro"},"frequency":{"value":1,"unit":"weeks"},"trialPeriod":{"value":14,"unit":"days"},' +
					'"minPeriods":3,"upgradingFromTrial":false}}'
			),
			'checkout.expired'
		);
		if (!isSubscriptionSession(s)) throw new Error('subscription session expected');
		expect([s.uuid, s.frequency, s.trialPeriod, s.minPeriods, s.upgradingFromTrial]).toEqual([
			'sub@1',
			{ value: 1, unit: 'weeks' },
			{ value: 14, unit: 'days' },
			3,
			false,
		]);
		expect([s.metadata.plan, s.availableCurrencies[0].code]).toEqual(['pro', 'BASE:USDC']);

		const u = eventData(
			parseEvent(
				`{${envelope},"data":{"uuid":"x@1","txType":"payAsYouGo","organizationName":"Shop"}}`
			),
			'checkout.expired'
		);
		expect(isSubscriptionSession(u)).toBe(false);
		expect(u.txType).toBe('payAsYouGo');

		// The session's amounts are decimal strings: a number is refused.
		expect(
			thrown(() =>
				parseEvent(`{${envelope},"data":{"uuid":"pay@3","txType":"payment","priceUsd":10}}`)
			)
		).toBeInstanceOf(ValidationError);
	});

	it('webhook.test, and a switch narrows the union', () => {
		const e = load('webhook.test');
		switch (e.type) {
			case 'webhook.test':
				expect(e.data.endpointUuid && e.data.message).toBeTruthy();
				break;
			default:
				throw new Error('narrowing');
		}
	});

	it('a typed read of another type is a ValidationError', () => {
		const e = load('payment.completed');
		const err = thrown(() => eventData(e, 'subscription.created')) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.message).toContain('payment.completed');
		expect(thrown(() => eventData(e, 'refund.rejected'))).toBeInstanceOf(ValidationError);
		expect(thrown(() => eventData(e, 'checkout.expired'))).toBeInstanceOf(ValidationError);
		expect(isEventType(e, 'refund.rejected')).toBe(false);
	});

	it('absent or null data decodes to the zero value', () => {
		for (const data of ['', ',"data":null', ', "data": null ']) {
			const e = parseEvent(
				`{"id":"evt_1","type":"webhook.test","version":"v2","createdAt":"2026-10-01T12:00:00Z"${data}}`
			);
			expect(eventData(e, 'webhook.test')).toEqual({ endpointUuid: '', message: '' });
		}
	});

	it.each([
		['subscription.billingFailed', 'amountUsd', 10],
		['subscription.upcomingBill', 'amountUsd', 10],
		['payment.completed', 'amount', 10],
		['member.joined', 'organizationFeePercent', 5],
	])('%s: a JSON number for the decimal string %s is a ValidationError', (type, key, value) => {
		const body = JSON.parse(raw(type));
		body.data[key] = value;
		const err = thrown(() => parseEvent(JSON.stringify(body))) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe('data');
	});

	it('subscription.billed data that is not {bill, subscription} is a ValidationError', () => {
		const body = JSON.parse(raw('subscription.billed'));
		body.data = { bill: [], subscription: {} };
		expect(thrown(() => parseEvent(JSON.stringify(body)))).toBeInstanceOf(ValidationError);
	});

	it('the retired refund.completed / refund.denied types are unknown events', () => {
		for (const type of ['refund.completed', 'refund.denied']) {
			const e = parseEvent(
				`{"id":"evt_1","type":"${type}","version":"v2","createdAt":"2026-10-01T12:00:00Z","data":{"uuid":"refund@1"}}`
			);
			expect(isUnknownEvent(e)).toBe(true);
			expect(e.data).toEqual({ uuid: 'refund@1' });
		}
	});
});

describe('parseEvent', () => {
	it('keeps an unknown type with its raw data', () => {
		const e = parseEvent(
			'{"id":"evt_9","type":"invoice.paid","version":"v2","createdAt":"2026-10-01T14:00:00.5+02:00","test":true,"userUuid":"u-1","data":{"anything":[1,2]},"extra":1}'
		);
		expect(isUnknownEvent(e)).toBe(true);
		expect(e.type).toBe('invoice.paid');
		expect(e.data).toEqual({ anything: [1, 2] });
		expect([e.userUuid, e.test]).toEqual(['u-1', true]);
		expect(Date.parse(e.createdAt)).toBe(Date.UTC(2026, 9, 1, 12, 0, 0, 500));
		expect(() => eventData(e, 'payment.completed')).toThrow(ValidationError);
	});

	it('accepts bytes', () => {
		expect(parseEvent(Buffer.from(raw('webhook.test'))).type).toBe('webhook.test');
	});

	it.each([
		['empty', ''],
		['array', '[{"version":"v2"}]'],
		['string', '"v2"'],
		['not json', '{"version":'],
		['v1', '{"id":"evt_1","type":"payment.completed","version":"v1","data":{}}'],
		['v3', '{"id":"evt_1","type":"payment.completed","version":"v3","data":{}}'],
		['no version', '{"id":"evt_1","type":"payment.completed","data":{}}'],
		['wrong type', '{"id":"evt_1","type":"payment.completed","version":"v2","test":"yes"}'],
		[
			'bad createdAt',
			'{"id":"evt_1","type":"webhook.test","version":"v2","createdAt":"today"}',
		],
	])('refuses %s', (_name, body) => {
		expect(thrown(() => parseEvent(body))).toBeInstanceOf(ValidationError);
	});
});

describe('the event log', () => {
	it('decodes an event with its deliveries', () => {
		const body =
			'{"id":"evt_1","type":"refund.rejected","version":"v2","createdAt":"2026-10-01T12:00:00Z","test":false,' +
			'"data":{"uuid":"refund@1","status":"rejected"},' +
			'"deliveries":[{"endpointUuid":"e1","url":"https://x.io/hook","delivered":false,"attempts":[' +
			'{"uuid":"a1","eventId":"evt_1","eventType":"refund.rejected","endpointUuid":"e1","attempt":1,"delivered":false,' +
			'"statusCode":500,"error":"500 Internal","durationMs":120,"attemptedAt":"2026-10-01T12:00:01Z"},' +
			'{"uuid":"a2","eventId":"evt_1","eventType":"refund.rejected","endpointUuid":"e1","attempt":2,"delivered":false,' +
			'"skipped":true,"error":"timeout","durationMs":30000,"attemptedAt":"2026-10-01T12:01:01Z"}]}]}';
		const d = decodeResponse(EventDetailSchema, {
			status: 200,
			headers: new Headers(),
			body,
		}) as unknown as Event & {
			deliveries: import('../src/models/webhooks').EndpointDelivery[];
		};
		expect(eventData(d, 'refund.rejected').status).toBe('rejected');
		const a = d.deliveries[0].attempts;
		expect(a).toHaveLength(2);
		expect([a[0].statusCode, a[0].skipped]).toEqual([500, false]);
		expect([a[1].statusCode, a[1].skipped]).toEqual([undefined, true]);
		expect(a[1].durationMs).toBe(30000);
	});
});
