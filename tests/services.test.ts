import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { QBitFlow } from '../src/client';
import {
	AuthenticationError,
	BadRequestError,
	ConflictError,
	NotFoundError,
	ServerError,
	ValidationError,
	WebhookSignatureError,
} from '../src/errors';
import type { RequestOptions } from '../src/transport';
import {
	closeServers,
	collect,
	rejection,
	reply,
	staticReply,
	TEST_API_KEY,
	testClient,
	testServer,
	UUID_V4,
} from './helpers/server';

/* eslint-disable @typescript-eslint/no-explicit-any */

afterEach(closeServers);

const MEMBER = '019eca82-5680-7b00-8000-0000000000b1';
const UUID_A = '019eca82-5680-7b00-8000-0000000000c1';
const UUID_B = '019eca82-5680-7b00-8000-0000000000c2';
const PAY_ID = 'pay@019eca82-5680-7b00-8000-0000000000d1';
const PAY_ID_Q = 'pay%40019eca82-5680-7b00-8000-0000000000d1';
const SUB_ID = 'sub@019eca82-5680-7b00-8000-0000000000d2';
const SUB_ID_Q = 'sub%40019eca82-5680-7b00-8000-0000000000d2';
const BILL_ID = 'sub-hist@019eca82-5680-7b00-8000-0000000000d3';
const REFUND_ID = 'refund@019eca82-5680-7b00-8000-0000000000d4';
const EVENT_ID = 'evt_bd1a913d-188e-5ac5-a2d6-5fd25cd67301';
const REF = 'crm:42@shop.x'; // a reference with characters a query escapes
const REF_Q = 'reference=crm%3A42%40shop.x'; // … as sent
const CURSOR = 'djF8MDFhMGY3NTUtZjIwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDA4';
const AFTER = '2026-09-01T12:00:00+02:00';
const AFTER_Q = '2026-09-01T12%3A00%3A00%2B02%3A00';
const BEFORE = new Date(Date.UTC(2026, 9, 1, 0, 0, 0, 500));
const BEFORE_Q = '2026-10-01T00%3A00%3A00.500Z';
const AT = '2026-10-01T12:00:00Z';

// Response fixtures, shaped like the docs' examples (a price paid in BASE:USDC).
const CUR = `{"id":8,"code":"BASE:USDC","symbol":"USDC","name":"USD Coin","chain":"BASE","decimals":6,"address":"0x8335","mainCurrencyId":3,"test":false}`;
const NATIVE = `{"id":3,"code":"BASE","symbol":"BASE","name":"Base","chain":"BASE","decimals":18,"test":false}`;
const SETTLEMENT = `{"feePercent":"0.99","split":{"platform":{"amount":"0.099","amountMinUnits":"99000"},
	"merchant":{"amount":"9.901","amountMinUnits":"9901000","amountUsd":"9.901"}},
	"transaction":{"blockNumber":"52468103","fee":{"amount":"0.00000114","amountMinUnits":"1140000000000"}}}`;
const FEES = `[{"type":"custom","label":"VAT (20%)","description":"French VAT","amountUsd":"1.30"},
	{"type":"processingFee","label":"Processing fee","amountUsd":"0.20"}]`;
const product = (reference = 'pro') =>
	`{"uuid":"p-1","name":"Pro","priceUsd":"9.99","createdAt":"${AT}","isActive":true,"reference":"${reference}",
	"metadata":{"sku":"PRO-1"},"subscription":{"frequency":{"value":1,"unit":"months"},"minPeriods":3},"test":false}`;
const customer = (reference = 'crm-1') =>
	`{"uuid":"c-1","firstName":"Ada","email":"ada@example.com","verified":true,"reference":"${reference}",
	"metadata":{"crm":"42"},"createdAt":"${AT}","test":true,"userUuid":"m-1"}`;
const payment = (reference = 'order-1') =>
	`{"uuid":"pay@1","createdAt":"${AT}","from":"0xf","to":"0xt","amount":"10","amountMinUnits":"10000000",
	"amountUsd":"10","currency":${CUR},"txHash":"0xh","test":false,"reference":"${reference}","priceUsd":"8.5",
	"fees":${FEES},"productName":"Pro","metadata":{"orderId":"order-1"},"settlement":${SETTLEMENT}}`;
const subscription = (reference = 'order-1043') =>
	`{"uuid":"sub@1","reference":"${reference}","createdAt":"${AT}","updatedAt":"${AT}","to":"0xt","currency":${CUR},
	"frequency":{"value":1,"unit":"months"},"status":"active","currentPeriodEnd":"2026-10-31T12:00:00Z",
	"priceUsd":"9.99","fees":[],"allowance":{"amount":"110","amountMinUnits":"110000000","remainingPeriods":11},
	"metadata":{"plan":"pro"},"test":false}`;
const BILL = `{"uuid":"sub-hist@1","createdAt":"${AT}","from":"0xf","to":"0xt","amount":"9.99","amountMinUnits":"9990000",
	"amountUsd":"9.99","currency":${CUR},"txHash":"0xh","test":false,"productName":"Pro","subscriptionUuid":"sub@1",
	"settlement":${SETTLEMENT},"periodStart":"${AT}","periodEnd":"2026-10-31T12:00:00Z"}`;
const TRANSACTION = `{"type":"bill","uuid":"sub-hist@1","createdAt":"${AT}","from":"0xf","to":"0xt","productName":"Pro",
	"fees":[],"amount":"9.99","amountMinUnits":"9990000","amountUsd":"9.99","currency":${CUR},"txHash":"0xh",
	"subscriptionUuid":"sub@1","metadata":{},"test":true,"settlement":${SETTLEMENT}}`;
const FAILURE = `{"uuid":"f-1","kind":"bill","txUuid":"sub-hist@1","attempt":2,"code":"insufficient_funds",
	"category":"insufficientBalance","attempted":"9.99","attemptedMinUnits":"9990000","attemptedUsd":"9.99",
	"currency":${CUR},"from":"0xf","createdAt":"${AT}","test":false}`;
const CREATED_SESSION = `{"link":"https://qbitflow.app/checkout?uuid=pay@1","uuid":"pay@1","expiresAt":"2026-10-02T12:00:00Z"}`;
const SESSION_STATUS = `{"uuid":"pay@1","status":"created","lastAttempt":{"status":"failed","code":"insufficient_funds","at":"${AT}"},
	"expiresAt":"2026-10-02T12:00:00Z"}`;
const TEST_BILL = `{"billUuid":"sub-hist@1","stage":"done","outcome":"paid","attempts":0,"txHash":"0xh"}`;
const REFUND = `{"uuid":"refund@1","txUuid":"pay@1","status":"pending","createdAt":"${AT}","test":false,
	"initiatedBy":"merchant","held":false,"paid":"10.0042","paidMinUnits":"10004200","refundPercent":"50",
	"amount":"5.0021","amountMinUnits":"5002100","currency":${CUR},
	"approval":{"status":"waitingConfirmation","txHash":"0xa"}}`;
const MEMBER_FX = `{"userUuid":"m-1","firstName":"Ada","email":"a@b.co","test":false,"organizationFeePercent":"7.5",
	"joinedAt":"${AT}","acceptedCurrencies":[${CUR}],"spaceUuid":"s-1"}`;
const HELD_FUNDS = `{"ledgers":[{"txUuid":"refund@1","type":"refund","description":"Refund of payment pay@1",
	"refundedTxUuid":"pay@1","amountUsd":"10.0042","currency":${CUR},"owed":"-10.0042","owedMinUnits":"-10004200",
	"owedUsd":"-10.0042","createdAt":"${AT}"}],"totalUsd":"-10.0042"}`;
const MEMBER_HELD_FUNDS = `{"userUuid":"m-1","totalUsd":"98.5","count":2,"oldestAt":"2026-09-28T12:00:00Z"}`;
const INVITATION = `{"uuid":"i-1","test":true,"email":"a@b.co","role":"user","holdFunds":true,"organizationFeePercent":"2.5",
	"expiresAt":"2026-10-08T12:00:00Z","createdAt":"${AT}","status":"pending"}`;
const CREATED_INVITATION = `{"uuid":"i-1","test":true,"email":"a@b.co","role":"user","holdFunds":true,
	"expiresAt":"2026-10-08T12:00:00Z","createdAt":"${AT}","status":"pending","link":"https://qbitflow.app/invite?token=x"}`;
const WALLET = `{"uuid":"w-1","createdAt":"${AT}","address":"0xpk","test":false,"tokenWallets":[{"uuid":"tw-1",
	"createdAt":"${AT}","currency":${CUR},"walletUuid":"w-1","balance":{"currency":${CUR},"amount":"12.5",
	"amountMinUnits":"12500000","amountUsd":"12.5"}}],"currency":${NATIVE}}`;
const ACCOUNTING_EVENT = `{"txTimeUtc":"2026-09-13T19:23:26.62Z","type":"refund","chain":"BASE","currency":"USDC",
	"currencyDecimals":6,"grossAmountUsd":"-10.0042","netAmount":"-10.0042","txUuid":"refund@1","relatedTxUuid":"pay@0"}`;
const ENDPOINT = `{"uuid":"e-1","test":true,"url":"https://x.io/hook","events":["payment.completed"],"includeMembers":true,
	"payloadVersion":"v2","createdAt":"${AT}","secret":"whsec_x"}`;

/** A page of one item that claims more. */
const page = (item: string) => `{"items":[${item}],"hasMore":true,"nextCursor":"${CURSOR}"}`;
/** A bounded list's one page. */
const items = (...list: string[]) => `{"items":[${list.join(',')}],"hasMore":false}`;
const EVT = readFileSync(join(__dirname, 'fixtures', 'events', 'webhook.test.json'), 'utf8');

interface RouteCase {
	name: string;
	call: (c: QBitFlow, o?: RequestOptions) => Promise<unknown>;
	method: string;
	path: string;
	query?: string;
	body?: unknown;
	idempotent?: boolean;
	accept?: string;
	status?: number;
	reply: string;
	contentType?: string;
	check?: (v: any) => void;
}

const isVoid = (v: unknown) => expect(v).toBeUndefined();

const ROUTES: RouteCase[] = [
	// Products.
	{
		name: 'products.list',
		call: (c, o) =>
			c.products.list(
				{
					limit: 2,
					cursor: CURSOR,
					includeHidden: true,
					subscription: false,
					reference: 'pro',
				},
				o
			),
		method: 'GET',
		path: '/products',
		query: `cursor=${CURSOR}&includeHidden=true&limit=2&reference=pro&subscription=false`,
		reply: page(product()),
		check: (v) =>
			expect([v.items.length, v.items[0].priceUsd, v.hasMore, v.nextCursor]).toEqual([
				1,
				'9.99',
				true,
				CURSOR,
			]),
	},
	{
		name: 'products.list no params',
		call: (c, o) => c.products.list(undefined, o),
		method: 'GET',
		path: '/products',
		reply: '{"items":[],"hasMore":false}',
		check: (v) => expect(v).toEqual({ items: [], hasMore: false }),
	},
	{
		name: 'products.create',
		call: (c, o) =>
			c.products.create(
				{
					name: 'Pro',
					priceUsd: '9.90',
					reference: 'pro',
					subscription: {
						frequency: { value: 1, unit: 'months' },
						trialPeriod: { value: 0 },
						minPeriods: 3,
					},
					metadata: { sku: 'PRO-1' },
				},
				o
			),
		method: 'POST',
		path: '/products',
		idempotent: true,
		status: 201,
		body: {
			name: 'Pro',
			priceUsd: '9.90', // a decimal string, sent verbatim
			reference: 'pro',
			subscription: {
				frequency: { value: 1, unit: 'months' },
				trialPeriod: { value: 0 },
				minPeriods: 3,
			},
			metadata: { sku: 'PRO-1' },
		},
		reply: product(),
		check: (v) =>
			expect([v.uuid, v.priceUsd, v.metadata]).toEqual(['p-1', '9.99', { sku: 'PRO-1' }]),
	},
	{
		name: 'products.get',
		call: (c, o) => c.products.get(UUID_A, o),
		method: 'GET',
		path: `/products/${UUID_A}`,
		reply: product(),
	},
	{
		name: 'products.getByReference',
		call: (c, o) => c.products.getByReference(REF, o),
		method: 'GET',
		path: '/products',
		query: REF_Q,
		reply: items(product('other'), product(REF)),
		check: (v) => expect(v.reference).toBe(REF),
	},
	{
		name: 'products.update',
		call: (c, o) =>
			c.products.update(
				UUID_A,
				{ description: '', priceUsd: '12', isActive: false, metadata: { old: '' } },
				o
			),
		method: 'PATCH',
		path: `/products/${UUID_A}`,
		body: { description: '', priceUsd: '12', isActive: false, metadata: { old: '' } },
		reply: product(),
	},
	{
		name: 'products.delete',
		call: (c, o) => c.products.delete(UUID_A, o),
		method: 'DELETE',
		path: `/products/${UUID_A}`,
		status: 204,
		reply: '',
		check: isVoid,
	},

	// Customers.
	{
		name: 'customers.create',
		call: (c, o) =>
			c.customers.create(
				{
					firstName: 'Ada',
					lastName: 'Lovelace',
					email: 'ada@example.com',
					phoneNumber: '+33 6 12 34 56 78',
					reference: 'crm-1',
					metadata: { crm: '42' },
				},
				o
			),
		method: 'POST',
		path: '/customers',
		idempotent: true,
		status: 201,
		body: {
			firstName: 'Ada',
			lastName: 'Lovelace',
			email: 'ada@example.com',
			phoneNumber: '+33 6 12 34 56 78',
			reference: 'crm-1',
			metadata: { crm: '42' },
		},
		reply: customer(),
		check: (v) =>
			expect([v.uuid, v.firstName, v.verified, v.metadata.crm]).toEqual([
				'c-1',
				'Ada',
				true,
				'42',
			]),
	},
	{
		name: 'customers.update',
		call: (c, o) =>
			c.customers.update(
				UUID_A,
				{ email: 'new@example.com', lastName: '', phoneNumber: '', address: '' },
				o
			),
		method: 'PATCH',
		path: `/customers/${UUID_A}`,
		body: { email: 'new@example.com', lastName: '', phoneNumber: '', address: '' },
		reply: customer(),
	},
	{
		name: 'customers.list',
		call: (c, o) =>
			c.customers.list(
				{
					limit: 5,
					cursor: CURSOR,
					email: 'ada+1@example.com',
					reference: 'crm-1',
					verified: true,
				},
				o
			),
		method: 'GET',
		path: '/customers',
		query: `cursor=${CURSOR}&email=ada%2B1%40example.com&limit=5&reference=crm-1&verified=true`,
		reply: page(customer()),
		check: (v) => expect([v.items.length, v.hasMore, v.nextCursor]).toEqual([1, true, CURSOR]),
	},
	{
		name: 'customers.get',
		call: (c, o) => c.customers.get(UUID_A, o),
		method: 'GET',
		path: `/customers/${UUID_A}`,
		reply: customer(),
	},
	{
		name: 'customers.getByReference',
		call: (c, o) => c.customers.getByReference(REF, o),
		method: 'GET',
		path: '/customers',
		query: REF_Q,
		reply: items(customer(REF)),
		check: (v) => expect([v.uuid, v.reference]).toEqual(['c-1', REF]),
	},
	{
		name: 'customers.delete',
		call: (c, o) => c.customers.delete(UUID_A, o),
		method: 'DELETE',
		path: `/customers/${UUID_A}`,
		status: 204,
		reply: '',
		check: isVoid,
	},

	// Checkout sessions.
	{
		name: 'checkoutSessions.createPayment',
		call: (c, o) =>
			c.checkoutSessions.createPayment(
				{
					reference: 'order-1',
					productName: 'T-shirt',
					description: 'Blue',
					priceUsd: '4.50',
					successUrl: 'https://shop.example/ok?id={{UUID}}',
					cancelUrl: 'https://shop.example/ko',
					customerReference: 'crm-1',
					expiresInMinutes: 30,
					metadata: { orderId: 'order-1' },
				},
				o
			),
		method: 'POST',
		path: '/checkout-sessions/payment',
		idempotent: true,
		status: 201,
		body: {
			reference: 'order-1',
			productName: 'T-shirt',
			description: 'Blue',
			priceUsd: '4.50',
			successUrl: 'https://shop.example/ok?id={{UUID}}',
			cancelUrl: 'https://shop.example/ko',
			customerReference: 'crm-1',
			expiresInMinutes: 30,
			metadata: { orderId: 'order-1' },
		},
		reply: CREATED_SESSION,
		check: (v) =>
			expect([v.uuid, !!v.link, v.expiresAt]).toEqual([
				'pay@1',
				true,
				'2026-10-02T12:00:00Z',
			]),
	},
	{
		name: 'checkoutSessions.createPayment with fees',
		call: (c, o) =>
			c.checkoutSessions.createPayment(
				{
					productUuid: UUID_A,
					fees: {
						processingFee: true,
						items: [
							{
								label: 'Shipping',
								description: 'Standard, 3 to 5 days',
								amountUsd: '0.75',
							},
							{ label: 'VAT (20%)', amountUsd: '19.90' },
						],
					},
				},
				o
			),
		method: 'POST',
		path: '/checkout-sessions/payment',
		idempotent: true,
		status: 201,
		body: {
			productUuid: UUID_A,
			fees: {
				processingFee: true,
				items: [
					{ label: 'Shipping', description: 'Standard, 3 to 5 days', amountUsd: '0.75' },
					{ label: 'VAT (20%)', amountUsd: '19.90' },
				],
			},
		},
		reply: CREATED_SESSION,
	},
	{
		name: 'checkoutSessions.createSubscription',
		call: (c, o) =>
			c.checkoutSessions.createSubscription(
				{
					productUuid: UUID_A,
					customerUuid: UUID_B,
					frequency: { value: 1, unit: 'weeks' },
					trialPeriod: { value: 14, unit: 'days' },
					minPeriods: 0,
				},
				o
			),
		method: 'POST',
		path: '/checkout-sessions/subscription',
		idempotent: true,
		status: 201,
		body: {
			productUuid: UUID_A,
			customerUuid: UUID_B,
			frequency: { value: 1, unit: 'weeks' },
			trialPeriod: { value: 14, unit: 'days' },
			minPeriods: 0,
		},
		reply: CREATED_SESSION,
	},
	{
		name: 'checkoutSessions.createSubscription with fees',
		call: (c, o) =>
			c.checkoutSessions.createSubscription(
				{
					productName: 'Pro',
					priceUsd: '9.99',
					frequency: { value: 1, unit: 'months' },
					metadata: { plan: 'pro' },
					fees: {
						processingFee: true,
						items: [{ label: 'VAT (20%)', description: 'French VAT', amountUsd: '2' }],
					},
				},
				o
			),
		method: 'POST',
		path: '/checkout-sessions/subscription',
		idempotent: true,
		status: 201,
		body: {
			productName: 'Pro',
			priceUsd: '9.99',
			metadata: { plan: 'pro' },
			frequency: { value: 1, unit: 'months' },
			fees: {
				processingFee: true,
				items: [{ label: 'VAT (20%)', description: 'French VAT', amountUsd: '2' }],
			},
		},
		reply: CREATED_SESSION,
	},
	{
		name: 'checkoutSessions.createSubscription processing fee off',
		call: (c, o) =>
			c.checkoutSessions.createSubscription(
				{ productUuid: UUID_A, fees: { processingFee: false } },
				o
			),
		method: 'POST',
		path: '/checkout-sessions/subscription',
		idempotent: true,
		status: 201,
		body: { productUuid: UUID_A, fees: { processingFee: false } },
		reply: CREATED_SESSION,
	},
	{
		name: 'checkoutSessions.get',
		call: (c, o) => c.checkoutSessions.get(PAY_ID, o),
		method: 'GET',
		path: `/checkout-sessions/${PAY_ID}`,
		reply: SESSION_STATUS,
		check: (v) =>
			expect([v.status, !!v.lastAttempt, v.expiresAt]).toEqual([
				'created',
				true,
				'2026-10-02T12:00:00Z',
			]),
	},
	{
		name: 'checkoutSessions.expire',
		call: (c, o) => c.checkoutSessions.expire(SUB_ID, o),
		method: 'POST',
		path: `/checkout-sessions/${SUB_ID}/expire`,
		reply: `{"uuid":"${SUB_ID}","status":"expired","expiresAt":"${AT}"}`,
		check: (v) => expect([v.status, v.expiresAt]).toEqual(['expired', AT]),
	},

	// Payments, transactions and failures.
	{
		name: 'payments.list',
		call: (c, o) =>
			c.payments.list(
				{
					limit: 50,
					cursor: CURSOR,
					customerUuid: UUID_B,
					productUuid: UUID_A,
					createdAfter: AFTER,
					createdBefore: BEFORE,
					userUuid: MEMBER,
					reference: 'order-1',
					refunded: false,
				},
				o
			),
		method: 'GET',
		path: '/payments',
		query: `createdAfter=${AFTER_Q}&createdBefore=${BEFORE_Q}&cursor=${CURSOR}&customerUuid=${UUID_B}&limit=50&productUuid=${UUID_A}&reference=order-1&refunded=false&userUuid=${MEMBER}`,
		reply: page(payment()),
		check: (v) =>
			expect([v.items[0].uuid, v.items[0].amount, v.items[0].currency.code]).toEqual([
				'pay@1',
				'10',
				'BASE:USDC',
			]),
	},
	{
		name: 'payments.get',
		call: (c, o) => c.payments.get(PAY_ID, { includeMembers: true }, o),
		method: 'GET',
		path: `/payments/${PAY_ID}`,
		query: 'includeMembers=true',
		reply: payment(),
		check: (v) =>
			expect([v.reference, v.amountUsd, v.priceUsd, v.settlement.feePercent]).toEqual([
				'order-1',
				'10',
				'8.5',
				'0.99',
			]),
	},
	{
		name: 'payments.get bare UUID',
		call: (c, o) => c.payments.get(PAY_ID.slice(4), undefined, o),
		method: 'GET',
		path: `/payments/${PAY_ID.slice(4)}`,
		reply: payment(),
	},
	{
		name: 'payments.getByReference',
		call: (c, o) => c.payments.getByReference(REF, o),
		method: 'GET',
		path: '/payments',
		query: REF_Q,
		reply: items(payment(REF)),
		check: (v) => expect(v.reference).toBe(REF),
	},
	{
		name: 'transactions.list',
		call: (c, o) =>
			c.transactions.list(
				{ includeMembers: true, refunded: true, type: 'bill', subscriptionUuid: SUB_ID },
				o
			),
		method: 'GET',
		path: '/transactions',
		query: `includeMembers=true&refunded=true&subscriptionUuid=${SUB_ID_Q}&type=bill`,
		reply: page(TRANSACTION),
		check: (v) =>
			expect([v.items[0].type, v.items[0].amountUsd, v.items[0].metadata]).toEqual([
				'bill',
				'9.99',
				{},
			]),
	},
	{
		name: 'failures.list',
		call: (c, o) =>
			c.failures.list(
				{
					limit: 3,
					kind: 'bill',
					category: 'allowanceExhausted',
					subscriptionUuid: SUB_ID,
				},
				o
			),
		method: 'GET',
		path: '/payment-failures',
		query: `category=allowanceExhausted&kind=bill&limit=3&subscriptionUuid=${SUB_ID_Q}`,
		reply: page(FAILURE),
		check: (v) => expect([v.items[0].kind, v.items[0].attempted]).toEqual(['bill', '9.99']),
	},

	// Subscriptions.
	{
		name: 'subscriptions.list',
		call: (c, o) =>
			c.subscriptions.list(
				{
					customerUuid: UUID_B,
					createdAfter: AFTER,
					status: 'pastDue',
					reference: 'crm:42',
				},
				o
			),
		method: 'GET',
		path: '/subscriptions',
		query: `createdAfter=${AFTER_Q}&customerUuid=${UUID_B}&reference=crm%3A42&status=pastDue`,
		reply: page(subscription()),
		check: (v) =>
			expect([v.items[0].status, v.items[0].allowance.remainingPeriods]).toEqual([
				'active',
				11,
			]),
	},
	{
		name: 'subscriptions.get',
		call: (c, o) => c.subscriptions.get(SUB_ID, undefined, o),
		method: 'GET',
		path: `/subscriptions/${SUB_ID}`,
		reply: subscription(),
	},
	{
		name: 'subscriptions.getByReference',
		call: (c, o) => c.subscriptions.getByReference(REF, o),
		method: 'GET',
		path: '/subscriptions',
		query: REF_Q,
		reply: items(subscription(REF)),
		check: (v) => expect(v.reference).toBe(REF),
	},
	{
		name: 'subscriptions.update',
		call: (c, o) =>
			c.subscriptions.update(SUB_ID, { metadata: { plan: 'pro-annual', coupon: '' } }, o),
		method: 'PATCH',
		path: `/subscriptions/${SUB_ID}`,
		body: { metadata: { plan: 'pro-annual', coupon: '' } },
		reply: subscription(),
		check: (v) => expect(v.metadata).toEqual({ plan: 'pro' }),
	},
	{
		name: 'subscriptions.update without metadata',
		call: (c, o) => c.subscriptions.update(SUB_ID, {}, o),
		method: 'PATCH',
		path: `/subscriptions/${SUB_ID}`,
		body: {},
		reply: subscription(),
	},
	{
		name: 'subscriptions.listBills',
		call: (c, o) => c.subscriptions.listBills(SUB_ID, { limit: 100, cursor: CURSOR }, o),
		method: 'GET',
		path: `/subscriptions/${SUB_ID}/bills`,
		query: `cursor=${CURSOR}&limit=100`,
		reply: page(BILL),
		check: (v) =>
			expect([v.items[0].uuid, v.items[0].subscriptionUuid]).toEqual(['sub-hist@1', 'sub@1']),
	},
	{
		name: 'subscriptions.getBill',
		call: (c, o) => c.subscriptions.getBill(BILL_ID, { includeMembers: true }, o),
		method: 'GET',
		path: `/bills/${BILL_ID}`,
		query: 'includeMembers=true',
		reply: BILL,
		check: (v) => expect([v.amount, v.periodEnd]).toEqual(['9.99', '2026-10-31T12:00:00Z']),
	},
	{
		name: 'subscriptions.cancel 202',
		call: (c, o) => c.subscriptions.cancel(SUB_ID, { immediate: false }, o),
		method: 'POST',
		path: `/subscriptions/${SUB_ID}/cancel`,
		query: 'immediate=false',
		status: 202,
		reply: subscription(),
		check: (v) => expect([v.pending, v.subscription.uuid]).toEqual([true, 'sub@1']),
	},
	{
		name: 'subscriptions.cancel 200',
		call: (c, o) => c.subscriptions.cancel(SUB_ID, undefined, o),
		method: 'POST',
		path: `/subscriptions/${SUB_ID}/cancel`,
		reply: '{"uuid":"sub@1","status":"cancelled","cancellationReason":"merchant"}',
		check: (v) => expect([v.pending, v.subscription.status]).toEqual([false, 'cancelled']),
	},
	{
		name: 'subscriptions.testBill',
		call: (c, o) => c.subscriptions.testBill(SUB_ID, o),
		method: 'POST',
		path: `/subscriptions/${SUB_ID}/test-bill`,
		reply: TEST_BILL,
		check: (v) =>
			expect([v.billUuid, v.stage, v.outcome]).toEqual(['sub-hist@1', 'done', 'paid']),
	},

	// Refunds.
	{
		name: 'refunds.list',
		call: (c, o) =>
			c.refunds.list(
				{
					limit: 5,
					cursor: CURSOR,
					status: ['pending', 'rejected'],
					txUuid: PAY_ID,
					includeMembers: false,
					held: true,
				},
				o
			),
		method: 'GET',
		path: '/refunds',
		// The statuses are a repeated key, in the order given.
		query: `cursor=${CURSOR}&held=true&includeMembers=false&limit=5&status=pending&status=rejected&txUuid=${PAY_ID_Q}`,
		reply: page(REFUND),
		check: (v) =>
			expect([v.items.length, !!v.items[0].approval, v.items[0].refundPercent]).toEqual([
				1,
				true,
				'50',
			]),
	},
	{
		name: 'refunds.list no status',
		call: (c, o) => c.refunds.list({ status: [], userUuid: MEMBER }, o),
		method: 'GET',
		path: '/refunds',
		query: `userUuid=${MEMBER}`,
		reply: page(REFUND),
	},
	{
		name: 'refunds.get',
		call: (c, o) => c.refunds.get(REFUND_ID, o),
		method: 'GET',
		path: `/refunds/${REFUND_ID}`,
		reply: REFUND,
		check: (v) =>
			expect([v.uuid, v.status, v.amount, v.currency.symbol]).toEqual([
				'refund@1',
				'pending',
				'5.0021',
				'USDC',
			]),
	},
	// Members.
	{
		name: 'members.list',
		call: (c, o) => c.members.list({ limit: 20, cursor: CURSOR }, o),
		method: 'GET',
		path: '/members',
		query: `cursor=${CURSOR}&limit=20`,
		reply: page(MEMBER_FX),
		check: (v) =>
			expect([
				v.items[0].userUuid,
				v.items[0].firstName,
				v.items[0].acceptedCurrencies[0].code,
			]).toEqual(['m-1', 'Ada', 'BASE:USDC']),
	},
	{
		name: 'members.get',
		call: (c, o) => c.members.get(MEMBER, o),
		method: 'GET',
		path: `/members/${MEMBER}`,
		reply: MEMBER_FX,
	},
	{
		name: 'members.update',
		call: (c, o) => c.members.update(MEMBER, { organizationFeePercent: '0' }, o),
		method: 'PATCH',
		path: `/members/${MEMBER}`,
		body: { organizationFeePercent: '0' },
		reply: MEMBER_FX,
		check: (v) => expect(v.organizationFeePercent).toBe('7.5'),
	},
	{
		name: 'members.remove',
		call: (c, o) => c.members.remove(MEMBER, o),
		method: 'DELETE',
		path: `/members/${MEMBER}`,
		status: 204,
		reply: '',
		check: isVoid,
	},
	{
		name: 'members.trust',
		call: (c, o) => c.members.trust(MEMBER, o),
		method: 'POST',
		path: `/members/${MEMBER}/trust`,
		reply: `{"userUuid":"${MEMBER}","trustedAt":"2026-10-07T10:00:00Z"}`,
		check: (v) => expect(v.trustedAt).toBe('2026-10-07T10:00:00Z'),
	},
	{
		name: 'members.listHeldFunds',
		call: (c, o) => c.members.listHeldFunds(o),
		method: 'GET',
		path: '/members/held-funds',
		reply: items(MEMBER_HELD_FUNDS),
		check: (v) => expect([v.length, v[0].count, v[0].totalUsd]).toEqual([1, 2, '98.5']),
	},
	{
		name: 'members.getHeldFunds',
		call: (c, o) => c.members.getHeldFunds(MEMBER, o),
		method: 'GET',
		path: `/members/${MEMBER}/held-funds`,
		reply: HELD_FUNDS,
		check: (v) =>
			expect([v.ledgers.length, v.ledgers[0].owed, v.totalUsd]).toEqual([
				1,
				'-10.0042',
				'-10.0042',
			]),
	},
	{
		name: 'members.getOwnHeldFunds',
		call: (c, o) => c.members.getOwnHeldFunds(o),
		method: 'GET',
		path: '/held-funds',
		reply: '{"ledgers":[],"totalUsd":"0"}',
		check: (v) => expect(v).toEqual({ ledgers: [], totalUsd: '0' }),
	},

	// Invitations.
	{
		name: 'invitations.create',
		call: (c, o) =>
			c.invitations.create(
				{
					email: 'seller@example.com',
					holdFunds: true,
					organizationFeePercent: '2.5',
					redirectUrl: 'https://shop.example/welcome',
				},
				o
			),
		method: 'POST',
		path: '/invitations',
		idempotent: true,
		status: 201,
		body: {
			email: 'seller@example.com',
			role: 'user',
			holdFunds: true,
			organizationFeePercent: '2.5',
			redirectUrl: 'https://shop.example/welcome',
		},
		reply: CREATED_INVITATION,
		// Flat: the invitation's fields and its link.
		check: (v) =>
			expect([v.uuid, v.status, v.holdFunds, !!v.link]).toEqual([
				'i-1',
				'pending',
				true,
				true,
			]),
	},
	{
		name: 'invitations.create minimal',
		call: (c, o) => c.invitations.create({ email: 'seller@example.com', holdFunds: false }, o),
		method: 'POST',
		path: '/invitations',
		idempotent: true,
		status: 201,
		body: { email: 'seller@example.com', role: 'user', holdFunds: false },
		reply: CREATED_INVITATION,
	},
	{
		name: 'invitations.create without its email',
		call: (c, o) =>
			c.invitations.create(
				{ email: 'seller@example.com', holdFunds: true, sendEmail: false },
				o
			),
		method: 'POST',
		path: '/invitations',
		idempotent: true,
		status: 201,
		body: { email: 'seller@example.com', role: 'user', holdFunds: true, sendEmail: false },
		reply: CREATED_INVITATION,
	},
	{
		name: 'invitations.list',
		call: (c, o) => c.invitations.list({ status: 'pending', limit: 10 }, o),
		method: 'GET',
		path: '/invitations',
		query: 'limit=10&status=pending',
		reply: page(INVITATION),
		check: (v) => expect(v.items[0].organizationFeePercent).toBe('2.5'),
	},
	{
		name: 'invitations.revoke',
		call: (c, o) => c.invitations.revoke(UUID_A, o),
		method: 'DELETE',
		path: `/invitations/${UUID_A}`,
		status: 204,
		reply: '',
		check: isVoid,
	},

	// Wallets.
	{
		name: 'wallets.list',
		call: (c, o) => c.wallets.list({ withBalances: true }, o),
		method: 'GET',
		path: '/wallets',
		query: 'withBalances=true',
		reply: items(WALLET),
		check: (v) =>
			expect([v.length, v[0].address, v[0].tokenWallets[0].balance.amount]).toEqual([
				1,
				'0xpk',
				'12.5',
			]),
	},
	{
		name: 'wallets.listForMember',
		call: (c, o) => c.wallets.listForMember(MEMBER, o),
		method: 'GET',
		path: `/members/${MEMBER}/wallets`,
		reply: items(WALLET),
	},
	{
		name: 'wallets.listAcceptedCurrencies',
		call: (c, o) => c.wallets.listAcceptedCurrencies({ userUuid: MEMBER }, o),
		method: 'GET',
		path: '/wallets/accepted-currencies',
		query: `userUuid=${MEMBER}`,
		reply: items(CUR, NATIVE),
		check: (v) => expect(v.map((x: any) => x.code)).toEqual(['BASE:USDC', 'BASE']),
	},

	// Accounting.
	{
		name: 'accounting.exportJson',
		call: (c, o) => c.accounting.exportJson('2026-09-01', '2026-09-30', o),
		method: 'GET',
		path: '/accounting/export',
		query: 'format=json&from=2026-09-01&to=2026-09-30',
		reply: items(ACCOUNTING_EVENT),
		check: (v) =>
			expect([v.length, v[0].type, v[0].txUuid, v[0].grossAmountUsd]).toEqual([
				1,
				'refund',
				'refund@1',
				'-10.0042',
			]),
	},
	{
		name: 'accounting.exportCsv',
		call: (c, o) => c.accounting.exportCsv('2026-09-01', '2026-09-30', o),
		method: 'GET',
		path: '/accounting/export',
		query: 'format=csv&from=2026-09-01&to=2026-09-30',
		accept: 'text/csv, application/json',
		reply: 'txUuid,type\npay@1,payment\n',
		contentType: 'text/csv',
		check: (v) => expect(v).toBe('txUuid,type\npay@1,payment\n'),
	},

	// Webhooks.
	{
		name: 'webhooks.verifyRemote',
		call: (c, o) => c.webhooks.verifyRemote(UUID_A, '{"id":"evt_1"}', 't=1790856000,v1=abc', o),
		method: 'POST',
		path: '/webhooks/verify',
		body: { endpointUuid: UUID_A, body: '{"id":"evt_1"}', signature: 't=1790856000,v1=abc' },
		reply: '{"valid":true}',
		check: isVoid,
	},
	{
		name: 'webhooks.endpoints.list',
		call: (c, o) => c.webhooks.endpoints.list({ limit: 5, cursor: CURSOR }, o),
		method: 'GET',
		path: '/webhooks/endpoints',
		query: `cursor=${CURSOR}&limit=5`,
		reply: page(ENDPOINT),
		check: (v) =>
			expect([v.items.length, v.items[0].url, v.hasMore]).toEqual([
				1,
				'https://x.io/hook',
				true,
			]),
	},
	{
		name: 'webhooks.endpoints.list no params',
		call: (c, o) => c.webhooks.endpoints.list(undefined, o),
		method: 'GET',
		path: '/webhooks/endpoints',
		reply: '{"items":[],"hasMore":false}',
	},
	{
		name: 'webhooks.endpoints.create',
		call: (c, o) =>
			c.webhooks.endpoints.create(
				{
					url: 'https://shop.example/hooks',
					events: ['payment.completed', 'member.joined'],
					includeMembers: false,
					description: 'Shop',
				},
				o
			),
		method: 'POST',
		path: '/webhooks/endpoints',
		idempotent: true,
		status: 201,
		body: {
			url: 'https://shop.example/hooks',
			events: ['payment.completed', 'member.joined'],
			includeMembers: false,
			description: 'Shop',
		},
		reply: ENDPOINT,
		check: (v) => expect([v.secret, v.uuid]).toEqual(['whsec_x', 'e-1']),
	},
	{
		name: 'webhooks.endpoints.get',
		call: (c, o) => c.webhooks.endpoints.get(UUID_A, o),
		method: 'GET',
		path: `/webhooks/endpoints/${UUID_A}`,
		reply: ENDPOINT,
	},
	{
		name: 'webhooks.endpoints.update',
		call: (c, o) =>
			c.webhooks.endpoints.update(
				UUID_A,
				{ events: [], description: '', payloadVersion: 'v2', enabled: true },
				o
			),
		method: 'PATCH',
		path: `/webhooks/endpoints/${UUID_A}`,
		body: { events: [], description: '', payloadVersion: 'v2', enabled: true },
		reply: ENDPOINT,
	},
	{
		name: 'webhooks.endpoints.delete',
		call: (c, o) => c.webhooks.endpoints.delete(UUID_A, o),
		method: 'DELETE',
		path: `/webhooks/endpoints/${UUID_A}`,
		status: 204,
		reply: '',
		check: isVoid,
	},
	{
		name: 'webhooks.events.list',
		call: (c, o) =>
			c.webhooks.events.list(
				{ limit: 2, cursor: CURSOR, type: 'webhook.test', includeMembers: true },
				o
			),
		method: 'GET',
		path: '/webhooks/events',
		query: `cursor=${CURSOR}&includeMembers=true&limit=2&type=webhook.test`,
		reply: `{"items":[${EVT}],"hasMore":false}`,
		check: (v) => {
			expect([v.items.length, v.hasMore, v.nextCursor]).toEqual([1, false, undefined]);
			expect(v.items[0].type).toBe('webhook.test');
			expect(v.items[0].data.endpointUuid).toBeTruthy();
		},
	},
	{
		name: 'webhooks.events.get',
		call: (c, o) => c.webhooks.events.get(EVENT_ID, o),
		method: 'GET',
		path: `/webhooks/events/${EVENT_ID}`,
		reply: JSON.stringify({
			...JSON.parse(EVT),
			id: EVENT_ID,
			deliveries: [
				{
					endpointUuid: UUID_A,
					url: 'https://x.io',
					delivered: true,
					attempts: [
						{
							uuid: UUID_B,
							eventId: EVENT_ID,
							eventType: 'webhook.test',
							endpointUuid: UUID_A,
							attempt: 1,
							delivered: true,
							statusCode: 200,
							durationMs: 12,
							attemptedAt: '2026-10-01T12:00:01Z',
						},
					],
				},
			],
		}),
		check: (v) => {
			const attempt = v.deliveries[0].attempts[0];
			expect([
				v.id,
				v.type,
				v.deliveries.length,
				v.deliveries[0].delivered,
				attempt.skipped,
			]).toEqual([EVENT_ID, 'webhook.test', 1, true, false]);
		},
	},

	// Currencies.
	{
		name: 'currencies.list',
		call: (c, o) => c.currencies.list({ test: true, main: true }, o),
		method: 'GET',
		path: '/currencies',
		query: 'main=true&test=true',
		reply: items(NATIVE),
		check: (v) => expect([v.length, v[0].code, v[0].address]).toEqual([1, 'BASE', undefined]),
	},
	{
		name: 'currencies.list no params',
		call: (c, o) => c.currencies.list(undefined, o),
		method: 'GET',
		path: '/currencies',
		reply: items(CUR),
	},
	{
		name: 'currencies.get',
		call: (c, o) => c.currencies.get(8, o),
		method: 'GET',
		path: '/currencies/8',
		reply: CUR,
		check: (v) => expect([v.id, v.code, v.chain]).toEqual([8, 'BASE:USDC', 'BASE']),
	},
];

function serve(rc: RouteCase) {
	return (_req: unknown, res: import('node:http').ServerResponse) => {
		res.writeHead(rc.status ?? 200, { 'Content-Type': rc.contentType ?? 'application/json' });
		res.end(rc.reply);
	};
}

describe('every method sends its request and decodes its answer', () => {
	it.each(ROUTES.map((r) => [r.name, r] as const))('%s', async (_name, rc) => {
		const ts = await testServer(serve(rc));
		const { client } = testClient(ts);
		const v = await rc.call(client);
		rc.check?.(v);
		// Request options: On-Behalf-Of, X-Request-Id and a caller's Idempotency-Key.
		await rc.call(client, {
			onBehalfOf: MEMBER,
			requestId: 'req-42',
			idempotencyKey: 'order-42',
		});

		expect(ts.recorded).toHaveLength(2);
		for (const r of ts.recorded) {
			expect([r.method, r.path, r.query]).toEqual([rc.method, rc.path, rc.query ?? '']);
			if (rc.body === undefined) {
				expect(r.body).toBe('');
				expect(r.headers['content-type']).toBeUndefined();
			} else {
				expect(r.headers['content-type']).toBe('application/json');
				expect(JSON.parse(r.body)).toEqual(rc.body);
			}
			expect(r.headers.accept).toBe(rc.accept ?? 'application/json');
			expect(r.headers['x-api-key']).toBe(TEST_API_KEY);
		}
		const [plain, opted] = ts.recorded;
		expect(plain.headers['on-behalf-of']).toBeUndefined();
		expect(opted.headers['on-behalf-of']).toBe(MEMBER);
		expect(opted.headers['x-request-id']).toBe('req-42');
		if (rc.idempotent) {
			expect(plain.headers['idempotency-key']).toMatch(UUID_V4);
			expect(opted.headers['idempotency-key']).toBe('order-42');
		} else {
			expect(plain.headers['idempotency-key']).toBeUndefined();
			expect(opted.headers['idempotency-key']).toBeUndefined();
		}
	});
});

describe('retry policy per method', () => {
	it('retries a 503 on the reads and the 6 idempotent creates only, with a stable key', async () => {
		const idempotent = new Set<string>();
		for (const rc of ROUTES) {
			const ts = await testServer((req, res, n) => {
				if (n === 0)
					reply(res, 503, '{"error":"unavailable","code":"network_unavailable"}');
				else serve(rc)(req, res);
			});
			const { client } = testClient(ts);
			const result = await rc
				.call(client)
				.then(() => undefined)
				.catch((err: unknown) => err);
			const retried = rc.method === 'GET' || rc.idempotent;
			if (!retried) {
				expect({
					name: rc.name,
					err: result instanceof ServerError,
					n: ts.recorded.length,
				}).toEqual({
					name: rc.name,
					err: true,
					n: 1,
				});
				continue;
			}
			expect({ name: rc.name, err: result, n: ts.recorded.length }).toEqual({
				name: rc.name,
				err: undefined,
				n: 2,
			});
			if (rc.idempotent) {
				idempotent.add(
					rc.name.replace(
						/ (minimal|with fees|processing fee off|without its email)$/,
						''
					)
				);
				const [k0, k1] = ts.recorded.map((r) => r.headers['idempotency-key']);
				expect(k0).toBeTruthy();
				expect(k1).toBe(k0);
				expect(ts.recorded[1].body).toBe(ts.recorded[0].body);
			}
		}
		expect([...idempotent].sort()).toEqual([
			'checkoutSessions.createPayment',
			'checkoutSessions.createSubscription',
			'customers.create',
			'invitations.create',
			'products.create',
			'webhooks.endpoints.create',
		]);
	});
});

describe('errors reach the caller typed', () => {
	it('on actions, the CSV export, deletes and iterators', async () => {
		const ts = await testServer(
			staticReply(
				409,
				'{"error":"Unknown checkout","code":"tx_already_sent","requestId":"r-1"}'
			)
		);
		const err = (await rejection(
			testClient(ts).client.checkoutSessions.expire(PAY_ID)
		)) as ConflictError;
		expect([err instanceof ConflictError, err.code, err.requestId]).toEqual([
			true,
			'tx_already_sent',
			'r-1',
		]);

		const ts2 = await testServer(
			staticReply(400, '{"error":"window too long","code":"bad_request"}')
		);
		expect(
			await rejection(testClient(ts2).client.accounting.exportCsv('2026-01-01', '2026-09-30'))
		).toBeInstanceOf(BadRequestError);

		const ts3 = await testServer(staticReply(404, '{"error":"not found","code":"not_found"}'));
		const c3 = testClient(ts3).client;
		expect(await rejection(c3.subscriptions.cancel(SUB_ID))).toBeInstanceOf(NotFoundError);
		expect(await rejection(c3.products.delete(UUID_A))).toBeInstanceOf(NotFoundError);
		expect(await rejection(c3.invitations.revoke(UUID_A))).toBeInstanceOf(NotFoundError);
		expect(await rejection(collect(c3.customers.iterate()))).toBeInstanceOf(NotFoundError);
		expect(await rejection(c3.products.getByReference('pro'))).toBeInstanceOf(NotFoundError);
		expect(await rejection(c3.wallets.list())).toBeInstanceOf(NotFoundError);
	});

	it('a test bill of a live subscription is a BadRequestError test_mode_only', async () => {
		const ts = await testServer(
			staticReply(400, '{"error":"test mode only","code":"test_mode_only"}')
		);
		const err = (await rejection(
			testClient(ts).client.subscriptions.testBill(SUB_ID)
		)) as BadRequestError;
		expect([err instanceof BadRequestError, err.code]).toEqual([true, 'test_mode_only']);
		expect(ts.recorded).toHaveLength(1); // never retried
	});

	it('a 204 delete ignores any body; a 200 one too', async () => {
		const ts = await testServer((_req, res) => reply(res, 200, '{"message":"deleted"}'));
		await expect(testClient(ts).client.customers.delete(UUID_A)).resolves.toBeUndefined();
	});

	it('a 2xx without the subscription is a ServerError', async () => {
		const ts = await testServer((_req, res) => {
			res.writeHead(202);
			res.end();
		});
		expect(await rejection(testClient(ts).client.subscriptions.cancel(SUB_ID))).toBeInstanceOf(
			ServerError
		);
	});
});

describe('validation before the request', () => {
	const cursor201 = 'c'.repeat(201);
	const cases: Array<[string, string, (c: QBitFlow) => Promise<unknown>]> = [
		['products.get empty', 'uuid', (c) => c.products.get('')],
		['products.get not uuid', 'uuid', (c) => c.products.get('42')],
		['products.update', 'uuid', (c) => c.products.update('../x', {})],
		['products.delete', 'uuid', (c) => c.products.delete('')],
		['products.getByReference blank', 'reference', (c) => c.products.getByReference('  ')],
		['products.getByReference space', 'reference', (c) => c.products.getByReference('a b')],
		['products.getByReference slash', 'reference', (c) => c.products.getByReference('a/b')],
		[
			'products.getByReference 101',
			'reference',
			(c) => c.products.getByReference('r'.repeat(101)),
		],
		['products.list reference', 'reference', (c) => c.products.list({ reference: 'a b' })],
		['products.list cursor', 'cursor', (c) => c.products.list({ cursor: cursor201 })],
		['customers.get', 'uuid', (c) => c.customers.get(`pay@${UUID_A}`)],
		['customers.update', 'uuid', (c) => c.customers.update('', {})],
		['customers.delete', 'uuid', (c) => c.customers.delete('x')],
		['customers.getByReference', 'reference', (c) => c.customers.getByReference('')],
		['customers.list reference', 'reference', (c) => c.customers.list({ reference: 'a b' })],
		['checkoutSessions.get', 'uuid', (c) => c.checkoutSessions.get('')],
		['checkoutSessions.expire', 'uuid', (c) => c.checkoutSessions.expire('cs_123')],
		['payments.get', 'uuid', (c) => c.payments.get('pay@123')],
		['payments.getByReference', 'reference', (c) => c.payments.getByReference('')],
		['payments.list reference', 'reference', (c) => c.payments.list({ reference: 'o 1' })],
		['subscriptions.get', 'uuid', (c) => c.subscriptions.get(`bad@${UUID_A}`)],
		['subscriptions.getByReference', 'reference', (c) => c.subscriptions.getByReference('')],
		['subscriptions.update uuid', 'uuid', (c) => c.subscriptions.update('sub-1', {})],
		[
			'subscriptions.update metadata key',
			'metadata',
			(c) => c.subscriptions.update(SUB_ID, { metadata: { 'a/b': 'v' } }),
		],
		[
			'subscriptions.update metadata value',
			'metadata.k',
			(c) => c.subscriptions.update(SUB_ID, { metadata: { k: 'a\tb' } }),
		],
		['subscriptions.listBills', 'uuid', (c) => c.subscriptions.listBills('')],
		['subscriptions.getBill', 'billUuid', (c) => c.subscriptions.getBill('1')],
		['subscriptions.cancel', 'uuid', (c) => c.subscriptions.cancel('', { immediate: true })],
		['subscriptions.testBill', 'uuid', (c) => c.subscriptions.testBill('sub')],
		['refunds.get empty', 'uuid', (c) => c.refunds.get('')],
		['refunds.get not an id', 'uuid', (c) => c.refunds.get('refund-1')],
		['members.get', 'userUuid', (c) => c.members.get('')],
		[
			'members.update',
			'userUuid',
			(c) => c.members.update('1', { organizationFeePercent: '0' }),
		],
		['members.remove', 'userUuid', (c) => c.members.remove('')],
		['members.trust', 'userUuid', (c) => c.members.trust('x')],
		['members.getHeldFunds', 'userUuid', (c) => c.members.getHeldFunds('')],
		['members.list cursor', 'cursor', (c) => c.members.list({ cursor: cursor201 })],
		['invitations.revoke', 'uuid', (c) => c.invitations.revoke('')],
		['wallets.listForMember', 'userUuid', (c) => c.wallets.listForMember('1')],
		['webhooks.endpoints.get', 'uuid', (c) => c.webhooks.endpoints.get('')],
		['webhooks.endpoints.update', 'uuid', (c) => c.webhooks.endpoints.update('x', {})],
		['webhooks.endpoints.delete', 'uuid', (c) => c.webhooks.endpoints.delete('')],
		[
			'webhooks.endpoints.list cursor',
			'cursor',
			(c) => c.webhooks.endpoints.list({ cursor: cursor201 }),
		],
		['webhooks.events.get', 'id', (c) => c.webhooks.events.get('')],
		[
			'webhooks.verifyRemote uuid',
			'endpointUuid',
			(c) => c.webhooks.verifyRemote('', '{}', 't=1,v1=a'),
		],
		[
			'webhooks.verifyRemote empty body',
			'body',
			(c) => c.webhooks.verifyRemote(UUID_A, '', 't=1,v1=a'),
		],
		[
			'webhooks.verifyRemote utf8',
			'body',
			(c) => c.webhooks.verifyRemote(UUID_A, Buffer.from([0xff]), 't=1,v1=a'),
		],
		[
			'webhooks.verifyRemote lone surrogate',
			'body',
			(c) => c.webhooks.verifyRemote(UUID_A, '{"a":"\ud800"}', 't=1,v1=a'),
		],
		[
			'webhooks.verifyRemote 1 MiB',
			'body',
			(c) => c.webhooks.verifyRemote(UUID_A, 'a'.repeat((1 << 20) + 1), 't=1,v1=a'),
		],
		['currencies.get', 'id', (c) => c.currencies.get(0)],
		['products.create no params', '', (c) => c.products.create(undefined as never)],
		['products.update no params', '', (c) => c.products.update(UUID_A, undefined as never)],
		['customers.create no params', '', (c) => c.customers.create(undefined as never)],
		['customers.update no params', '', (c) => c.customers.update(UUID_A, null as never)],
		[
			'subscriptions.update no params',
			'',
			(c) => c.subscriptions.update(SUB_ID, undefined as never),
		],
		[
			'checkoutSessions.createPayment no params',
			'',
			(c) => c.checkoutSessions.createPayment(undefined as never),
		],
		[
			'checkoutSessions.createSubscription no params',
			'',
			(c) => c.checkoutSessions.createSubscription(undefined as never),
		],
		['members.update no params', '', (c) => c.members.update(MEMBER, undefined as never)],
		['invitations.create no params', '', (c) => c.invitations.create(undefined as never)],
		[
			'webhooks.endpoints.create no params',
			'',
			(c) => c.webhooks.endpoints.create(undefined as never),
		],
		[
			'webhooks.endpoints.update no params',
			'',
			(c) => c.webhooks.endpoints.update(UUID_A, undefined as never),
		],
		[
			'products.create priceUsd negative',
			'priceUsd',
			(c) => c.products.create({ name: 'Pro', priceUsd: '-1' }),
		],
		[
			'products.create priceUsd 3 decimals',
			'priceUsd',
			(c) => c.products.create({ name: 'Pro', priceUsd: '9.999' }),
		],
		[
			'products.create priceUsd a number',
			'priceUsd',
			(c) => c.products.create({ name: 'Pro', priceUsd: 9.99 as never }),
		],
		[
			'products.create metadata',
			'metadata',
			(c) => c.products.create({ name: 'Pro', priceUsd: '1', metadata: { 'a b': 'v' } }),
		],
		['products.update name', 'name', (c) => c.products.update(UUID_A, { name: '<b>' })],
		[
			'products.update priceUsd',
			'priceUsd',
			(c) => c.products.update(UUID_A, { priceUsd: '1e2' }),
		],
		[
			'customers.create email',
			'email',
			(c) => c.customers.create({ firstName: 'Ada', email: 'ada' }),
		],
		[
			'customers.create firstName',
			'firstName',
			(c) => c.customers.create({ firstName: '', email: 'ada@example.com' }),
		],
		[
			'customers.update phone',
			'phoneNumber',
			(c) => c.customers.update(UUID_A, { phoneNumber: 'call me' }),
		],
		['customers.list email', 'email', (c) => c.customers.list({ email: 'x' })],
		[
			'checkoutSessions.createPayment mixed',
			'productUuid',
			(c) =>
				c.checkoutSessions.createPayment({ productUuid: UUID_A, productReference: 'pro' }),
		],
		[
			'checkoutSessions.createPayment inline without price',
			'priceUsd',
			(c) => c.checkoutSessions.createPayment({ productName: 'T-shirt' }),
		],
		[
			'checkoutSessions.createSubscription frequency',
			'frequency.unit',
			(c) =>
				c.checkoutSessions.createSubscription({
					productUuid: UUID_A,
					frequency: { value: 1 },
				}),
		],
		[
			'checkoutSessions.createSubscription fee label',
			'fees.items[0].label',
			(c) =>
				c.checkoutSessions.createSubscription({
					productUuid: UUID_A,
					fees: { items: [{ label: '', amountUsd: '2' }] },
				}),
		],
		[
			'checkoutSessions.createPayment fee amount a number',
			'fees.items[0].amountUsd',
			(c) =>
				c.checkoutSessions.createPayment({
					productUuid: UUID_A,
					fees: { items: [{ label: 'VAT', amountUsd: 2 as never }] },
				}),
		],
		[
			'payments.list exclusive',
			'userUuid',
			(c) => c.payments.list({ includeMembers: true, userUuid: MEMBER }),
		],
		['transactions.list type', 'type', (c) => c.transactions.list({ type: 'refund' })],
		[
			'transactions.list subscriptionUuid',
			'subscriptionUuid',
			(c) => c.transactions.list({ subscriptionUuid: 'sub-1' }),
		],
		['failures.list kind', 'kind', (c) => c.failures.list({ kind: 'refund' })],
		[
			'subscriptions.list reference',
			'reference',
			(c) => c.subscriptions.list({ reference: 'c 1' }),
		],
		['refunds.list userUuid', 'userUuid', (c) => c.refunds.list({ userUuid: '1' })],
		[
			'refunds.list exclusive',
			'userUuid',
			(c) => c.refunds.list({ includeMembers: true, userUuid: MEMBER }),
		],
		[
			'refunds.list status unknown',
			'status[1]',
			(c) => c.refunds.list({ status: ['approved', 'denied'] }),
		],
		[
			'refunds.list status 6',
			'status',
			(c) =>
				c.refunds.list({
					status: ['pending', 'approved', 'rejected', 'failed', 'pending', 'approved'],
				}),
		],
		['refunds.list txUuid', 'txUuid', (c) => c.refunds.list({ txUuid: 'order-1' })],
		[
			'members.update fee',
			'organizationFeePercent',
			(c) => c.members.update(MEMBER, { organizationFeePercent: '51' }),
		],
		[
			'members.update fee required',
			'organizationFeePercent',
			(c) => c.members.update(MEMBER, {} as never),
		],
		['invitations.create email', 'email', (c) => c.invitations.create({} as never)],
		[
			'invitations.create fee',
			'organizationFeePercent',
			(c) =>
				c.invitations.create({
					email: 'a@b.co',
					holdFunds: true,
					organizationFeePercent: '2.555',
				}),
		],
		['invitations.list status', 'status', (c) => c.invitations.list({ status: 'open' })],
		[
			'wallets.listAcceptedCurrencies',
			'userUuid',
			(c) => c.wallets.listAcceptedCurrencies({ userUuid: 'x' }),
		],
		[
			'accounting.exportJson order',
			'to',
			(c) => c.accounting.exportJson('2026-09-30', '2026-09-01'),
		],
		[
			'accounting.exportCsv date',
			'from',
			(c) => c.accounting.exportCsv('2026-02-30', '2026-03-01'),
		],
		[
			'webhooks.endpoints.create url',
			'url',
			(c) => c.webhooks.endpoints.create({ url: 'ftp://x' }),
		],
		[
			'webhooks.endpoints.update test event',
			'events[0]',
			(c) => c.webhooks.endpoints.update(UUID_A, { events: ['webhook.test'] }),
		],
		[
			'webhooks.endpoints.update payload version',
			'payloadVersion',
			(c) => c.webhooks.endpoints.update(UUID_A, { payloadVersion: 'v1' }),
		],
		[
			'webhooks.events.list cursor',
			'cursor',
			(c) => c.webhooks.events.list({ cursor: cursor201 }),
		],
		[
			'iterator: bad subscription id',
			'uuid',
			(c) => collect(c.subscriptions.iterateBills('nope')),
		],
		[
			'iterator: bad onBehalfOf',
			'onBehalfOf',
			(c) => collect(c.members.iterate(undefined, { onBehalfOf: 'x' })),
		],
		[
			'iterator: bad refund status',
			'status[0]',
			(c) => collect(c.refunds.iterate({ status: ['completed'] })),
		],
	];

	it.each(cases)('%s', async (_name, field, call) => {
		const ts = await testServer(staticReply(200, '{}'));
		const err = (await rejection(call(testClient(ts).client))) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.status).toBeUndefined();
		if (field) expect(err.fieldErrors.map((f) => f.field)).toContain(field);
		expect(ts.recorded).toHaveLength(0);
	});
});

describe('webhooks.verifyRemote', () => {
	const body = '{"id":"evt_1"}';
	const header = 't=1790856000,v1=abc';
	it.each<[string, number, string, (err: unknown) => void]>([
		['valid', 200, '{"message":"ok"}', (err) => expect(err).toBeUndefined()],
		[
			'invalid signature',
			400,
			'{"error":"invalid signature","code":"invalid_signature","requestId":"r-9"}',
			(err) => {
				const se = err as WebhookSignatureError;
				expect(se).toBeInstanceOf(WebhookSignatureError);
				expect([se.reason, se.status, se.code, se.requestId]).toEqual([
					'invalidSignature',
					400,
					'invalid_signature',
					'r-9',
				]);
			},
		],
		[
			'validation',
			400,
			'{"error":"invalid","code":"validation_failed","details":{"errors":[{"field":"signature","message":"required"}]}}',
			(err) => {
				expect(err).toBeInstanceOf(ValidationError);
				expect((err as ValidationError).status).toBe(400);
				expect(err).not.toBeInstanceOf(WebhookSignatureError);
			},
		],
		[
			'other bad request',
			400,
			'{"error":"bad","code":"bad_request"}',
			(err) => {
				expect(err).toBeInstanceOf(BadRequestError);
				expect(err).not.toBeInstanceOf(WebhookSignatureError);
			},
		],
		[
			'not found',
			404,
			'{"error":"not found","code":"not_found"}',
			(err) => expect(err).toBeInstanceOf(NotFoundError),
		],
		[
			'server',
			500,
			'{"error":"boom","code":"internal"}',
			(err) => expect(err).toBeInstanceOf(ServerError),
		],
		[
			'unauthorized',
			401,
			'{"error":"no","code":"unauthorized"}',
			(err) => expect(err).toBeInstanceOf(AuthenticationError),
		],
	])('%s', async (_name, status, answer, check) => {
		const ts = await testServer(staticReply(status, answer));
		const err = await testClient(ts)
			.client.webhooks.verifyRemote(UUID_A, body, header)
			.then(() => undefined)
			.catch((e: unknown) => e);
		check(err);
		expect(ts.recorded).toHaveLength(1); // never retried
	});

	it('an empty header is a signature failure found without a request', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		const err = (await rejection(
			testClient(ts).client.webhooks.verifyRemote(UUID_A, body, '')
		)) as WebhookSignatureError;
		expect(err).toBeInstanceOf(WebhookSignatureError);
		expect(err.reason).toBe('missingHeader');
		expect(ts.recorded).toHaveLength(0);
	});

	it('sends a Buffer body as text', async () => {
		const ts = await testServer(staticReply(200, '{}'));
		await testClient(ts).client.webhooks.verifyRemote(UUID_A, Buffer.from(body), header);
		expect(JSON.parse(ts.recorded[0].body).body).toBe(body);
	});
});

describe('every iterator', () => {
	const uuidItem = (i: number) => `{"uuid":"id${i}"}`;
	const cases: Array<
		[
			string,
			string,
			string,
			(i: number) => string,
			(c: QBitFlow) => AsyncIterableIterator<any>,
			(v: any) => string,
		]
	> = [
		[
			'products.iterate',
			'/products',
			'includeHidden=true&limit=2',
			uuidItem,
			(c) => c.products.iterate({ limit: 2, includeHidden: true }),
			(v) => v.uuid,
		],
		[
			'customers.iterate',
			'/customers',
			'email=a%40b.co&limit=2&verified=false',
			uuidItem,
			(c) => c.customers.iterate({ limit: 2, email: 'a@b.co', verified: false }),
			(v) => v.uuid,
		],
		[
			'payments.iterate',
			'/payments',
			`createdAfter=${AFTER_Q}&limit=2`,
			uuidItem,
			(c) => c.payments.iterate({ limit: 2, createdAfter: AFTER }),
			(v) => v.uuid,
		],
		[
			'transactions.iterate',
			'/transactions',
			'type=payment',
			uuidItem,
			(c) => c.transactions.iterate({ type: 'payment' }),
			(v) => v.uuid,
		],
		[
			'failures.iterate',
			'/payment-failures',
			'category=reverted',
			uuidItem,
			(c) => c.failures.iterate({ category: 'reverted' }),
			(v) => v.uuid,
		],
		[
			'subscriptions.iterate',
			'/subscriptions',
			'includeMembers=true&status=active',
			uuidItem,
			(c) => c.subscriptions.iterate({ includeMembers: true, status: 'active' }),
			(v) => v.uuid,
		],
		[
			'subscriptions.iterateBills',
			`/subscriptions/${SUB_ID}/bills`,
			'limit=100',
			uuidItem,
			(c) => c.subscriptions.iterateBills(SUB_ID, { limit: 100 }),
			(v) => v.uuid,
		],
		[
			'refunds.iterate',
			'/refunds',
			'held=false&status=approved&status=rejected',
			uuidItem,
			(c) => c.refunds.iterate({ held: false, status: ['approved', 'rejected'] }),
			(v) => v.uuid,
		],
		[
			'members.iterate',
			'/members',
			'limit=1',
			(i) => `{"userUuid":"id${i}"}`,
			(c) => c.members.iterate({ limit: 1 }),
			(v) => v.userUuid,
		],
		[
			'invitations.iterate',
			'/invitations',
			'status=expired',
			uuidItem,
			(c) => c.invitations.iterate({ status: 'expired' }),
			(v) => v.uuid,
		],
		[
			'webhooks.endpoints.iterate',
			'/webhooks/endpoints',
			'limit=1',
			uuidItem,
			(c) => c.webhooks.endpoints.iterate({ limit: 1 }),
			(v) => v.uuid,
		],
		[
			'webhooks.events.iterate',
			'/webhooks/events',
			'type=payment.completed',
			(i) =>
				`{"id":"id${i}","type":"payment.completed","version":"v2","createdAt":"2026-10-01T12:00:00Z","data":{}}`,
			(c) => c.webhooks.events.iterate({ type: 'payment.completed' }),
			(v) => v.id,
		],
	];

	it.each(cases)('%s', async (_name, path, filters, item, walk, id) => {
		const ts = await testServer((req, res) => {
			const cursor = new URLSearchParams(req.query).get('cursor') ?? '';
			if (cursor === '')
				reply(
					res,
					200,
					`{"items":[${item(0)},${item(1)}],"hasMore":true,"nextCursor":"id1"}`
				);
			else if (cursor === 'id1') reply(res, 200, `{"items":[${item(2)}],"hasMore":false}`);
			else reply(res, 400, '{"error":"bad cursor","code":"validation_failed"}');
		});
		const { client } = testClient(ts);
		expect((await collect(walk(client))).map(id)).toEqual(['id0', 'id1', 'id2']);
		expect(ts.recorded).toHaveLength(2);
		ts.recorded.forEach((r, i) => {
			expect([r.method, r.path]).toEqual(['GET', path]);
			const q = new URLSearchParams(r.query);
			const cursor = q.get('cursor') ?? '';
			q.delete('cursor');
			expect(r.query.replace(/(^|&)cursor=[^&]*/, '').replace(/^&/, '')).toBe(filters);
			expect(cursor).toBe(['', 'id1'][i]);
		});
		// An early break stops after the first page.
		expect(await collect(walk(client), 1)).toHaveLength(1);
		expect(ts.recorded).toHaveLength(3);
	});

	it('an error ends the walk after the items before it', async () => {
		const ts = await testServer((req, res) => {
			if (!req.query.includes('cursor'))
				reply(res, 200, '{"items":[{"uuid":"id0"}],"hasMore":true,"nextCursor":"id0x"}');
			else reply(res, 401, '{"error":"unauthorized","code":"unauthorized"}');
		});
		const got: string[] = [];
		const err = await rejection(
			(async () => {
				for await (const p of testClient(ts).client.payments.iterate()) got.push(p.uuid);
			})()
		);
		expect(err).toBeInstanceOf(AuthenticationError);
		expect(got).toEqual(['id0']);
	});
});

describe('getByReference', () => {
	const methods: Array<[string, string, (c: QBitFlow, r: string) => Promise<any>, string]> = [
		['products', '/products', (c, r) => c.products.getByReference(r), 'product'],
		['customers', '/customers', (c, r) => c.customers.getByReference(r), 'customer'],
		['payments', '/payments', (c, r) => c.payments.getByReference(r), 'payment'],
		[
			'subscriptions',
			'/subscriptions',
			(c, r) => c.subscriptions.getByReference(r),
			'subscription',
		],
	];

	it.each(methods)('%s: runs the list filter and returns the item', async (_n, path, call) => {
		const ts = await testServer(
			staticReply(200, `{"items":[{"uuid":"x-1","reference":"order-1042"}],"hasMore":false}`)
		);
		const v = await call(testClient(ts).client, 'order-1042');
		expect([v.uuid, v.reference]).toEqual(['x-1', 'order-1042']);
		expect(ts.recorded.map((r) => [r.method, r.path, r.query])).toEqual([
			['GET', path, 'reference=order-1042'],
		]);
	});

	it.each(methods)(
		'%s: no item is a NotFoundError (404, not_found) with the request id',
		async (_n, _path, call, what) => {
			const ts = await testServer((_req, res) =>
				reply(res, 200, '{"items":[],"hasMore":false}', { 'X-Request-Id': 'req-77' })
			);
			const err = (await rejection(
				call(testClient(ts).client, 'order-1042')
			)) as NotFoundError;
			expect(err).toBeInstanceOf(NotFoundError);
			expect([err.status, err.code, err.requestId, err.details]).toEqual([
				404,
				'not_found',
				'req-77',
				{},
			]);
			expect(err.rawMessage).toBe(`no ${what} with this reference`);
			expect(ts.recorded).toHaveLength(1);
		}
	);

	it('compares the reference exactly: a server that ignored the filter finds nothing', async () => {
		const ts = await testServer(
			staticReply(
				200,
				`{"items":[${product('ORDER-1042')},${product('order-1042 ')},${product('other')}],"hasMore":false}`
			)
		);
		expect(
			await rejection(testClient(ts).client.products.getByReference('order-1042'))
		).toBeInstanceOf(NotFoundError);
	});

	it('sends a reference of dots in the query (no path segment to resolve)', async () => {
		const ts = await testServer(staticReply(200, items(subscription('..'))));
		expect((await testClient(ts).client.subscriptions.getByReference('..')).reference).toBe(
			'..'
		);
		expect([ts.recorded[0].path, ts.recorded[0].query]).toEqual([
			'/subscriptions',
			'reference=..',
		]);
	});

	it('picks the matching item among several', async () => {
		const ts = await testServer(
			staticReply(200, items(customer('crm-0'), customer('crm-1'), customer('crm-2')))
		);
		const v = await testClient(ts).client.customers.getByReference('crm-1');
		expect(v.reference).toBe('crm-1');
	});

	it('a body that is not a page finds nothing; a bare array is a ServerError', async () => {
		const ts = await testServer(staticReply(200, product('pro')));
		expect(
			await rejection(testClient(ts).client.products.getByReference('pro'))
		).toBeInstanceOf(NotFoundError);
		const ts2 = await testServer(staticReply(200, `[${product('pro')}]`));
		expect(
			await rejection(testClient(ts2).client.products.getByReference('pro'))
		).toBeInstanceOf(ServerError);
	});

	it('is a read: retried on a 503, without an Idempotency-Key', async () => {
		const ts = await testServer((_req, res, n) => {
			if (n === 0) reply(res, 503, '{"error":"unavailable","code":"network_unavailable"}');
			else reply(res, 200, items(payment('order-1042')));
		});
		const v = await testClient(ts).client.payments.getByReference('order-1042', {
			idempotencyKey: 'ignored',
		});
		expect(v.reference).toBe('order-1042');
		expect(ts.recorded).toHaveLength(2);
		for (const r of ts.recorded) expect(r.headers['idempotency-key']).toBeUndefined();
	});
});

describe('bounded lists', () => {
	const methods: Array<[string, string, (c: QBitFlow) => Promise<any[]>, string, string]> = [
		[
			'wallets.list',
			'/wallets',
			(c) => c.wallets.list({ withBalances: true }),
			'withBalances=true',
			WALLET,
		],
		[
			'wallets.listForMember',
			`/members/${MEMBER}/wallets`,
			(c) => c.wallets.listForMember(MEMBER),
			'',
			WALLET,
		],
		[
			'wallets.listAcceptedCurrencies',
			'/wallets/accepted-currencies',
			(c) => c.wallets.listAcceptedCurrencies({ userUuid: MEMBER }),
			`userUuid=${MEMBER}`,
			CUR,
		],
		[
			'currencies.list',
			'/currencies',
			(c) => c.currencies.list({ main: true }),
			'main=true',
			CUR,
		],
		[
			'members.listHeldFunds',
			'/members/held-funds',
			(c) => c.members.listHeldFunds(),
			'',
			MEMBER_HELD_FUNDS,
		],
		[
			'accounting.exportJson',
			'/accounting/export',
			(c) => c.accounting.exportJson('2026-01-01', '2026-03-31'),
			'format=json&from=2026-01-01&to=2026-03-31',
			ACCOUNTING_EVENT,
		],
	];

	it.each(methods)(
		'%s follows a nextCursor that claims more, the filters kept',
		async (_n, path, call, query, item) => {
			const ts = await testServer((req, res) => {
				const cursor = new URLSearchParams(req.query).get('cursor');
				if (cursor === null)
					reply(res, 200, `{"items":[${item}],"hasMore":true,"nextCursor":"c1"}`);
				else reply(res, 200, `{"items":[${item},${item}],"hasMore":false}`);
			});
			expect(await call(testClient(ts).client)).toHaveLength(3);
			expect(ts.recorded.map((r) => [r.method, r.path])).toEqual([
				['GET', path],
				['GET', path],
			]);
			expect(ts.recorded[0].query).toBe(query);
			const second = new URLSearchParams(ts.recorded[1].query);
			expect(second.get('cursor')).toBe('c1');
			second.delete('cursor');
			expect(Object.fromEntries(second)).toEqual(
				Object.fromEntries(new URLSearchParams(query))
			);
		}
	);

	it.each<[string, string[]]>([
		['hasMore without a nextCursor', ['{"items":[ITEM],"hasMore":true}']],
		[
			'a nextCursor that does not move',
			[
				'{"items":[ITEM],"hasMore":true,"nextCursor":"c1"}',
				'{"items":[ITEM],"hasMore":true,"nextCursor":"c1"}',
			],
		],
		[
			'an empty page that claims more',
			[
				'{"items":[ITEM],"hasMore":true,"nextCursor":"c1"}',
				'{"items":[],"hasMore":true,"nextCursor":"c2"}',
			],
		],
	])('stops on %s', async (_n, pages) => {
		const ts = await testServer((_req, res, n) =>
			reply(res, 200, pages[Math.min(n, pages.length - 1)].replace('ITEM', CUR))
		);
		const got = await testClient(ts).client.currencies.list();
		expect(ts.recorded).toHaveLength(pages.length);
		expect(got).toHaveLength(pages.filter((p) => p.includes('ITEM')).length);
	});

	it('an absent or null items is an empty list; a bare array is a ServerError', async () => {
		const ts = await testServer(staticReply(200, '{"items":null,"hasMore":false}'));
		expect(await testClient(ts).client.wallets.list()).toEqual([]);
		const ts2 = await testServer(staticReply(200, `[${CUR}]`));
		expect(await rejection(testClient(ts2).client.currencies.list())).toBeInstanceOf(
			ServerError
		);
	});

	it('an error on a later page is thrown', async () => {
		const ts = await testServer((_req, res, n) => {
			if (n === 0) reply(res, 200, `{"items":[${CUR}],"hasMore":true,"nextCursor":"c1"}`);
			else reply(res, 401, '{"error":"unauthorized","code":"unauthorized"}');
		});
		expect(await rejection(testClient(ts).client.currencies.list())).toBeInstanceOf(
			AuthenticationError
		);
	});
});
