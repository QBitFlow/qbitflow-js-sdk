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
import { MODEL_FIXTURES } from './fixtures/models';
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
const SUB_ID = 'sub@019eca82-5680-7b00-8000-0000000000d2';
const BILL_ID = 'sub-hist@019eca82-5680-7b00-8000-0000000000d3';
const EVENT_ID = 'evt_bd1a913d-188e-5ac5-a2d6-5fd25cd67301';
const ODD_REF = 'a/b c@d'; // a reference that needs escaping
const ODD_REF_ES = 'a%2Fb%20c@d'; // … as sent
const AFTER = '2026-09-01T12:00:00+02:00';
const AFTER_Q = '2026-09-01T12%3A00%3A00%2B02%3A00';
const BEFORE = new Date(Date.UTC(2026, 9, 1, 0, 0, 0, 500));
const BEFORE_Q = '2026-10-01T00%3A00%3A00.500Z';

const fx = (name: string) => MODEL_FIXTURES[name];
const page = (item: string) => `{"items":[${item}],"nextCursor":"${UUID_B}"}`;
const list = (item: string) => `[${item}]`;
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

const ROUTES: RouteCase[] = [
	// Products.
	{
		name: 'products.list',
		call: (c, o) => c.products.list({ includeHidden: true, subscription: false }, o),
		method: 'GET',
		path: '/product',
		query: 'includeHidden=true&subscription=false',
		reply: list(fx('Product')),
		check: (v) => expect([v.length, v[0].uuid, !!v[0].subscription]).toEqual([1, 'p-1', true]),
	},
	{
		name: 'products.list no params',
		call: (c, o) => c.products.list(undefined, o),
		method: 'GET',
		path: '/product',
		reply: '[]',
	},
	{
		name: 'products.create',
		call: (c, o) =>
			c.products.create(
				{
					name: 'Pro',
					price: 9.99,
					reference: 'pro',
					subscription: {
						frequency: { value: 1, unit: 'months' },
						trialPeriod: { value: 0 },
						minPeriods: 3,
					},
				},
				o
			),
		method: 'POST',
		path: '/product',
		idempotent: true,
		status: 201,
		body: {
			name: 'Pro',
			price: 9.99,
			reference: 'pro',
			subscription: {
				frequency: { value: 1, unit: 'months' },
				trialPeriod: { value: 0 },
				minPeriods: 3,
			},
		},
		reply: fx('Product'),
		check: (v) => expect([v.uuid, v.price]).toEqual(['p-1', 9.99]),
	},
	{
		name: 'products.get',
		call: (c, o) => c.products.get(UUID_A, o),
		method: 'GET',
		path: `/product/uuid/${UUID_A}`,
		reply: fx('Product'),
	},
	{
		name: 'products.getByReference',
		call: (c, o) => c.products.getByReference(ODD_REF, o),
		method: 'GET',
		path: `/product/reference/${ODD_REF_ES}`,
		reply: fx('Product'),
	},
	{
		name: 'products.update',
		call: (c, o) =>
			c.products.update(UUID_A, { description: '', price: 12, isActive: false }, o),
		method: 'PUT',
		path: `/product/${UUID_A}`,
		body: { description: '', price: 12, isActive: false },
		reply: fx('Product'),
	},
	{
		name: 'products.delete',
		call: (c, o) => c.products.delete(UUID_A, o),
		method: 'DELETE',
		path: `/product/${UUID_A}`,
		reply: '{"message":"Product deleted successfully"}',
		check: (v) => expect(v).toBeUndefined(),
	},

	// Customers.
	{
		name: 'customers.create',
		call: (c, o) =>
			c.customers.create(
				{
					name: 'Ada',
					lastName: 'Lovelace',
					email: 'ada@example.com',
					phoneNumber: '+33 6 12 34 56 78',
					reference: 'crm-1',
				},
				o
			),
		method: 'POST',
		path: '/customer',
		idempotent: true,
		status: 201,
		body: {
			name: 'Ada',
			lastName: 'Lovelace',
			email: 'ada@example.com',
			phoneNumber: '+33 6 12 34 56 78',
			reference: 'crm-1',
		},
		reply: fx('Customer'),
		check: (v) => expect([v.uuid, v.verified, v.userUuid]).toEqual(['c-1', true, 'm-1']),
	},
	{
		name: 'customers.update',
		call: (c, o) =>
			c.customers.update(UUID_A, { email: 'new@example.com', phoneNumber: '' }, o),
		method: 'PUT',
		path: `/customer/${UUID_A}`,
		body: { email: 'new@example.com', phoneNumber: '' },
		reply: fx('Customer'),
	},
	{
		name: 'customers.list',
		call: (c, o) =>
			c.customers.list(
				{ limit: 5, cursor: UUID_A, email: 'ada+1@example.com', verified: true },
				o
			),
		method: 'GET',
		path: '/customer/all',
		query: `cursor=${UUID_A}&email=ada%2B1%40example.com&limit=5&verified=true`,
		reply: page(fx('Customer')),
		check: (v) => expect([v.items.length, v.hasMore, v.nextCursor]).toEqual([1, true, UUID_B]),
	},
	{
		name: 'customers.get',
		call: (c, o) => c.customers.get(UUID_A, o),
		method: 'GET',
		path: `/customer/uuid/${UUID_A}`,
		reply: fx('Customer'),
	},
	{
		name: 'customers.getByEmail',
		call: (c, o) => c.customers.getByEmail('ada+1@example.com', o),
		method: 'GET',
		path: '/customer/email/ada+1@example.com',
		reply: fx('Customer'),
	},
	{
		name: 'customers.getByReference',
		call: (c, o) => c.customers.getByReference(ODD_REF, o),
		method: 'GET',
		path: `/customer/reference/${ODD_REF_ES}`,
		reply: fx('Customer'),
	},
	{
		name: 'customers.delete',
		call: (c, o) => c.customers.delete(UUID_A, o),
		method: 'DELETE',
		path: `/customer/uuid/${UUID_A}`,
		reply: '{"message":"Customer deleted successfully"}',
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
					price: 4.5,
					successUrl: 'https://shop.example/ok?id={{UUID}}',
					cancelUrl: 'https://shop.example/ko',
					customerReference: 'crm-1',
					expiresInMinutes: 30,
				},
				o
			),
		method: 'POST',
		path: '/transaction/session-checkout/new/payment',
		idempotent: true,
		status: 201,
		body: {
			reference: 'order-1',
			productName: 'T-shirt',
			description: 'Blue',
			price: 4.5,
			successUrl: 'https://shop.example/ok?id={{UUID}}',
			cancelUrl: 'https://shop.example/ko',
			customerReference: 'crm-1',
			expiresInMinutes: 30,
		},
		reply: fx('CheckoutSession'),
		check: (v) => expect([v.uuid, !!v.link, !!v.expiresAt]).toEqual(['pay@1', true, true]),
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
								amountUsd: 0.75,
							},
							{ label: 'VAT (20%)', amountUsd: '19.90' },
						],
					},
				},
				o
			),
		method: 'POST',
		path: '/transaction/session-checkout/new/payment',
		idempotent: true,
		status: 201,
		body: {
			productUuid: UUID_A,
			fees: {
				processingFee: true,
				items: [
					{ label: 'Shipping', description: 'Standard, 3 to 5 days', amountUsd: 0.75 },
					{ label: 'VAT (20%)', amountUsd: '19.90' },
				],
			},
		},
		reply: fx('CheckoutSession'),
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
		path: '/transaction/session-checkout/new/subscription',
		idempotent: true,
		status: 201,
		body: {
			productUuid: UUID_A,
			customerUuid: UUID_B,
			frequency: { value: 1, unit: 'weeks' },
			trialPeriod: { value: 14, unit: 'days' },
			minPeriods: 0,
		},
		reply: fx('CheckoutSession'),
	},
	{
		name: 'checkoutSessions.getStatus',
		call: (c, o) => c.checkoutSessions.getStatus(PAY_ID, o),
		method: 'GET',
		path: `/transaction/session-checkout/${PAY_ID}/status`,
		reply: fx('CheckoutSessionStatus'),
		check: (v) => expect([v.status, !!v.lastAttempt]).toEqual(['created', true]),
	},
	{
		name: 'checkoutSessions.expire',
		call: (c, o) => c.checkoutSessions.expire(SUB_ID, o),
		method: 'POST',
		path: `/transaction/session-checkout/${SUB_ID}/expire`,
		reply: `{"uuid":"${SUB_ID}","status":"expired"}`,
		check: (v) => expect(v.status).toBe('expired'),
	},

	// Payments and failures.
	{
		name: 'payments.list',
		call: (c, o) =>
			c.payments.list(
				{
					limit: 50,
					cursor: UUID_A,
					customerUuid: UUID_B,
					productUuid: UUID_A,
					createdAfter: AFTER,
					createdBefore: BEFORE,
					userUuid: MEMBER,
					refunded: false,
				},
				o
			),
		method: 'GET',
		path: '/transaction/payments',
		query: `createdAfter=${AFTER_Q}&createdBefore=${BEFORE_Q}&cursor=${UUID_A}&customerUuid=${UUID_B}&limit=50&productUuid=${UUID_A}&refunded=false&userUuid=${MEMBER}`,
		reply: page(fx('Payment')),
		check: (v) =>
			expect([v.items.length, v.items[0].uuid, !!v.items[0].currency]).toEqual([
				1,
				'pay@1',
				true,
			]),
	},
	{
		name: 'payments.listCombined',
		call: (c, o) =>
			c.payments.listCombined(
				{
					includeMembers: true,
					refunded: true,
					source: 'subscriptionHistory',
					subscriptionUuid: SUB_ID,
				},
				o
			),
		method: 'GET',
		path: '/transaction/payments/combined',
		query: 'includeMembers=true&refunded=true&source=subscriptionHistory&subscriptionUuid=sub%40019eca82-5680-7b00-8000-0000000000d2',
		reply: page(fx('CombinedPayment')),
		check: (v) => expect(v.items[0].source).toBe('subscriptionHistory'),
	},
	{
		name: 'payments.get',
		call: (c, o) => c.payments.get(PAY_ID, { includeMembers: true }, o),
		method: 'GET',
		path: `/transaction/payment/${PAY_ID}`,
		query: 'includeMembers=true',
		reply: fx('Payment'),
		check: (v) =>
			expect([v.reference, !!v.metadata.organizationFee]).toEqual(['order-1', true]),
	},
	{
		name: 'payments.get bare UUID',
		call: (c, o) => c.payments.get(PAY_ID.slice(4), undefined, o),
		method: 'GET',
		path: `/transaction/payment/${PAY_ID.slice(4)}`,
		reply: fx('Payment'),
	},
	{
		name: 'payments.getByReference',
		call: (c, o) => c.payments.getByReference(ODD_REF, o),
		method: 'GET',
		path: `/transaction/payment/reference/${ODD_REF_ES}`,
		reply: fx('Payment'),
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
		path: '/transaction/failures',
		query: 'category=allowanceExhausted&kind=bill&limit=3&subscriptionUuid=sub%40019eca82-5680-7b00-8000-0000000000d2',
		reply: page(fx('Failure')),
		check: (v) => expect(v.items[0].kind).toBe('bill'),
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
		path: '/transaction/subscriptions',
		query: `createdAfter=${AFTER_Q}&customerUuid=${UUID_B}&reference=crm%3A42&status=pastDue`,
		reply: page(fx('Subscription')),
		check: (v) => expect([v.items[0].status, !!v.items[0].dunning]).toEqual(['stopped', true]),
	},
	{
		name: 'subscriptions.get',
		call: (c, o) => c.subscriptions.get(SUB_ID, undefined, o),
		method: 'GET',
		path: `/transaction/subscription/${SUB_ID}`,
		reply: fx('Subscription'),
	},
	{
		name: 'subscriptions.getByReference',
		call: (c, o) => c.subscriptions.getByReference(ODD_REF, o),
		method: 'GET',
		path: `/transaction/subscription/reference/subscription/${ODD_REF_ES}`,
		reply: fx('Subscription'),
	},
	{
		name: 'subscriptions.listBills',
		call: (c, o) => c.subscriptions.listBills(SUB_ID, { limit: 100, cursor: UUID_A }, o),
		method: 'GET',
		path: `/transaction/subscription/${SUB_ID}/bills`,
		query: `cursor=${UUID_A}&limit=100`,
		reply: page(fx('Bill')),
		check: (v) =>
			expect([v.items[0].uuid, v.items[0].subscriptionUuid]).toEqual(['sub-hist@1', 'sub@1']),
	},
	{
		name: 'subscriptions.getBill',
		call: (c, o) => c.subscriptions.getBill(BILL_ID, { includeMembers: true }, o),
		method: 'GET',
		path: `/transaction/subscription/bill/${BILL_ID}`,
		query: 'includeMembers=true',
		reply: fx('Bill'),
	},
	{
		name: 'subscriptions.getPublicHistory',
		call: (c, o) => c.subscriptions.getPublicHistory(SUB_ID, o),
		method: 'GET',
		path: `/transaction/subscription/history/${SUB_ID}`,
		reply: '[{"uuid":"sub-hist@1","createdAt":"2026-10-01T12:00:00+02:00","amount":9.99,"periodStart":"2026-10-01T12:00:00Z"}]',
		check: (v) =>
			expect([v.length, v[0].amount, v[0].customerUuid, v[0].metadata.feePercent]).toEqual([
				1,
				9.99,
				undefined,
				0,
			]),
	},
	{
		name: 'subscriptions.cancel 202',
		call: (c, o) => c.subscriptions.cancel(SUB_ID, { immediate: false }, o),
		method: 'POST',
		path: `/transaction/subscription/processing/force-cancel/${SUB_ID}`,
		query: 'immediate=false',
		status: 202,
		reply: fx('Subscription'),
		check: (v) => expect([v.pending, v.subscription.uuid]).toEqual([true, 'sub@1']),
	},
	{
		name: 'subscriptions.cancel 200',
		call: (c, o) => c.subscriptions.cancel(SUB_ID, undefined, o),
		method: 'POST',
		path: `/transaction/subscription/processing/force-cancel/${SUB_ID}`,
		reply: '{"uuid":"sub@1","status":"cancelled","cancellationReason":"merchant"}',
		check: (v) => expect([v.pending, v.subscription.status]).toEqual([false, 'cancelled']),
	},
	{
		name: 'subscriptions.executeTestBilling',
		call: (c, o) => c.subscriptions.executeTestBilling(SUB_ID, o),
		method: 'POST',
		path: `/transaction/subscription/processing/execute-billing/${SUB_ID}`,
		reply: fx('BillingState'),
		check: (v) => expect([v.stage, v.outcome]).toEqual(['done', 'paid']),
	},

	// Refunds.
	{
		name: 'refunds.list',
		// limit and cursor are listInactive's: never sent here.
		call: (c, o) =>
			c.refunds.list({ limit: 5, cursor: UUID_A, includeMembers: false, held: true }, o),
		method: 'GET',
		path: '/transaction/refunds/all',
		query: 'held=true&includeMembers=false',
		reply: list(fx('Refund')),
		check: (v) =>
			expect([v.length, !!v[0].approval, v[0].status]).toEqual([1, true, 'pending']),
	},
	{
		name: 'refunds.listInactive',
		call: (c, o) => c.refunds.listInactive({ limit: 5, cursor: UUID_A, userUuid: MEMBER }, o),
		method: 'GET',
		path: '/transaction/refunds/all/inactive',
		query: `cursor=${UUID_A}&limit=5&userUuid=${MEMBER}`,
		reply: page(fx('Refund')),
	},
	{
		name: 'refunds.initiate',
		call: (c, o) =>
			c.refunds.initiate(
				{
					txUuid: BILL_ID,
					refundPercent: 50.5,
					reason: 'Damaged',
					merchantMessage: 'Sorry',
				},
				o
			),
		method: 'POST',
		path: '/transaction/refunds/initiate',
		idempotent: true,
		status: 201,
		body: { txUuid: BILL_ID, refundPercent: 50.5, reason: 'Damaged', merchantMessage: 'Sorry' },
		reply: fx('Refund'),
		check: (v) => expect([v.uuid, v.txUuid]).toEqual(['refund@1', 'pay@1']),
	},

	// Members.
	{
		name: 'members.list',
		call: (c, o) => c.members.list({ limit: 20, cursor: MEMBER }, o),
		method: 'GET',
		path: '/members',
		query: `cursor=${MEMBER}&limit=20`,
		reply: page(fx('Member')),
		check: (v) =>
			expect([v.items[0].userUuid, v.items[0].acceptedCurrencyIds.length]).toEqual([
				'm-1',
				3,
			]),
	},
	{
		name: 'members.get',
		call: (c, o) => c.members.get(MEMBER, o),
		method: 'GET',
		path: `/members/${MEMBER}`,
		reply: fx('Member'),
	},
	{
		name: 'members.update',
		call: (c, o) => c.members.update(MEMBER, { organizationFeePercent: 0 }, o),
		method: 'PUT',
		path: `/members/${MEMBER}`,
		body: { organizationFeePercent: 0 },
		reply: fx('Member'),
	},
	{
		name: 'members.remove',
		call: (c, o) => c.members.remove(MEMBER, o),
		method: 'DELETE',
		path: `/members/${MEMBER}`,
		reply: '{"message":"Member removed"}',
	},
	{
		name: 'members.trust',
		call: (c, o) => c.members.trust(MEMBER, o),
		method: 'POST',
		path: `/members/${MEMBER}/trust`,
		reply: `{"userUuid":"${MEMBER}","trustedAt":"2026-10-07T10:00:00+02:00"}`,
		check: (v) => expect(v.trustedAt).toBe('2026-10-07T10:00:00+02:00'),
	},
	{
		name: 'members.listHeldFunds',
		call: (c, o) => c.members.listHeldFunds(o),
		method: 'GET',
		path: '/members/held-funds',
		reply: list(fx('MemberHeldFundsSummary')),
		check: (v) => expect([v.length, v[0].count]).toEqual([1, 2]),
	},
	{
		name: 'members.getHeldFunds',
		call: (c, o) => c.members.getHeldFunds(MEMBER, o),
		method: 'GET',
		path: `/members/${MEMBER}/held-funds`,
		reply: fx('HeldFunds'),
		check: (v) => expect([v.ledgers.length, v.totalAmount]).toEqual([1, -10.0042]),
	},
	{
		name: 'members.getOwnHeldFunds',
		call: (c, o) => c.members.getOwnHeldFunds(o),
		method: 'GET',
		path: '/user/held-funds',
		reply: '{"ledgers":[],"totalAmount":0}',
	},

	// Invitations.
	{
		name: 'invitations.create',
		call: (c, o) =>
			c.invitations.create(
				{
					email: 'seller@example.com',
					trustLayer: true,
					organizationFeePercent: 2.5,
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
			trustLayer: true,
			organizationFeePercent: 2.5,
			redirectUrl: 'https://shop.example/welcome',
		},
		reply: fx('InvitationCreated'),
		check: (v) => expect([!!v.link, v.invitation.status]).toEqual([true, 'pending']),
	},
	{
		name: 'invitations.create minimal',
		call: (c, o) => c.invitations.create({ email: 'seller@example.com', trustLayer: false }, o),
		method: 'POST',
		path: '/invitations',
		idempotent: true,
		status: 201,
		body: { email: 'seller@example.com', role: 'user', trustLayer: false },
		reply: fx('InvitationCreated'),
	},
	{
		name: 'invitations.list',
		call: (c, o) => c.invitations.list({ status: 'pending' }, o),
		method: 'GET',
		path: '/invitations',
		query: 'status=pending',
		reply: page(fx('Invitation')),
	},
	{
		name: 'invitations.revoke',
		call: (c, o) => c.invitations.revoke(UUID_A, o),
		method: 'DELETE',
		path: `/invitations/${UUID_A}`,
		reply: fx('Invitation'),
		check: (v) => expect(v.uuid).toBe('i-1'),
	},

	// Wallets.
	{
		name: 'wallets.list',
		call: (c, o) => c.wallets.list({ withBalances: true }, o),
		method: 'GET',
		path: '/wallet/user',
		query: 'withBalances=true',
		reply: list(fx('Wallet')),
		check: (v) => expect([v.length, !!v[0].tokenWallets[0].balance]).toEqual([1, true]),
	},
	{
		name: 'wallets.listForMember',
		call: (c, o) => c.wallets.listForMember(MEMBER, o),
		method: 'GET',
		path: `/wallet/user/${MEMBER}`,
		reply: list(fx('Wallet')),
	},
	{
		name: 'wallets.listSupportedCurrencies',
		call: (c, o) => c.wallets.listSupportedCurrencies({ userUuid: MEMBER }, o),
		method: 'GET',
		path: '/wallet/supported-currencies',
		query: `userUuid=${MEMBER}`,
		reply: list(fx('Currency')),
		check: (v) => expect([v.length, !!v[0].mainCurrency]).toEqual([1, true]),
	},

	// Accounting.
	{
		name: 'accounting.exportJson',
		call: (c, o) => c.accounting.exportJson('2026-09-01', '2026-09-30', o),
		method: 'GET',
		path: '/accounting/export',
		query: 'format=json&from=2026-09-01&to=2026-09-30',
		reply: list(fx('AccountingEvent')),
		check: (v) => expect([v.length, v[0].type]).toEqual([1, 'refund']),
	},
	{
		name: 'accounting.exportCsv',
		call: (c, o) => c.accounting.exportCsv('2026-09-01', '2026-09-30', o),
		method: 'GET',
		path: '/accounting/export',
		query: 'format=csv&from=2026-09-01&to=2026-09-30',
		accept: 'text/csv, application/json',
		reply: 'paymentUuid,type\npay@1,payment\n',
		contentType: 'text/csv',
		check: (v) => expect(v).toBe('paymentUuid,type\npay@1,payment\n'),
	},

	// Webhooks.
	{
		name: 'webhooks.verifyRemote',
		call: (c, o) => c.webhooks.verifyRemote(UUID_A, '{"id":"evt_1"}', 't=1790856000,v1=abc', o),
		method: 'POST',
		path: '/webhooks/verify',
		body: { endpointUuid: UUID_A, body: '{"id":"evt_1"}', signature: 't=1790856000,v1=abc' },
		reply: '{"message":"Signature valid"}',
	},
	{
		name: 'webhooks.endpoints.list',
		call: (c, o) => c.webhooks.endpoints.list(o),
		method: 'GET',
		path: '/webhooks/endpoints',
		reply: list(fx('WebhookEndpointCreated')),
		check: (v) => expect([v.length, v[0].url]).toEqual([1, 'https://x.io/hook']),
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
		reply: fx('WebhookEndpointCreated'),
		check: (v) => expect([v.secret, v.uuid]).toEqual(['whsec_x', 'e-1']),
	},
	{
		name: 'webhooks.endpoints.get',
		call: (c, o) => c.webhooks.endpoints.get(UUID_A, o),
		method: 'GET',
		path: `/webhooks/endpoints/${UUID_A}`,
		reply: fx('WebhookEndpointCreated'),
	},
	{
		name: 'webhooks.endpoints.update',
		call: (c, o) =>
			c.webhooks.endpoints.update(
				UUID_A,
				{ events: [], description: '', payloadVersion: 'v2', enabled: true },
				o
			),
		method: 'PUT',
		path: `/webhooks/endpoints/${UUID_A}`,
		body: { events: [], description: '', payloadVersion: 'v2', enabled: true },
		reply: fx('WebhookEndpointCreated'),
	},
	{
		name: 'webhooks.endpoints.delete',
		call: (c, o) => c.webhooks.endpoints.delete(UUID_A, o),
		method: 'DELETE',
		path: `/webhooks/endpoints/${UUID_A}`,
		reply: '{"message":"Endpoint deleted"}',
	},
	{
		name: 'webhooks.events.list',
		call: (c, o) =>
			c.webhooks.events.list(
				{ limit: 2, cursor: EVENT_ID, type: 'webhook.test', includeMembers: true },
				o
			),
		method: 'GET',
		path: '/webhooks/events',
		query: `cursor=${EVENT_ID}&includeMembers=true&limit=2&type=webhook.test`,
		reply: `{"items":[${EVT}],"nextCursor":null}`,
		check: (v) => {
			expect([v.items.length, v.hasMore]).toEqual([1, false]);
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
							attemptedAt: '2026-10-01T12:00:01+02:00',
						},
					],
				},
			],
		}),
		check: (v) => {
			expect([
				v.id,
				v.type,
				v.deliveries.length,
				v.deliveries[0].attempts.length,
				v.deliveries[0].delivered,
			]).toEqual([EVENT_ID, 'webhook.test', 1, 1, true]);
		},
	},

	// Currencies.
	{
		name: 'currencies.listAvailable',
		call: (c, o) => c.currencies.listAvailable({ test: true }, o),
		method: 'GET',
		path: '/utils/all-available-currencies',
		query: 'test=true',
		reply: list(fx('Currency')),
	},
	{
		name: 'currencies.listMain',
		call: (c, o) => c.currencies.listMain(undefined, o),
		method: 'GET',
		path: '/utils/all-main-currencies',
		reply: list(fx('Currency')),
	},
	{
		name: 'currencies.get',
		call: (c, o) => c.currencies.get(8, o),
		method: 'GET',
		path: '/utils/currency/id/8',
		reply: fx('Currency'),
		check: (v) => expect([v.id, v.symbol]).toEqual([8, 'USDC']),
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
	it('retries a 503 on the reads and the 7 idempotent creates only, with a stable key', async () => {
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
				idempotent.add(rc.name.replace(/ (minimal|with fees)$/, ''));
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
			'refunds.initiate',
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
		expect(await rejection(collect(c3.customers.iterate()))).toBeInstanceOf(NotFoundError);
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
	const cases: Array<[string, string, (c: QBitFlow) => Promise<unknown>]> = [
		['products.get empty', 'uuid', (c) => c.products.get('')],
		['products.get not uuid', 'uuid', (c) => c.products.get('42')],
		['products.update', 'uuid', (c) => c.products.update('../x', {})],
		['products.delete', 'uuid', (c) => c.products.delete('')],
		['products.getByReference', 'reference', (c) => c.products.getByReference('  ')],
		['products.getByReference dots', 'reference', (c) => c.products.getByReference('..')],
		['customers.get', 'uuid', (c) => c.customers.get(`pay@${UUID_A}`)],
		['customers.update', 'uuid', (c) => c.customers.update('', {})],
		['customers.delete', 'uuid', (c) => c.customers.delete('x')],
		['customers.getByEmail', 'email', (c) => c.customers.getByEmail('')],
		['customers.getByReference', 'reference', (c) => c.customers.getByReference('')],
		['checkoutSessions.getStatus', 'uuid', (c) => c.checkoutSessions.getStatus('')],
		['checkoutSessions.expire', 'uuid', (c) => c.checkoutSessions.expire('cs_123')],
		['payments.get', 'uuid', (c) => c.payments.get('pay@123')],
		['payments.getByReference', 'reference', (c) => c.payments.getByReference('')],
		['subscriptions.get', 'uuid', (c) => c.subscriptions.get(`bad@${UUID_A}`)],
		['subscriptions.getByReference', 'reference', (c) => c.subscriptions.getByReference('')],
		['subscriptions.listBills', 'uuid', (c) => c.subscriptions.listBills('')],
		['subscriptions.getBill', 'billUuid', (c) => c.subscriptions.getBill('1')],
		[
			'subscriptions.getPublicHistory',
			'subscriptionUuid',
			(c) => c.subscriptions.getPublicHistory(''),
		],
		['subscriptions.cancel', 'uuid', (c) => c.subscriptions.cancel('', { immediate: true })],
		[
			'subscriptions.executeTestBilling',
			'uuid',
			(c) => c.subscriptions.executeTestBilling('sub'),
		],
		['members.get', 'userUuid', (c) => c.members.get('')],
		['members.update', 'userUuid', (c) => c.members.update('1', { organizationFeePercent: 0 })],
		['members.remove', 'userUuid', (c) => c.members.remove('')],
		['members.trust', 'userUuid', (c) => c.members.trust('x')],
		['members.getHeldFunds', 'userUuid', (c) => c.members.getHeldFunds('')],
		['invitations.revoke', 'uuid', (c) => c.invitations.revoke('')],
		['wallets.listForMember', 'userUuid', (c) => c.wallets.listForMember('1')],
		['webhooks.endpoints.get', 'uuid', (c) => c.webhooks.endpoints.get('')],
		['webhooks.endpoints.update', 'uuid', (c) => c.webhooks.endpoints.update('x', {})],
		['webhooks.endpoints.delete', 'uuid', (c) => c.webhooks.endpoints.delete('')],
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
			'checkoutSessions.createPayment no params',
			'',
			(c) => c.checkoutSessions.createPayment(undefined as never),
		],
		[
			'checkoutSessions.createSubscription no params',
			'',
			(c) => c.checkoutSessions.createSubscription(undefined as never),
		],
		['refunds.initiate no params', '', (c) => c.refunds.initiate(undefined as never)],
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
		['products.create price', 'price', (c) => c.products.create({ name: 'Pro', price: -1 })],
		['products.update name', 'name', (c) => c.products.update(UUID_A, { name: '<b>' })],
		[
			'customers.create email',
			'email',
			(c) => c.customers.create({ name: 'Ada', email: 'ada' }),
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
			'checkoutSessions.createSubscription frequency',
			'frequency.unit',
			(c) =>
				c.checkoutSessions.createSubscription({
					productUuid: UUID_A,
					frequency: { value: 1 },
				}),
		],
		[
			'payments.list exclusive',
			'userUuid',
			(c) => c.payments.list({ includeMembers: true, userUuid: MEMBER }),
		],
		[
			'payments.listCombined source',
			'source',
			(c) => c.payments.listCombined({ source: 'bills' }),
		],
		['failures.list kind', 'kind', (c) => c.failures.list({ kind: 'refund' })],
		[
			'subscriptions.list status',
			'status',
			(c) => c.subscriptions.list({ status: 'lowOnFunds' }),
		],
		['refunds.list userUuid', 'userUuid', (c) => c.refunds.list({ userUuid: '1' })],
		[
			'refunds.listInactive exclusive',
			'userUuid',
			(c) => c.refunds.listInactive({ includeMembers: true, userUuid: MEMBER }),
		],
		[
			'refunds.initiate percent',
			'refundPercent',
			(c) => c.refunds.initiate({ txUuid: PAY_ID, refundPercent: 0 }),
		],
		[
			'members.update fee',
			'organizationFeePercent',
			(c) => c.members.update(MEMBER, { organizationFeePercent: 51 }),
		],
		['invitations.create email', 'email', (c) => c.invitations.create({} as never)],
		['invitations.list status', 'status', (c) => c.invitations.list({ status: 'open' })],
		[
			'wallets.listSupportedCurrencies',
			'userUuid',
			(c) => c.wallets.listSupportedCurrencies({ userUuid: 'x' }),
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
			'webhooks.events.list type',
			'type',
			(c) => c.webhooks.events.list({ type: 'payment.failed' }),
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
			'customers.iterate',
			'/customer/all',
			'email=a%40b.co&limit=2&verified=false',
			uuidItem,
			(c) => c.customers.iterate({ limit: 2, email: 'a@b.co', verified: false }),
			(v) => v.uuid,
		],
		[
			'payments.iterate',
			'/transaction/payments',
			`createdAfter=${AFTER_Q}&limit=2`,
			uuidItem,
			(c) => c.payments.iterate({ limit: 2, createdAfter: AFTER }),
			(v) => v.uuid,
		],
		[
			'payments.iterateCombined',
			'/transaction/payments/combined',
			'source=payment',
			uuidItem,
			(c) => c.payments.iterateCombined({ source: 'payment' }),
			(v) => v.uuid,
		],
		[
			'failures.iterate',
			'/transaction/failures',
			'category=reverted',
			uuidItem,
			(c) => c.failures.iterate({ category: 'reverted' }),
			(v) => v.uuid,
		],
		[
			'subscriptions.iterate',
			'/transaction/subscriptions',
			'includeMembers=true&status=active',
			uuidItem,
			(c) => c.subscriptions.iterate({ includeMembers: true, status: 'active' }),
			(v) => v.uuid,
		],
		[
			'subscriptions.iterateBills',
			`/transaction/subscription/${SUB_ID}/bills`,
			'limit=100',
			uuidItem,
			(c) => c.subscriptions.iterateBills(SUB_ID, { limit: 100 }),
			(v) => v.uuid,
		],
		[
			'refunds.iterateInactive',
			'/transaction/refunds/all/inactive',
			'held=false',
			uuidItem,
			(c) => c.refunds.iterateInactive({ held: false }),
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
				reply(res, 200, `{"items":[${item(0)},${item(1)}],"nextCursor":"id1"}`);
			else if (cursor === 'id1') reply(res, 200, `{"items":[${item(2)}],"nextCursor":null}`);
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
				reply(res, 200, '{"items":[{"uuid":"id0"}],"nextCursor":"id0x"}');
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
