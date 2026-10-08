import { ValidationError } from '../src/errors';
import type { Duration } from '../src/models/common';
import * as P from '../src/params';
import {
	checkPathRequired,
	checkPathTxId,
	checkPathUUID,
	isIdempotencyKey,
	isRequestId,
	isTxId,
	Validator,
} from '../src/validate';

const MEMBER = '019eca82-5680-7b00-8000-0000000000b1';

/** The failing fields of a check ([] when it passes). */
function fields(fn: () => unknown): string[] {
	try {
		fn();
		return [];
	} catch (err) {
		if (!(err instanceof ValidationError)) throw err;
		expect(err.status).toBeUndefined();
		for (const f of err.fieldErrors) expect(f.message.startsWith(`${f.field} `)).toBe(true);
		return err.fieldErrors.map((f) => f.field);
	}
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const product = (p: any) => () => P.createProductBody({ name: 'Pro', price: 1, ...p });
const customer = (p: any) => () => P.createCustomerBody({ name: 'Ada', email: 'a@b.co', ...p });
const session = (p: any) => () => P.createPaymentSessionBody(p);

describe('rules', () => {
	it.each([
		'Pro plan',
		'O’Brien',
		'Smith & Co',
		'prod/backend',
		'Dr. Who (II)',
		'Zoë',
		'李小龙',
		'ab',
		'é'.repeat(100),
	])('name ok: %j', (name) => expect(fields(product({ name }))).toEqual([]));
	it.each([
		'a',
		'  ',
		' \t ',
		'  ',
		'line\nbreak',
		'tab\there',
		'<b>',
		'x{y}',
		'a[1]',
		'back`tick',
		'back\\slash',
		'pi|pe',
		'semi;colon',
		'quo"te',
		'til~de',
		'car^et',
		'bidi‮name',
		'bidi⁦x',
		'nul\u0000x',
		'é'.repeat(101),
		'😀',
	])('name bad: %j', (name) => expect(fields(product({ name }))).toEqual(['name']));

	it('lastName', () => {
		expect(fields(customer({ lastName: 'L' }))).toEqual([]);
		expect(fields(customer({ lastName: 'L\n' }))).toEqual(['lastName']);
	});

	it('text', () => {
		for (const d of ['Two\nlines\r\nand\ttab', 'Lifetime access (Pro) & more: 100%', 'ok']) {
			expect(fields(product({ description: d }))).toEqual([]);
		}
		for (const d of ['   ', '\n\n', '<script>', 'x\u0007bell', 'x'.repeat(501), 'a']) {
			expect(fields(product({ description: d }))).toEqual(['description']);
		}
		expect(fields(customer({ address: 'x' }))).toEqual([]);
		expect(fields(customer({ address: 'x'.repeat(501) }))).toEqual(['address']);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({ url: 'https://x.io', description: 'x'.repeat(201) })
			)
		).toEqual(['description']);
		expect(
			fields(() =>
				P.initiateRefundBody({
					txUuid: `pay@${MEMBER}`,
					reason: 'Broken, can you refund?',
					merchantMessage: 'Sorry\nTeam',
				})
			)
		).toEqual([]);
		expect(
			fields(() =>
				P.initiateRefundBody({
					txUuid: `pay@${MEMBER}`,
					reason: '{x}',
					merchantMessage: 'm'.repeat(501),
				})
			)
		).toEqual(['reason', 'merchantMessage']);
	});

	it('reference', () => {
		for (const r of ['order-1042', 'INV_2026.10:01@shop', 'a', 'r'.repeat(100)]) {
			expect(fields(customer({ reference: r }))).toEqual([]);
		}
		for (const r of ['has space', 'slash/x', 'é', '#1', 'r'.repeat(101)]) {
			expect(fields(customer({ reference: r }))).toEqual(['reference']);
		}
		expect(
			fields(
				session({ productReference: 'bad ref', reference: 'o/1', customerReference: 'c 1' })
			)
		).toEqual(['reference', 'productReference', 'customerReference']);
		expect(fields(() => P.subscriptionListQuery({ reference: 'bad ref' }))).toEqual([
			'reference',
		]);
	});

	it('phone', () => {
		for (const p of ['+33 6 12 34 56 78', '555 (123) 4567', '06.12.34.56.78', '123456']) {
			expect(fields(customer({ phoneNumber: p }))).toEqual([]);
		}
		for (const p of [
			'12345',
			'+',
			'phone',
			'+33 6 12 34 56 7x',
			'-123456',
			'123456-',
			`+${'1'.repeat(32)}`,
		]) {
			expect(fields(customer({ phoneNumber: p }))).toEqual(['phoneNumber']);
		}
	});

	it('email', () => {
		for (const e of ['a@b.co', 'First.Last+tag@Example.COM', 'x@sub.domain.io']) {
			expect(fields(customer({ email: e }))).toEqual([]);
		}
		for (const e of [
			'no-at',
			'a@b',
			'@b.co',
			'a@.b.co',
			'a@b.co.',
			'a b@c.io',
			'a@@b.co',
			'a@b@c.io',
			`${'a'.repeat(250)}@b.co`,
		]) {
			expect(fields(customer({ email: e }))).toEqual(['email']);
		}
		expect(fields(() => P.createCustomerBody({ name: 'Ada' } as never))).toEqual(['email']);
		expect(fields(() => P.createInvitationBody({ email: 'nope', trustLayer: false }))).toEqual([
			'email',
		]);
		expect(fields(() => P.customerListQuery({ email: 'nope' }))).toEqual(['email']);
	});

	it('url', () => {
		for (const u of [
			'https://shop.example.com/thanks?id={{UUID}}&t={{TRANSACTION_TYPE}}',
			'http://localhost:8080/x',
			'HTTPS://EXAMPLE.COM',
		]) {
			expect(fields(session({ productUuid: MEMBER, successUrl: u, cancelUrl: u }))).toEqual(
				[]
			);
		}
		for (const u of [
			'ftp://x.io',
			'/relative',
			'https://',
			'javascript:alert(1)',
			`https://x.io/${'p'.repeat(2040)}`,
			'https:x.io',
		]) {
			expect(fields(session({ productUuid: MEMBER, successUrl: u }))).toEqual(['successUrl']);
		}
		expect(
			fields(() =>
				P.createInvitationBody({ email: 'a@b.co', trustLayer: false, redirectUrl: 'nope' })
			)
		).toEqual(['redirectUrl']);
		expect(fields(() => P.createWebhookEndpointBody({} as never))).toEqual(['url']);
		expect(fields(() => P.updateWebhookEndpointBody({ url: 'x' }))).toEqual(['url']);
	});

	it('price', () => {
		for (const price of [0.01, 5, 1e6]) expect(fields(product({ price }))).toEqual([]);
		for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5']) {
			expect(fields(product({ price }))).toEqual(['price']);
		}
		expect(fields(() => P.updateProductBody({ price: 0 }))).toEqual(['price']);
		expect(fields(() => P.updateProductBody({}))).toEqual([]);
	});

	it('percent', () => {
		for (const p of [0.01, 1.5, 33.33, 100]) {
			expect(
				fields(() => P.initiateRefundBody({ txUuid: MEMBER, refundPercent: p }))
			).toEqual([]);
		}
		const tenth = 0.1;
		for (const p of [0, -1, 100.01, 1.155, tenth + 0.2, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				fields(() => P.initiateRefundBody({ txUuid: MEMBER, refundPercent: p }))
			).toEqual(['refundPercent']);
		}
		for (const p of [0, 0.05, 1.5, 50]) {
			expect(fields(() => P.updateMemberBody({ organizationFeePercent: p }))).toEqual([]);
			expect(
				fields(() =>
					P.createInvitationBody({
						email: 'a@b.co',
						trustLayer: false,
						organizationFeePercent: p,
					})
				)
			).toEqual([]);
		}
		for (const p of [-0.01, 50.01, 1.234]) {
			expect(fields(() => P.updateMemberBody({ organizationFeePercent: p }))).toEqual([
				'organizationFeePercent',
			]);
		}
	});

	const month: Duration = { value: 1, unit: 'months' };
	it.each<[string, any, string[]]>([
		['monthly', { frequency: month }, []],
		['1 year', { frequency: { value: 1, unit: 'years' } }, []],
		['365 days', { frequency: { value: 365, unit: 'days' } }, []],
		['52 weeks', { frequency: { value: 52, unit: 'weeks' } }, []],
		['12 months', { frequency: { value: 12, unit: 'months' } }, []],
		[
			'5 seconds (the mode minimum is the API’s)',
			{ frequency: { value: 5, unit: 'seconds' } },
			[],
		],
		[
			'13 months > 1 year',
			{ frequency: { value: 13, unit: 'months' } },
			['subscription.frequency'],
		],
		['2 years', { frequency: { value: 2, unit: 'years' } }, ['subscription.frequency']],
		[
			'max uint32 years',
			{ frequency: { value: 4294967295, unit: 'years' } },
			['subscription.frequency'],
		],
		[
			'above uint32',
			{ frequency: { value: 4294967296, unit: 'seconds' } },
			['subscription.frequency.value'],
		],
		[
			'fractional',
			{ frequency: { value: 1.5, unit: 'days' } },
			['subscription.frequency.value'],
		],
		[
			'frequency 0',
			{ frequency: { value: 0, unit: 'days' } },
			['subscription.frequency.value'],
		],
		['no unit', { frequency: { value: 3 } }, ['subscription.frequency.unit']],
		[
			'bad unit',
			{ frequency: { value: 1, unit: 'fortnights' } },
			['subscription.frequency.unit'],
		],
		['frequency required on create', {}, ['subscription.frequency']],
		['trial 0 without unit', { frequency: month, trialPeriod: { value: 0 } }, []],
		['trial 14 days', { frequency: month, trialPeriod: { value: 14, unit: 'days' } }, []],
		[
			'trial no unit',
			{ frequency: month, trialPeriod: { value: 14 } },
			['subscription.trialPeriod.unit'],
		],
		[
			'trial 0 bad unit',
			{ frequency: month, trialPeriod: { value: 0, unit: 'x' } },
			['subscription.trialPeriod.unit'],
		],
		['minPeriods 1000', { frequency: month, minPeriods: 1000 }, []],
		['minPeriods 0', { frequency: month, minPeriods: 0 }, []],
		['minPeriods 1001', { frequency: month, minPeriods: 1001 }, ['subscription.minPeriods']],
	])('duration: %s', (_name, terms, want) => {
		expect(fields(product({ subscription: terms }))).toEqual(want);
	});

	it('session terms are top level and optional; update terms too', () => {
		expect(fields(() => P.createSubscriptionSessionBody({ productUuid: MEMBER }))).toEqual([]);
		expect(
			fields(() =>
				P.createSubscriptionSessionBody({
					productUuid: MEMBER,
					frequency: { value: 1 },
					minPeriods: 2000,
				})
			)
		).toEqual(['frequency.unit', 'minPeriods']);
		expect(
			fields(() => P.updateProductBody({ subscription: { trialPeriod: { value: 0 } } }))
		).toEqual([]);
	});

	it.each<[string, any, string[]]>([
		['by uuid', { productUuid: MEMBER }, []],
		['by reference', { productReference: 'pro-plan' }, []],
		['inline', { productName: 'Pro', price: 10 }, []],
		['inline + description', { productName: 'Pro', price: 10, description: 'Lifetime' }, []],
		['nothing', {}, ['productUuid']],
		['uuid + reference', { productUuid: MEMBER, productReference: 'x' }, ['productUuid']],
		['uuid + inline', { productUuid: MEMBER, productName: 'Pro', price: 1 }, ['productUuid']],
		['uuid + description', { productUuid: MEMBER, description: 'x y' }, ['productUuid']],
		['inline without price', { productName: 'Pro' }, ['price']],
		['inline without name', { price: 3 }, ['productName']],
		['inline negative price', { productName: 'Pro', price: -3 }, ['price']],
		['bad uuid', { productUuid: '42' }, ['productUuid']],
		['bad customer uuid', { productUuid: MEMBER, customerUuid: 'x' }, ['customerUuid']],
		['expires 10', { productUuid: MEMBER, expiresInMinutes: 10 }, []],
		['expires 1440', { productUuid: MEMBER, expiresInMinutes: 1440 }, []],
		['expires 0 (the default)', { productUuid: MEMBER, expiresInMinutes: 0 }, []],
		['expires 9', { productUuid: MEMBER, expiresInMinutes: 9 }, ['expiresInMinutes']],
		['expires 1441', { productUuid: MEMBER, expiresInMinutes: 1441 }, ['expiresInMinutes']],
	])('session: %s', (_name, p, want) => {
		expect(fields(session(p))).toEqual(want);
	});

	it('session: subscription and missing params', () => {
		expect(
			fields(() =>
				P.createSubscriptionSessionBody({
					productName: 'Pro',
					price: 9.99,
					frequency: { value: 1, unit: 'months' },
				})
			)
		).toEqual([]);
		expect(
			fields(() => P.createSubscriptionSessionBody({ productReference: 'pro', price: 9.99 }))
		).toEqual(['productUuid']);
		expect(() => P.createPaymentSessionBody(undefined as never)).toThrow(ValidationError);
	});

	it('ids', () => {
		for (const id of [
			MEMBER,
			'019ECA82-5680-7B00-8000-0000000000B1',
			`pay@${MEMBER}`,
			`sub@${MEMBER}`,
			`payg@${MEMBER}`,
			`sub-hist@${MEMBER}`,
			`refund@${MEMBER}`,
			`transfer@${MEMBER}`,
		]) {
			expect(isTxId(id)).toBe(true);
		}
		for (const id of [
			'',
			'pay@',
			'pay@x',
			`evt@${MEMBER}`,
			`@${MEMBER}`,
			`PAY@${MEMBER}`,
			`${MEMBER}0`,
			'42',
		]) {
			expect(isTxId(id)).toBe(false);
		}
		expect(fields(() => P.initiateRefundBody({} as never))).toEqual(['txUuid']);
		expect(fields(() => P.initiateRefundBody({ txUuid: 'order-1' }))).toEqual(['txUuid']);
		expect(fields(() => P.failureListQuery({ subscriptionUuid: 'sub@nope' }))).toEqual([
			'subscriptionUuid',
		]);

		expect(fields(() => checkPathUUID('uuid', MEMBER))).toEqual([]);
		expect(fields(() => checkPathUUID('uuid', '00000000-0000-0000-0000-000000000000'))).toEqual(
			[]
		);
		expect(fields(() => checkPathUUID('uuid', ''))).toEqual(['uuid']);
		expect(fields(() => checkPathUUID('uuid', `pay@${MEMBER}`))).toEqual(['uuid']);
		expect(fields(() => checkPathTxId('uuid', `sub@${MEMBER}`))).toEqual([]);
		expect(fields(() => checkPathTxId('uuid', ''))).toEqual(['uuid']);
		expect(fields(() => checkPathTxId('uuid', 'x'))).toEqual(['uuid']);
		expect(fields(() => checkPathRequired('reference', 'a/b'))).toEqual([]);
		expect(fields(() => checkPathRequired('reference', ' '))).toEqual(['reference']);
	});

	it('filters', () => {
		expect(
			fields(() => P.paymentListQuery({ includeMembers: true, userUuid: MEMBER }))
		).toEqual(['userUuid']);
		expect(fields(() => P.paymentListQuery({ userUuid: MEMBER }))).toEqual([]);
		expect(
			fields(() =>
				P.subscriptionListQuery({ customerUuid: 'x', productUuid: 'y', userUuid: 'z' })
			)
		).toEqual(['customerUuid', 'productUuid', 'userUuid']);
		expect(fields(() => P.subscriptionListQuery({ status: 'hibernating' }))).toEqual([
			'status',
		]);
		expect(fields(() => P.subscriptionListQuery({ status: 'cancelled' }))).toEqual([]);
		expect(
			fields(() => P.combinedPaymentListQuery({ source: 'subscription_history' }))
		).toEqual(['source']);
		expect(fields(() => P.failureListQuery({ kind: 'refund', category: 'boom' }))).toEqual([
			'kind',
			'category',
		]);
		expect(fields(() => P.invitationListQuery({ status: 'open' }))).toEqual(['status']);
		expect(fields(() => P.eventListQuery({ type: 'payment.done' }))).toEqual(['type']);
		expect(fields(() => P.eventListQuery({ type: 'webhook.test' }))).toEqual([]);
		expect(
			fields(() => P.refundListQuery({ includeMembers: true, userUuid: MEMBER }, true))
		).toEqual(['userUuid']);
		expect(
			fields(() => P.refundListQuery({ includeMembers: false, userUuid: MEMBER }, true))
		).toEqual([]);
		expect(fields(() => P.supportedCurrenciesQuery({ userUuid: 'x' }))).toEqual(['userUuid']);
		expect(fields(() => P.customerListQuery({ limit: 1.5 }))).toEqual(['limit']);
		for (const fn of [P.paymentListQuery, P.customerListQuery, P.eventListQuery]) {
			expect(fields(() => fn(undefined))).toEqual([]);
		}
	});

	it('dates', () => {
		const ok = new Validator();
		ok.dateRange('from', '2026-06-01', 'to', '2026-06-01');
		ok.dateRange('from', '2024-02-29', 'to', '2026-12-31'); // no window check (D5)
		expect(ok.fields).toEqual([]);
		for (const [from, to] of [
			['2026-06-02', '2026-06-01'],
			['2026-13-01', '2026-12-01'],
			['2025-02-29', '2025-03-01'],
			['26-01-01', '2026-01-01'],
			['2026-1-1', '2026-01-02'],
		]) {
			const v = new Validator();
			v.dateRange('from', from, 'to', to);
			expect(v.fields.length).toBeGreaterThan(0);
		}
		expect(P.accountingQuery('2026-06-01', '2026-09-01', 'csv')).toBe(
			'format=csv&from=2026-06-01&to=2026-09-01'
		);
	});

	it('endpoint events', () => {
		const twenty = Array<string>(20).fill('payment.completed');
		expect(
			fields(() => P.createWebhookEndpointBody({ url: 'https://x.io', events: twenty }))
		).toEqual([]);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({
					url: 'https://x.io',
					events: [...twenty, 'refund.denied'],
				})
			)
		).toEqual(['events']);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({
					url: 'https://x.io',
					events: ['refund.denied', 'webhook.test'],
				})
			)
		).toEqual(['events[1]']);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({ url: 'https://x.io', events: ['refund.denied', ''] })
			)
		).toEqual(['events[1]']);
		expect(fields(() => P.updateWebhookEndpointBody({ events: ['webhook.test'] }))).toEqual([
			'events[0]',
		]);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({ url: 'https://x.io', events: ['future.event'] })
			)
		).toEqual([]);
		expect(fields(() => P.updateWebhookEndpointBody({ payloadVersion: 'v1' }))).toEqual([
			'payloadVersion',
		]);
		expect(fields(() => P.updateWebhookEndpointBody({ payloadVersion: 'v2' }))).toEqual([]);
	});

	it('headers', () => {
		for (const k of ['a', 'order-1042', '~!@#$%^&*()_+{}|:<>?', 'k'.repeat(255)])
			expect(isIdempotencyKey(k)).toBe(true);
		for (const k of ['', 'a b', 'tab\t', 'é', 'del\u007f', 'k'.repeat(256)])
			expect(isIdempotencyKey(k)).toBe(false);
		for (const id of ['a', 'sdk-probe.123:abc', 'A_b-C.d:E', 'r'.repeat(128)])
			expect(isRequestId(id)).toBe(true);
		for (const id of ['', 'a b', 'a/b', 'a@b', 'r'.repeat(129)])
			expect(isRequestId(id)).toBe(false);
	});

	it('collects every failing field', () => {
		const run = customer({
			name: 'x',
			lastName: '<',
			email: 'nope',
			phoneNumber: '1',
			address: ' ',
			reference: 'a b',
		});
		expect(fields(run)).toEqual([
			'name',
			'lastName',
			'email',
			'phoneNumber',
			'address',
			'reference',
		]);
		expect(() => run()).toThrow(/^validation failed; name: name must be 2 to 100 characters/);
	});
});

describe('update semantics: what the bodies send', () => {
	it.each<[string, () => unknown, unknown]>([
		['empty customer update', () => P.updateCustomerBody({}), {}],
		[
			'clear phone and address',
			() => P.updateCustomerBody({ phoneNumber: '', address: '' }),
			{ phoneNumber: '', address: '' },
		],
		[
			'customer update',
			() => P.updateCustomerBody({ name: 'Ada', phoneNumber: '+33 6 12 34 56 78' }),
			{ name: 'Ada', phoneNumber: '+33 6 12 34 56 78' },
		],
		['empty product update', () => P.updateProductBody({}), {}],
		['clear description', () => P.updateProductBody({ description: '' }), { description: '' }],
		[
			'product update',
			() => P.updateProductBody({ price: 9.99, isActive: false, removeSubscription: true }),
			{ price: 9.99, isActive: false, removeSubscription: true },
		],
		['empty endpoint update', () => P.updateWebhookEndpointBody({}), {}],
		[
			'endpoint clears',
			() => P.updateWebhookEndpointBody({ description: '', events: [] }),
			{ events: [], description: '' },
		],
		[
			'endpoint pause',
			() => P.updateWebhookEndpointBody({ enabled: false, payloadVersion: 'v2' }),
			{ payloadVersion: 'v2', enabled: false },
		],
		[
			'member fee 0',
			() => P.updateMemberBody({ organizationFeePercent: 0 }),
			{ organizationFeePercent: 0 },
		],
		[
			'invitation minimal',
			() => P.createInvitationBody({ email: 'a@b.co', trustLayer: false }),
			{ email: 'a@b.co', role: 'user', trustLayer: false },
		],
		[
			'invitation full',
			() =>
				P.createInvitationBody({
					email: 'a@b.co',
					trustLayer: true,
					organizationFeePercent: 2.5,
					redirectUrl: 'https://x.io',
				}),
			{
				email: 'a@b.co',
				role: 'user',
				trustLayer: true,
				organizationFeePercent: 2.5,
				redirectUrl: 'https://x.io',
			},
		],
		[
			'product',
			() => P.createProductBody({ name: 'Pro', price: 10 }),
			{ name: 'Pro', price: 10 },
		],
		[
			'product with terms',
			() =>
				P.createProductBody({
					name: 'Pro',
					price: 10,
					subscription: {
						frequency: { value: 1, unit: 'months' },
						trialPeriod: { value: 0 },
						minPeriods: 0,
					},
				}),
			{
				name: 'Pro',
				price: 10,
				subscription: {
					frequency: { value: 1, unit: 'months' },
					trialPeriod: { value: 0 },
					minPeriods: 0,
				},
			},
		],
		[
			'session by uuid',
			() => P.createPaymentSessionBody({ productUuid: MEMBER }),
			{ productUuid: MEMBER },
		],
		[
			'subscription session',
			() =>
				P.createSubscriptionSessionBody({
					productName: 'Pro',
					price: 9.99,
					frequency: { value: 1, unit: 'weeks' },
					expiresInMinutes: 30,
				}),
			{
				productName: 'Pro',
				price: 9.99,
				expiresInMinutes: 30,
				frequency: { value: 1, unit: 'weeks' },
			},
		],
		[
			'refund',
			() => P.initiateRefundBody({ txUuid: `pay@${MEMBER}` }),
			{ txUuid: `pay@${MEMBER}` },
		],
		[
			'endpoint create',
			() => P.createWebhookEndpointBody({ url: 'https://x.io', includeMembers: false }),
			{ url: 'https://x.io', includeMembers: false },
		],
		[
			'unknown keys are not sent',
			() => P.createProductBody({ name: 'Pro', price: 10, legacyId: 4 } as never),
			{ name: 'Pro', price: 10 },
		],
	])('%s', (_name, build, want) => {
		expect(build()).toEqual(want);
	});

	it('validates with the same semantics', () => {
		expect(fields(() => P.updateCustomerBody({ phoneNumber: '', address: '' }))).toEqual([]);
		expect(fields(() => P.updateCustomerBody({ phoneNumber: 'abc' }))).toEqual(['phoneNumber']);
		expect(fields(() => P.updateCustomerBody({ address: '   ' }))).toEqual(['address']);
		expect(fields(() => P.updateProductBody({ description: '' }))).toEqual([]);
		expect(fields(() => P.updateProductBody({ description: 'x' }))).toEqual(['description']);
		expect(
			fields(() => P.updateProductBody({ removeSubscription: true, subscription: {} }))
		).toEqual(['removeSubscription']);
		expect(fields(() => P.updateWebhookEndpointBody({ description: '' }))).toEqual([]);
		expect(() => P.updateCustomerBody(null as never)).toThrow(ValidationError);
	});
});

describe('checkout fees', () => {
	const line = (p: any) => ({ label: 'Shipping', amountUsd: 0.75, ...p });
	const withFees = (fees: any) => session({ productUuid: MEMBER, fees });
	const withLine = (p: any) => withFees({ items: [line(p)] });
	const AMOUNT = 'fees.items[0].amountUsd';
	const LABEL = 'fees.items[0].label';
	const DESCRIPTION = 'fees.items[0].description';

	it('is optional; processingFee alone; up to 10 lines', () => {
		expect(fields(withFees(undefined))).toEqual([]);
		expect(fields(withFees(null))).toEqual([]);
		expect(fields(withFees({}))).toEqual([]);
		expect(fields(withFees({ processingFee: true }))).toEqual([]);
		expect(fields(withFees({ processingFee: false, items: [] }))).toEqual([]);
		expect(fields(withFees({ items: Array.from({ length: 10 }, () => line({})) }))).toEqual([]);
		expect(fields(withFees({ items: Array.from({ length: 11 }, () => line({})) }))).toEqual([
			'fees.items',
		]);
	});

	it('checks every line, also past the 10th', () => {
		const items = Array.from({ length: 11 }, () => line({}));
		items[10] = line({ label: '<b>' });
		expect(fields(withFees({ items }))).toEqual(['fees.items', 'fees.items[10].label']);
	});

	it('refuses a wrong shape', () => {
		expect(fields(withFees('shipping'))).toEqual(['fees']);
		expect(fields(withFees([line({})]))).toEqual(['fees']);
		expect(fields(withFees({ processingFee: 'yes' }))).toEqual(['fees.processingFee']);
		expect(fields(withFees({ items: line({}) }))).toEqual(['fees.items']);
		expect(fields(withFees({ items: [null] }))).toEqual(['fees.items[0]']);
		expect(fields(withFees({ items: [line({}), line({ label: '' })] }))).toEqual([
			'fees.items[1].label',
		]);
	});

	it.each<[string, unknown, boolean]>([
		['1 character', 'S', true],
		['40 characters', 'x'.repeat(40), true],
		['40 code points', 'é'.repeat(40), true],
		['VAT (20%)', 'VAT (20%)', true],
		['empty', '', false],
		['absent', undefined, false],
		['blank', '   ', false],
		['41 characters', 'x'.repeat(41), false],
		['a line break', 'Ship\nping', false],
		['a tab', 'Ship\tping', false],
		['markup', '<b>Tax</b>', false],
		['a bidi control', 'Tax‮', false],
		['not a string', 42, false],
	])('label: %s', (_name, label, ok) => {
		expect(fields(withLine({ label }))).toEqual(ok ? [] : [LABEL]);
	});

	it.each<[string, unknown, boolean]>([
		['absent', undefined, true],
		['empty (omitted)', '', true],
		['200 characters', 'd'.repeat(200), true],
		['several lines', 'Standard,\n3 to 5 days', true],
		['201 characters', 'd'.repeat(201), false],
		['blank', '  ', false],
		['markup', 'a {b}', false],
		['a control character', 'nul\u0000x', false],
	])('description: %s', (_name, description, ok) => {
		expect(fields(withLine({ description }))).toEqual(ok ? [] : [DESCRIPTION]);
	});

	it.each<[unknown, boolean]>([
		[0.01, true],
		[0.75, true],
		[19.9, true],
		[20, true],
		[1000000, true],
		['4.99', true],
		['19.90', true],
		['0.01', true],
		['5', true],
		['1000000', true],
		['1000000.00', true],
		[0, false],
		[-1, false],
		[-0.01, false],
		[1.999, false],
		[0.001, false],
		[1000000.01, false],
		[1e7, false],
		[Number.NaN, false],
		[Number.POSITIVE_INFINITY, false],
		[Number.NEGATIVE_INFINITY, false],
		['0', false],
		['0.00', false],
		['1.999', false],
		['1000000.01', false],
		['1e2', false],
		['abc', false],
		['+1', false],
		['-1', false],
		[' 1', false],
		['1.', false],
		['.5', false],
		['', false],
		[undefined, false],
		[true, false],
	])('amountUsd %p', (amountUsd, ok) => {
		expect(fields(withLine({ amountUsd }))).toEqual(ok ? [] : [AMOUNT]);
	});

	it('names every failing field of every line', () => {
		const err = (() => {
			try {
				withFees({
					items: [
						line({}),
						{ label: 'x'.repeat(41), description: ' ', amountUsd: '1e2' },
					],
				})();
			} catch (e) {
				return e as ValidationError;
			}
			throw new Error('expected a ValidationError');
		})();
		expect(err.fieldErrors).toEqual([
			{
				field: 'fees.items[1].label',
				message: 'fees.items[1].label must be 1 to 40 characters',
			},
			{
				field: 'fees.items[1].description',
				message:
					'fees.items[1].description must not be blank nor contain control characters or < > { } [ ] ` \\ | ; " ~ ^',
			},
			{
				field: 'fees.items[1].amountUsd',
				message:
					'fees.items[1].amountUsd must be an amount in USD above 0 and at most 1000000, with at most 2 decimals',
			},
		]);
	});

	/** The JSON a create sends, as text: numbers and strings stay apart. */
	const wire = (fees: any) =>
		JSON.stringify(P.createPaymentSessionBody({ productUuid: MEMBER, fees }));

	it.each<[string, any, string]>([
		['absent', undefined, `{"productUuid":"${MEMBER}"}`],
		['null', null, `{"productUuid":"${MEMBER}"}`],
		['empty', {}, `{"productUuid":"${MEMBER}","fees":{}}`],
		[
			'processingFee true',
			{ processingFee: true },
			`{"productUuid":"${MEMBER}","fees":{"processingFee":true}}`,
		],
		[
			'processingFee false',
			{ processingFee: false },
			`{"productUuid":"${MEMBER}","fees":{"processingFee":false}}`,
		],
		['no lines', { items: [] }, `{"productUuid":"${MEMBER}","fees":{}}`],
		[
			'a number',
			{ items: [{ label: 'Shipping', amountUsd: 0.75 }] },
			`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"Shipping","amountUsd":0.75}]}}`,
		],
		[
			'a string, as typed',
			{ items: [{ label: 'VAT', amountUsd: '19.90' }] },
			`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"VAT","amountUsd":"19.90"}]}}`,
		],
		[
			'an empty description is omitted',
			{ items: [{ label: 'VAT', description: '', amountUsd: 4 }] },
			`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"VAT","amountUsd":4}]}}`,
		],
		[
			'everything',
			{
				processingFee: true,
				items: [
					{ label: 'Shipping', description: 'Standard, 3 to 5 days', amountUsd: 0.75 },
					{ label: 'VAT (20%)', amountUsd: '4.99' },
				],
			},
			`{"productUuid":"${MEMBER}","fees":{"processingFee":true,"items":[` +
				'{"label":"Shipping","description":"Standard, 3 to 5 days","amountUsd":0.75},' +
				'{"label":"VAT (20%)","amountUsd":"4.99"}]}}',
		],
	])('body: %s', (_name, fees, want) => {
		expect(wire(fees)).toBe(want);
	});

	it('the body keeps only the known fields of a line', () => {
		expect(
			wire({ items: [{ label: 'VAT', amountUsd: 1, type: 'custom' }], extra: true } as never)
		).toBe(`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"VAT","amountUsd":1}]}}`);
	});

	it('a subscription checkout sends no fees', () => {
		const body = P.createSubscriptionSessionBody({
			productUuid: MEMBER,
			fees: { processingFee: true },
		} as never);
		expect(body).toEqual({ productUuid: MEMBER });
		expect('fees' in body).toBe(false);
	});
});
