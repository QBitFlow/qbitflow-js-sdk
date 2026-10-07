import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EventType } from '../src/enums';
import { ValidationError } from '../src/errors';
import type { Event, KnownEvent } from '../src/models/events';
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

/** The docs' example body of each event type (docs/core webhooks.md), as the Go SDK's testdata. */
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
		expect([p.amount, p.amountMinUnits, p.reference, p.customerReference, p.chain]).toEqual([
			10,
			'10000000',
			'order-1042',
			'crm-5521',
			'BASE',
		]);
		expect(p.managementPageLink).toBeTruthy();
		expect([p.paidMinUnits, p.paidUsd]).toEqual(['10004200', 10.0042]);
		expect(p.currency?.symbol).toBe('USDC');
		expect(p.currency?.mainCurrency?.mainCurrency).toBeNull();
		expect(p.currency?.mainCurrencyId).toBe(3);
		const m = p.metadata;
		expect(m.feePercent).toBe(1.5);
		expect(m.txAmounts.minUnits.merchant).toBe('9850000');
		expect(m.txAmounts.minUnits.networkFee).toBe('4200');
		expect(m.txAmounts.usd.merchant).toBe(9.85);
		expect(m.txAmounts.usd.organization).toBeUndefined();
		expect(m.txAmounts.usd.networkFee).toBeDefined();
		expect(m.txMetadata.blockData.timestamp).toBe(1790855998);
		expect(m.txMetadata.networkFees.unitsConsumed).toBe(95000);
		expect(m.organizationFee).toBeUndefined();
		// Webhooks never carry the API-only fields.
		expect([p.customer, p.refund, p.refundable]).toEqual([undefined, undefined, undefined]);
		expect(p.confirmedAt && p.checkoutOpenedAt).toBeTruthy();
	});

	it('subscriptions', () => {
		const created = eventData(load('subscription.created'), 'subscription.created');
		expect(created.uuid.startsWith('sub@')).toBe(true);
		expect(created.frequency).toEqual({ value: 1, unit: 'months' });
		expect(created.priceUsd).toBeTruthy();
		expect(
			created.currentPeriodEnd && created.nextBillingDate && created.managementPageLink
		).toBeTruthy();

		const billed = eventData(load('subscription.billed'), 'subscription.billed');
		expect(billed.uuid.startsWith('sub-hist@')).toBe(true);
		expect(billed.subscriptionUuid.startsWith('sub@')).toBe(true);
		expect(
			billed.subscriptionStatus &&
				billed.subscriptionReference &&
				billed.periodStart &&
				billed.periodEnd
		).toBeTruthy();

		const changed = eventData(load('subscription.statusChanged'), 'subscription.statusChanged');
		expect(changed.previousStatus).toBeTruthy();
		expect(changed.status).not.toBe(changed.previousStatus);

		expect(
			eventData(
				load('subscription.actionRequiredChanged'),
				'subscription.actionRequiredChanged'
			).actionRequired
		).toBeTruthy();

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
		expect(failed.nextAttemptAt).toBeTruthy();

		const upcoming = eventData(load('subscription.upcomingBill'), 'subscription.upcomingBill');
		expect(upcoming.amountUsd).not.toBe(0);
		expect(typeof upcoming.amountUsd).toBe('number');
		expect(upcoming.billingDate).not.toBe('0001-01-01T00:00:00Z');
		expect(upcoming.balanceSufficient).toBeDefined();
		expect(upcoming.allowanceSufficient).toBeDefined();
	});

	it.each<[KnownEvent['type'], string]>([
		['refund.requested', 'pending'],
		['refund.completed', 'approved'],
		['refund.denied', 'rejected'],
	])('%s', (type, status) => {
		const e = load(type);
		const r = e.data as import('../src/models/refunds').Refund;
		expect(r.status).toBe(status);
		expect(r.uuid.startsWith('refund@')).toBe(true);
		expect(r.txUuid && r.refundPercent && r.initiatedBy).toBeTruthy();
		expect(r.respondedAt === null).toBe(status === 'pending');
		expect([r.approval, r.customer, r.productName]).toEqual([undefined, undefined, undefined]);
		if (status === 'approved') expect(r.metadata && r.txHash && r.explorerUrl).toBeTruthy();
	});

	it('members and held funds', () => {
		const joined = eventData(load('member.joined'), 'member.joined');
		expect(joined.userUuid && joined.invitationUuid && joined.spaceUuid).toBeTruthy();
		expect(eventData(load('member.removed'), 'member.removed').userUuid).toBeTruthy();

		const e = load('heldFunds.released');
		expect(e.userUuid).toBe('019eca82-5680-7b00-8000-0000000000b1');
		const released = eventData(e, 'heldFunds.released');
		expect(released.received).toBe(true);
		expect(released.type).toBe('heldFundsRelease');
		expect(released.ledgers.length).toBeGreaterThan(0);
		expect(released.txMetadata.mainCurrencyPriceUsd).toBeDefined();
		expect(released.currency).not.toBeNull();
		const first = released.ledgers[0];
		expect([first.type, first.owedMinUnits, first.owedUsd]).toEqual([
			'payment',
			'98500000',
			98.5,
		]);
		expect(first.metadata).not.toBeNull();
		for (const l of released.ledgers.filter((x) => x.type === 'refund')) {
			expect(l.metadata).toBeNull();
			expect(l.refundedTxUuid).toBeTruthy();
			expect(l.owedMinUnits.startsWith('-')).toBe(true);
		}
	});

	it('checkout.expired: payment, subscription, unknown txType', () => {
		const p = eventData(load('checkout.expired'), 'checkout.expired');
		expect(isSubscriptionSession(p)).toBe(false);
		expect([p.txType, p.price, p.availableCurrencyIds.length, p.organizationName]).toEqual([
			'payment',
			10,
			3,
			'Example Shop',
		]);
		expect(p.expiresAt).toBeTruthy();

		const envelope =
			'"type":"checkout.expired","version":"v2","id":"evt_1","createdAt":"2026-10-01T12:00:00Z"';
		const sub = parseEvent(
			`{${envelope},"data":{"uuid":"sub@1","txType":"createSubscription","organizationName":"Shop","test":true,"availableCurrencyIds":[8],` +
				'"frequency":{"value":1,"unit":"weeks"},"trialPeriod":{"value":14,"unit":"days"},"minPeriods":3}}'
		);
		const s = eventData(sub, 'checkout.expired');
		if (!isSubscriptionSession(s)) throw new Error('subscription session expected');
		expect([s.uuid, s.frequency, s.trialPeriod, s.minPeriods]).toEqual([
			'sub@1',
			{ value: 1, unit: 'weeks' },
			{ value: 14, unit: 'days' },
			3,
		]);

		const unknown = parseEvent(
			`{${envelope},"data":{"uuid":"x@1","txType":"payAsYouGo","organizationName":"Shop"}}`
		);
		const u = eventData(unknown, 'checkout.expired');
		expect(isSubscriptionSession(u)).toBe(false);
		expect(u.txType).toBe('payAsYouGo');
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
		expect(isEventType(e, 'refund.denied')).toBe(false);
	});

	it('absent or null data decodes to the zero value', () => {
		for (const data of ['', ',"data":null']) {
			const e = parseEvent(
				`{"id":"evt_1","type":"webhook.test","version":"v2","createdAt":"2026-10-01T12:00:00Z"${data}}`
			);
			expect(eventData(e, 'webhook.test')).toEqual({ endpointUuid: '', message: '' });
		}
	});

	it('a value of the wrong type in data is a ValidationError (the amountUsd clash too)', () => {
		const body = JSON.parse(raw('subscription.upcomingBill'));
		body.data.amountUsd = '10';
		const err = thrown(() => parseEvent(JSON.stringify(body))) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe('data');
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
			'{"id":"evt_1","type":"refund.denied","version":"v2","createdAt":"2026-10-01T12:00:00Z","test":false,' +
			'"data":{"uuid":"refund@1","status":"rejected"},' +
			'"deliveries":[{"endpointUuid":"e1","url":"https://x.io/hook","delivered":false,"attempts":[' +
			'{"uuid":"a1","eventId":"evt_1","eventType":"refund.denied","endpointUuid":"e1","attempt":1,"delivered":false,' +
			'"statusCode":500,"error":"500 Internal","durationMs":120,"attemptedAt":"2026-10-01T12:00:01Z"},' +
			'{"uuid":"a2","eventId":"evt_1","eventType":"refund.denied","endpointUuid":"e1","attempt":2,"delivered":false,' +
			'"error":"timeout","durationMs":30000,"attemptedAt":"2026-10-01T12:01:01Z"}]}]}';
		const d = decodeResponse(EventDetailSchema, {
			status: 200,
			headers: new Headers(),
			body,
		}) as unknown as Event & {
			deliveries: import('../src/models/webhooks').EndpointDelivery[];
		};
		expect(eventData(d, 'refund.denied').status).toBe('rejected');
		const a = d.deliveries[0].attempts;
		expect(a).toHaveLength(2);
		expect(a[0].statusCode).toBe(500);
		expect(a[1].statusCode).toBeUndefined();
		expect(a[1].durationMs).toBe(30000);
	});
});
