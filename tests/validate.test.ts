import { ValidationError } from '../src/errors';
import type { Duration } from '../src/models/common';
import * as P from '../src/params';
import {
	checkPathRequired,
	checkPathTxId,
	checkPathUUID,
	compareDecimal,
	isIdempotencyKey,
	isRequestId,
	isTxId,
	MAX_USD,
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
const product = (p: any) => () => P.createProductBody({ name: 'Pro', priceUsd: '1', ...p });
const customer = (p: any) => () =>
	P.createCustomerBody({ firstName: 'Ada', email: 'a@b.co', ...p });
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

	it('firstName and lastName', () => {
		expect(fields(customer({ lastName: 'L' }))).toEqual([]);
		expect(fields(customer({ lastName: 'L\n' }))).toEqual(['lastName']);
		expect(fields(customer({ firstName: 'A' }))).toEqual(['firstName']);
		expect(fields(customer({ firstName: undefined }))).toEqual(['firstName']);
		expect(fields(() => P.updateCustomerBody({ firstName: 'A' }))).toEqual(['firstName']);
		expect(fields(() => P.updateCustomerBody({ lastName: 'L' }))).toEqual([]);
		expect(fields(() => P.updateCustomerBody({ lastName: 'bidi\u202ex' }))).toEqual([
			'lastName',
		]);
		expect(fields(session({ productName: 'a', priceUsd: '1' }))).toEqual(['productName']);
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
		// Every ?reference= filter is checked like a created reference (they are lookups now).
		expect(fields(() => P.subscriptionListQuery({ reference: 'bad ref' }))).toEqual([
			'reference',
		]);
		expect(fields(() => P.productListQuery({ reference: 'bad ref' }))).toEqual(['reference']);
		expect(fields(() => P.customerListQuery({ reference: 'r'.repeat(101) }))).toEqual([
			'reference',
		]);
		expect(fields(() => P.paymentListQuery({ reference: 'o/1' }))).toEqual(['reference']);
		expect(fields(() => P.paymentListQuery({ reference: '..' }))).toEqual([]);
		expect(fields(() => P.referenceQuery('pro-monthly'))).toEqual([]);
		expect(P.referenceQuery('pro-monthly')).toBe('reference=pro-monthly');
		for (const r of ['', ' ', 'pro monthly', 'r'.repeat(101), undefined, 42]) {
			expect(fields(() => P.referenceQuery(r))).toEqual(['reference']);
		}
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
		expect(fields(() => P.createCustomerBody({ firstName: 'Ada' } as never))).toEqual([
			'email',
		]);
		expect(fields(() => P.createInvitationBody({ email: 'nope', holdFunds: false }))).toEqual([
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
				P.createInvitationBody({ email: 'a@b.co', holdFunds: false, redirectUrl: 'nope' })
			)
		).toEqual(['redirectUrl']);
		expect(fields(() => P.createWebhookEndpointBody({} as never))).toEqual(['url']);
		expect(fields(() => P.updateWebhookEndpointBody({ url: 'x' }))).toEqual(['url']);
	});

	// The usd rule on every money input: a decimal string, digits with at most 2 decimals, above
	// 0 and at most 1,000,000, compared exactly (no float).
	const GOOD_USD = [
		'0.01',
		'0.1',
		'1',
		'4.99',
		'5',
		'12.50',
		'19.9',
		'1000000',
		'1000000.00',
		'0000012.5',
		'999999.99',
	];
	const BAD_USD = [
		'0',
		'0.00',
		'-1',
		'+1',
		'1e2',
		'abc',
		'.5',
		'1.',
		' 1',
		'1 ',
		'1.999',
		'0.001',
		'0.000001',
		'1000000.01',
		'1000001',
		'1000000000',
		'1,5',
		'1_000',
		'NaN',
		'Infinity',
		'٣',
	];
	it.each(GOOD_USD)('usd ok: %j', (priceUsd) => {
		expect(fields(product({ priceUsd }))).toEqual([]);
		expect(fields(() => P.updateProductBody({ priceUsd }))).toEqual([]);
		expect(fields(session({ productName: 'Pro', priceUsd }))).toEqual([]);
	});
	it.each(BAD_USD)('usd bad: %j', (priceUsd) => {
		expect(fields(product({ priceUsd }))).toEqual(['priceUsd']);
		expect(fields(() => P.updateProductBody({ priceUsd }))).toEqual(['priceUsd']);
		expect(fields(session({ productName: 'Pro', priceUsd }))).toEqual(['priceUsd']);
		expect(
			fields(() => P.createSubscriptionSessionBody({ productName: 'Pro', priceUsd }))
		).toEqual(['priceUsd']);
	});

	it('usd: required on create, unchanged when empty on update, never a number', () => {
		expect(fields(product({ priceUsd: undefined }))).toEqual(['priceUsd']);
		expect(fields(product({ priceUsd: '' }))).toEqual(['priceUsd']);
		expect(fields(() => P.updateProductBody({ priceUsd: '' }))).toEqual([]);
		expect(fields(() => P.updateProductBody({}))).toEqual([]);
		// A float cannot carry "0.1" exactly, and the API answers 400 to a JSON number.
		for (const priceUsd of [5, 0.01, Number.NaN, Number.POSITIVE_INFINITY, true]) {
			expect(fields(product({ priceUsd }))).toEqual(['priceUsd']);
			expect(fields(() => P.updateProductBody({ priceUsd } as never))).toEqual(['priceUsd']);
			expect(fields(session({ productName: 'Pro', priceUsd }))).toEqual(['priceUsd']);
		}
		expect(() => product({ priceUsd: '1.999' })()).toThrow(
			'priceUsd must be an amount in USD as a decimal string (e.g. "12.50"): above 0, at most 1000000, with at most 2 decimals'
		);
		expect(MAX_USD).toBe(1_000_000);
	});

	it.each<[string, number, number]>([
		['1000000', 1_000_000, 0],
		['999999.99', 1_000_000, -1],
		['1000000.01', 1_000_000, 1],
		['0.5', 1_000_000, -1],
		['50', 50, 0],
		['50.00', 50, 0],
		['50.01', 50, 1],
		['0050', 50, 0],
		['49.99', 50, -1],
		['100.1', 100, 1],
		['99', 100, -1],
		['101', 100, 1],
		['0', 0, 0],
		['0.01', 0, 1],
	])('compareDecimal(%j, %d) = %d (exact, no float)', (value, limit, want) => {
		expect(compareDecimal(value, limit)).toBe(want);
	});

	// The percent rule: a decimal string, digits with at most 2 decimals, at most 16 characters,
	// from 0 to its maximum, compared exactly.
	it('percent: organizationFeePercent [0, 50]', () => {
		const member = (organizationFeePercent: unknown) => () =>
			P.updateMemberBody({ organizationFeePercent } as never);
		const invite = (organizationFeePercent: unknown) => () =>
			P.createInvitationBody({
				email: 'a@b.co',
				holdFunds: false,
				organizationFeePercent,
			} as never);
		for (const p of [
			'0',
			'0.00',
			'0.05',
			'1.5',
			'33.33',
			'50',
			'50.00',
			'007.5',
			'000000000000050',
			'0000000000000050', // 16 characters: the limit
		]) {
			expect(fields(member(p))).toEqual([]);
			expect(fields(invite(p))).toEqual([]);
		}
		for (const p of [
			'-0.01',
			'-1',
			'50.01',
			'51',
			'1.234',
			'1.155',
			'0.30000000000000004',
			'1e1',
			'.5',
			'5.',
			'50%',
			' 5',
			'00000000000000050', // 17 characters: over the 16-character limit
			'NaN',
			'Infinity',
			10, // never a number
		]) {
			expect(fields(member(p))).toEqual(['organizationFeePercent']);
			expect(fields(invite(p))).toEqual(['organizationFeePercent']);
		}
		expect(fields(member(undefined))).toEqual(['organizationFeePercent']); // required
		expect(fields(member(''))).toEqual(['organizationFeePercent']);
		expect(fields(invite(undefined))).toEqual([]); // the default, 0
		expect(fields(invite(''))).toEqual([]);
	});

	describe('metadata', () => {
		const keys = (n: number) =>
			Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'v']));
		const carriers: Record<string, (m: unknown) => () => unknown> = {
			product: (metadata) => product({ metadata }),
			'product update': (metadata) => () => P.updateProductBody({ metadata } as never),
			customer: (metadata) => customer({ metadata }),
			'customer update': (metadata) => () => P.updateCustomerBody({ metadata } as never),
			payment: (metadata) => session({ productUuid: MEMBER, metadata }),
			subscription: (metadata) => () =>
				P.createSubscriptionSessionBody({ productUuid: MEMBER, metadata } as never),
			'subscription update': (metadata) => () =>
				P.updateSubscriptionBody({ metadata } as never),
		};
		it.each(Object.keys(carriers))('%s', (name) => {
			const run = (m: unknown) => fields(carriers[name](m));
			expect(run(undefined)).toEqual([]);
			expect(run(null)).toEqual([]);
			expect(run({})).toEqual([]);
			expect(run(keys(50))).toEqual([]);
			expect(run(keys(51))).toEqual(['metadata']);
			expect(
				run({
					orderId: 'order-1042',
					'crm:customer': 'C-5521',
					'a.b_c-d': 'é ☃ 😀',
					x: '',
				})
			).toEqual([]);
			expect(run({ ['k'.repeat(40)]: 'v' })).toEqual([]);
			expect(run({ ['k'.repeat(41)]: 'v' })).toEqual(['metadata']);
			expect(run({ '': 'v' })).toEqual(['metadata']);
			expect(run({ 'order id': 'v' })).toEqual(['metadata']);
			expect(run({ 'a/b': 'v' })).toEqual(['metadata']);
			expect(run({ clé: 'v' })).toEqual(['metadata']);
			expect(run({ k: '😀'.repeat(500) })).toEqual([]); // code points, not UTF-16 units
			expect(run({ k: 'é'.repeat(501) })).toEqual(['metadata.k']);
			expect(run({ k: 'a\u0000b' })).toEqual(['metadata.k']);
			expect(run({ k: 'a\tb' })).toEqual(['metadata.k']);
			expect(run({ k: 'a\nb' })).toEqual(['metadata.k']);
			expect(run({ k: 'a\u202eb' })).toEqual(['metadata.k']);
			expect(run({ k: 'a\u2066b' })).toEqual(['metadata.k']);
			expect(run({ k: '<>{}[]`\\|;"~^' })).toEqual([]); // the text rule's characters are fine
			expect(run({ k: 1 })).toEqual(['metadata.k']);
			expect(run(['a'])).toEqual(['metadata']);
			expect(run('k=v')).toEqual(['metadata']);
			// Several bad keys are one error on metadata (the keys not echoed); bad values each.
			const several = { 'bad key': 'v', 'worse/key': 'v', a: '\u0001', b: '\u0002' };
			expect([...new Set(run(several))].sort()).toEqual([
				'metadata',
				'metadata.a',
				'metadata.b',
			]);
			try {
				carriers[name](several)();
			} catch (err) {
				expect((err as Error).message).not.toMatch(/bad key|worse/);
			}
		});

		it('is sent as given; an empty map is not sent', () => {
			expect(P.updateCustomerBody({ metadata: { crm: '', plan: 'pro' } })).toEqual({
				metadata: { crm: '', plan: 'pro' },
			});
			expect(P.updateSubscriptionBody({ metadata: { plan: '', seats: '5' } })).toEqual({
				metadata: { plan: '', seats: '5' },
			});
			expect(P.updateSubscriptionBody({})).toEqual({});
			expect(P.updateSubscriptionBody({ metadata: {} })).toEqual({});
			expect(
				P.createCustomerBody({ firstName: 'Ada', email: 'a@b.co', metadata: { k: 'v' } })
			).toEqual({ firstName: 'Ada', email: 'a@b.co', metadata: { k: 'v' } });
			expect(() => P.updateSubscriptionBody(undefined as never)).toThrow(ValidationError);
		});

		it('fees are reported after the metadata', () => {
			const err = (() => {
				try {
					P.createPaymentSessionBody({
						productUuid: MEMBER,
						metadata: { k: '\u0000' },
						fees: { items: [{ label: 'Tax', amountUsd: '0' }] },
					});
				} catch (e) {
					return e as ValidationError;
				}
				throw new Error('expected a ValidationError');
			})();
			expect(err.fieldErrors.map((f) => f.field)).toEqual([
				'metadata.k',
				'fees.items[0].amountUsd',
			]);
		});
	});

	describe('cursor', () => {
		const lists: Record<string, (cursor: unknown) => unknown> = {
			products: (cursor) => P.productListQuery({ cursor } as never),
			customers: (cursor) => P.customerListQuery({ cursor } as never),
			payments: (cursor) => P.paymentListQuery({ cursor } as never),
			transactions: (cursor) => P.transactionListQuery({ cursor } as never),
			failures: (cursor) => P.failureListQuery({ cursor } as never),
			subscriptions: (cursor) => P.subscriptionListQuery({ cursor } as never),
			'bills, members, endpoints': (cursor) => P.pageQuery({ cursor } as never),
			refunds: (cursor) => P.refundListQuery({ cursor } as never),
			invitations: (cursor) => P.invitationListQuery({ cursor } as never),
			events: (cursor) => P.eventListQuery({ cursor } as never),
		};
		it.each(Object.keys(lists))('%s: at most 200 characters, opaque', (name) => {
			const run = (c: unknown) => fields(() => lists[name](c));
			expect(run('djF8MDE5Y2FkZmQtODkwMA==')).toEqual([]);
			expect(run('c'.repeat(200))).toEqual([]);
			expect(run('é'.repeat(200))).toEqual([]);
			expect(run('😀'.repeat(200))).toEqual([]); // code points
			expect(run('c'.repeat(201))).toEqual(['cursor']);
			expect(run(42)).toEqual(['cursor']);
			expect(String(lists[name]('djF8+/='))).toContain('cursor=djF8%2B%2F%3D');
		});
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
		['inline', { productName: 'Pro', priceUsd: '10' }, []],
		[
			'inline + description',
			{ productName: 'Pro', priceUsd: '10', description: 'Lifetime' },
			[],
		],
		['nothing', {}, ['productUuid']],
		['uuid + reference', { productUuid: MEMBER, productReference: 'x' }, ['productUuid']],
		[
			'uuid + inline',
			{ productUuid: MEMBER, productName: 'Pro', priceUsd: '1' },
			['productUuid'],
		],
		['reference + price', { productReference: 'pro', priceUsd: '1' }, ['productUuid']],
		['uuid + description', { productUuid: MEMBER, description: 'x y' }, ['productUuid']],
		['inline without price', { productName: 'Pro' }, ['priceUsd']],
		['inline without name', { priceUsd: '3' }, ['productName']],
		['inline without name, bad price', { priceUsd: '-3' }, ['productName', 'priceUsd']],
		['inline negative price', { productName: 'Pro', priceUsd: '-3' }, ['priceUsd']],
		['inline price as a number', { productName: 'Pro', priceUsd: 3 }, ['priceUsd']],
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
					priceUsd: '9.99',
					frequency: { value: 1, unit: 'months' },
				})
			)
		).toEqual([]);
		expect(
			fields(() =>
				P.createSubscriptionSessionBody({ productReference: 'pro', priceUsd: '9.99' })
			)
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
			`release@${MEMBER}`,
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
		expect(fields(() => P.refundListQuery({ txUuid: 'order-1' }))).toEqual(['txUuid']);
		expect(fields(() => P.failureListQuery({ subscriptionUuid: 'sub@nope' }))).toEqual([
			'subscriptionUuid',
		]);
		expect(fields(() => P.refundListQuery({ txUuid: 'pay-1' }))).toEqual(['txUuid']);
		expect(fields(() => P.refundListQuery({ txUuid: `sub-hist@${MEMBER}` }))).toEqual([]);
		expect(fields(() => P.transactionListQuery({ subscriptionUuid: 'sub@x' }))).toEqual([
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
		expect(fields(() => checkPathRequired('id', 'evt_a/b'))).toEqual([]);
		expect(fields(() => checkPathRequired('id', ' '))).toEqual(['id']);
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
		// Subscription status and events type are not checked: a newer value is sent as is.
		expect(fields(() => P.subscriptionListQuery({ status: 'hibernating' }))).toEqual([]);
		expect(fields(() => P.subscriptionListQuery({ status: 'cancelled' }))).toEqual([]);
		expect(P.subscriptionListQuery({ status: 'hibernating' })).toBe('status=hibernating');
		// The enum filters the API enforces are checked against the known values.
		expect(fields(() => P.transactionListQuery({ type: 'subscriptionHistory' }))).toEqual([
			'type',
		]);
		expect(fields(() => P.transactionListQuery({ type: 'refund' }))).toEqual(['type']);
		expect(fields(() => P.transactionListQuery({ type: 'bill' }))).toEqual([]);
		expect(
			fields(() => P.transactionListQuery({ includeMembers: true, userUuid: MEMBER }))
		).toEqual(['userUuid']);
		expect(fields(() => P.failureListQuery({ kind: 'refund', category: 'boom' }))).toEqual([
			'kind',
			'category',
		]);
		expect(fields(() => P.invitationListQuery({ status: 'open' }))).toEqual(['status']);
		expect(fields(() => P.eventListQuery({ type: 'payment.done' }))).toEqual([]);
		expect(fields(() => P.eventListQuery({ type: 'webhook.test' }))).toEqual([]);
		expect(fields(() => P.refundListQuery({ includeMembers: true, userUuid: MEMBER }))).toEqual(
			['userUuid']
		);
		expect(
			fields(() => P.refundListQuery({ includeMembers: false, userUuid: MEMBER }))
		).toEqual([]);
		expect(fields(() => P.acceptedCurrenciesQuery({ userUuid: 'x' }))).toEqual(['userUuid']);
		expect(fields(() => P.customerListQuery({ limit: 1.5 }))).toEqual(['limit']);
		for (const fn of [
			P.paymentListQuery,
			P.customerListQuery,
			P.eventListQuery,
			P.refundListQuery,
			P.productListQuery,
			P.transactionListQuery,
			P.pageQuery,
			P.acceptedCurrenciesQuery,
			P.currencyListQuery,
		]) {
			expect(fields(() => fn(undefined))).toEqual([]);
		}
	});

	it('refund statuses', () => {
		const all = ['pending', 'approved', 'rejected', 'failed', 'pending']; // duplicates allowed
		const run = (status: unknown) => fields(() => P.refundListQuery({ status } as never));
		expect(run(all)).toEqual([]);
		expect(run([])).toEqual([]);
		expect(run(undefined)).toEqual([]);
		expect(run([...all, 'pending'])).toEqual(['status']);
		expect(run(['approved', 'completed', ''])).toEqual(['status[1]', 'status[2]']);
		expect(run(['denied'])).toEqual(['status[0]']);
		expect(run(['approved', 'cancelled'])).toEqual(['status[1]']); // retired: unknown
		expect(run([42])).toEqual(['status[0]']);
		expect(run('pending')).toEqual(['status']);
		// A repeated ?status=, in the order given.
		expect(P.refundListQuery({ status: ['approved', 'rejected'], limit: 25 })).toBe(
			'limit=25&status=approved&status=rejected'
		);
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
					events: [...twenty, 'refund.rejected'],
				})
			)
		).toEqual(['events']);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({
					url: 'https://x.io',
					events: ['refund.rejected', 'webhook.test'],
				})
			)
		).toEqual(['events[1]']);
		expect(
			fields(() =>
				P.createWebhookEndpointBody({
					url: 'https://x.io',
					events: ['refund.approved', ''],
				})
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
			firstName: 'x',
			lastName: '<',
			email: 'nope',
			phoneNumber: '1',
			address: ' ',
			reference: 'a b',
			metadata: { k: '\u007f' },
		});
		expect(fields(run)).toEqual([
			'firstName',
			'lastName',
			'email',
			'phoneNumber',
			'address',
			'reference',
			'metadata.k',
		]);
		expect(() => run()).toThrow(
			/^validation failed; firstName: firstName must be 2 to 100 characters/
		);
	});
});

describe('update semantics: what the bodies send', () => {
	it.each<[string, () => unknown, unknown]>([
		['empty customer update', () => P.updateCustomerBody({}), {}],
		[
			'clear lastName, phone and address',
			() => P.updateCustomerBody({ lastName: '', phoneNumber: '', address: '' }),
			{ lastName: '', phoneNumber: '', address: '' },
		],
		[
			'customer update',
			() => P.updateCustomerBody({ firstName: 'Ada', phoneNumber: '+33 6 12 34 56 78' }),
			{ firstName: 'Ada', phoneNumber: '+33 6 12 34 56 78' },
		],
		[
			'customer metadata merge',
			() => P.updateCustomerBody({ metadata: { crm: '' } }),
			{ metadata: { crm: '' } },
		],
		['empty product update', () => P.updateProductBody({}), {}],
		['clear description', () => P.updateProductBody({ description: '' }), { description: '' }],
		[
			'product update',
			() =>
				P.updateProductBody({
					priceUsd: '9.99',
					isActive: false,
					removeSubscription: true,
				}),
			{ priceUsd: '9.99', isActive: false, removeSubscription: true },
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
		['empty subscription update', () => P.updateSubscriptionBody({}), {}],
		[
			'subscription metadata',
			() => P.updateSubscriptionBody({ metadata: { plan: '', seats: '5' } }),
			{ metadata: { plan: '', seats: '5' } },
		],
		[
			'member fee 0',
			() => P.updateMemberBody({ organizationFeePercent: '0' }),
			{ organizationFeePercent: '0' },
		],
		[
			'invitation minimal (holdFunds always sent)',
			() => P.createInvitationBody({ email: 'a@b.co' } as never),
			{ email: 'a@b.co', role: 'user', holdFunds: false },
		],
		[
			'invitation without fee',
			() => P.createInvitationBody({ email: 'a@b.co', holdFunds: false }),
			{ email: 'a@b.co', role: 'user', holdFunds: false },
		],
		[
			'invitation without its email (sendEmail false is sent)',
			() => P.createInvitationBody({ email: 'a@b.co', holdFunds: false, sendEmail: false }),
			{ email: 'a@b.co', role: 'user', holdFunds: false, sendEmail: false },
		],
		[
			'invitation sendEmail true is sent',
			() => P.createInvitationBody({ email: 'a@b.co', holdFunds: false, sendEmail: true }),
			{ email: 'a@b.co', role: 'user', holdFunds: false, sendEmail: true },
		],
		[
			'invitation full',
			() =>
				P.createInvitationBody({
					email: 'a@b.co',
					holdFunds: true,
					organizationFeePercent: '2.5',
					redirectUrl: 'https://x.io',
				}),
			{
				email: 'a@b.co',
				role: 'user',
				holdFunds: true,
				organizationFeePercent: '2.5',
				redirectUrl: 'https://x.io',
			},
		],
		[
			'product',
			() => P.createProductBody({ name: 'Pro', priceUsd: '10' }),
			{ name: 'Pro', priceUsd: '10' },
		],
		[
			'product with terms',
			() =>
				P.createProductBody({
					name: 'Pro',
					priceUsd: '10.50',
					subscription: {
						frequency: { value: 1, unit: 'months' },
						trialPeriod: { value: 0 },
						minPeriods: 0,
					},
				}),
			{
				name: 'Pro',
				priceUsd: '10.50',
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
					priceUsd: '9.99',
					frequency: { value: 1, unit: 'weeks' },
					expiresInMinutes: 30,
				}),
			{
				productName: 'Pro',
				priceUsd: '9.99',
				expiresInMinutes: 30,
				frequency: { value: 1, unit: 'weeks' },
			},
		],
		[
			'money stays as typed',
			() => P.createProductBody({ name: 'Pro', priceUsd: '12.50' }),
			{ name: 'Pro', priceUsd: '12.50' },
		],
		[
			'endpoint create',
			() => P.createWebhookEndpointBody({ url: 'https://x.io', includeMembers: false }),
			{ url: 'https://x.io', includeMembers: false },
		],
		[
			'unknown keys are not sent',
			() => P.createProductBody({ name: 'Pro', priceUsd: '10', legacyId: 4 } as never),
			{ name: 'Pro', priceUsd: '10' },
		],
	])('%s', (_name, build, want) => {
		expect(build()).toEqual(want);
	});

	it('validates with the same semantics', () => {
		expect(
			fields(() => P.updateCustomerBody({ lastName: '', phoneNumber: '', address: '' }))
		).toEqual([]);
		expect(fields(() => P.updateCustomerBody({ phoneNumber: 'abc' }))).toEqual(['phoneNumber']);
		expect(fields(() => P.updateCustomerBody({ address: '   ' }))).toEqual(['address']);
		expect(fields(() => P.updateProductBody({ description: '' }))).toEqual([]);
		expect(fields(() => P.updateProductBody({ description: 'x' }))).toEqual(['description']);
		expect(
			fields(() => P.updateProductBody({ removeSubscription: true, subscription: {} }))
		).toEqual(['removeSubscription']);
		expect(fields(() => P.updateWebhookEndpointBody({ description: '' }))).toEqual([]);
		expect(
			fields(() =>
				P.createInvitationBody({ email: 'a@b.co', holdFunds: false, sendEmail: false })
			)
		).toEqual([]);
		expect(
			fields(() =>
				P.createInvitationBody({
					email: 'a@b.co',
					holdFunds: false,
					sendEmail: 'no' as never,
				})
			)
		).toEqual(['sendEmail']);
		expect(() => P.updateCustomerBody(null as never)).toThrow(ValidationError);
	});
});

describe('checkout fees', () => {
	const line = (p: any) => ({ label: 'Shipping', amountUsd: '0.75', ...p });
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
		['0.01', true],
		['0.75', true],
		['4.99', true],
		['19.9', true],
		['19.90', true],
		['20', true],
		['100', true],
		['5', true],
		['12.50', true],
		['1000000', true],
		['1000000.00', true],
		['', false],
		['0', false],
		['0.00', false],
		['-1', false],
		['-0.01', false],
		['0.001', false],
		['1.999', false],
		['1000000.01', false],
		['1000001', false],
		['1e2', false],
		['abc', false],
		['+1', false],
		[' 1', false],
		['1.', false],
		['.5', false],
		['0.30000000000000004', false],
		[undefined, false],
		[true, false],
		// Never a number (the API answers 400 to one; a float cannot carry "0.1" exactly).
		[0.75, false],
		[20, false],
		[Number.NaN, false],
		[Number.POSITIVE_INFINITY, false],
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
					'fees.items[1].amountUsd must be an amount in USD as a decimal string (e.g. "12.50"): above 0, at most 1000000, with at most 2 decimals',
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
			'a string, as typed',
			{ items: [{ label: 'VAT', amountUsd: '19.90' }] },
			`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"VAT","amountUsd":"19.90"}]}}`,
		],
		[
			'an empty description is omitted',
			{ items: [{ label: 'VAT', description: '', amountUsd: '4' }] },
			`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"VAT","amountUsd":"4"}]}}`,
		],
		[
			'everything',
			{
				processingFee: true,
				items: [
					{ label: 'Shipping', description: 'Standard, 3 to 5 days', amountUsd: '0.75' },
					{ label: 'VAT (20%)', amountUsd: '4.99' },
				],
			},
			`{"productUuid":"${MEMBER}","fees":{"processingFee":true,"items":[` +
				'{"label":"Shipping","description":"Standard, 3 to 5 days","amountUsd":"0.75"},' +
				'{"label":"VAT (20%)","amountUsd":"4.99"}]}}',
		],
	])('body: %s', (_name, fees, want) => {
		expect(wire(fees)).toBe(want);
	});

	it('the body keeps only the known fields of a line', () => {
		expect(
			wire({
				items: [{ label: 'VAT', amountUsd: '1', type: 'custom' }],
				extra: true,
			} as never)
		).toBe(`{"productUuid":"${MEMBER}","fees":{"items":[{"label":"VAT","amountUsd":"1"}]}}`);
	});

	describe('a subscription checkout', () => {
		const sub = (fees: any) => () =>
			P.createSubscriptionSessionBody({ productUuid: MEMBER, fees });
		const lines = (n: number) => Array.from({ length: n }, () => line({}));

		it('takes the same fees, by the same rules', () => {
			expect(fields(sub(undefined))).toEqual([]);
			expect(fields(sub({ processingFee: true }))).toEqual([]);
			expect(fields(sub({ processingFee: false, items: lines(10) }))).toEqual([]);
			expect(fields(sub({ items: lines(11) }))).toEqual(['fees.items']);
			expect(
				fields(sub({ items: [{ label: 'a|b', description: ' ', amountUsd: '0.001' }] }))
			).toEqual([LABEL, DESCRIPTION, AMOUNT]);
		});

		it("reports the fees' errors with the terms', after them", () => {
			expect(
				fields(() =>
					P.createSubscriptionSessionBody({
						productUuid: MEMBER,
						frequency: { value: 1 },
						fees: { items: [{ label: 'Tax', amountUsd: '-1' }] },
					})
				)
			).toEqual(['frequency.unit', AMOUNT]);
		});

		it('sends them only when given, after the terms', () => {
			expect(JSON.stringify(sub(undefined)())).toBe(`{"productUuid":"${MEMBER}"}`);
			expect(JSON.stringify(sub({ processingFee: false })())).toBe(
				`{"productUuid":"${MEMBER}","fees":{"processingFee":false}}`
			);
			expect(
				JSON.stringify(
					P.createSubscriptionSessionBody({
						productName: 'Pro',
						priceUsd: '9.99',
						frequency: { value: 1, unit: 'months' },
						fees: {
							processingFee: true,
							items: [
								{ label: 'VAT (20%)', description: 'French VAT', amountUsd: '2' },
							],
						},
					})
				)
			).toBe(
				'{"productName":"Pro","priceUsd":"9.99","frequency":{"value":1,"unit":"months"},' +
					'"fees":{"processingFee":true,"items":[{"label":"VAT (20%)","description":"French VAT","amountUsd":"2"}]}}'
			);
		});
	});
});
