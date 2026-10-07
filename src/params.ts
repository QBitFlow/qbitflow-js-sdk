/**
 * Each params type's checks (behaviour §8), query string and request body. Bodies carry the
 * wire names explicitly and only the params' known fields; a field left out (or, for the
 * fields the API treats so, left empty) is omitted. The clearable fields
 * (`UpdateCustomerParams.phoneNumber`/`address`, `UpdateProductParams.description`,
 * `UpdateWebhookEndpointParams.description`) send an explicit `''`.
 *
 * @internal Not part of the public API.
 */

import { isRFC3339 } from './decode.js';
import { Query } from './encode.js';
import {
	CombinedPaymentSource,
	EventType,
	FailureCategory,
	FailureKind,
	InvitationStatus,
	knownValues,
	SubscriptionStatus,
} from './enums.js';
import type {
	CreatePaymentSessionParams,
	CreateSubscriptionSessionParams,
} from './models/checkout.js';
import type { Duration, ReadParams, TransactionListFilters } from './models/common.js';
import type {
	CreateCustomerParams,
	CustomerListParams,
	UpdateCustomerParams,
} from './models/customers.js';
import type {
	CreateInvitationParams,
	InvitationListParams,
	MemberListParams,
	UpdateMemberParams,
} from './models/members.js';
import type {
	CombinedPaymentListParams,
	FailureListParams,
	PaymentListParams,
} from './models/payments.js';
import type {
	CreateProductParams,
	ProductListParams,
	SubscriptionTermsParams,
	UpdateProductParams,
} from './models/products.js';
import type { InitiateRefundParams, RefundListParams } from './models/refunds.js';
import type {
	BillListParams,
	CancelSubscriptionParams,
	SubscriptionListParams,
} from './models/subscriptions.js';
import type {
	CurrencyListParams,
	SupportedCurrenciesParams,
	WalletListParams,
} from './models/wallets.js';
import type {
	CreateWebhookEndpointParams,
	EventListParams,
	UpdateWebhookEndpointParams,
} from './models/webhooks.js';
import { optionalParams, requireParams, Validator } from './validate.js';

type Body = Record<string, unknown>;

/** A plain object with only the entries that are not `undefined`. */
function compact(entries: Body): Body {
	const out: Body = {};
	for (const [key, value] of Object.entries(entries)) if (value !== undefined) out[key] = value;
	return out;
}

/** A string field the API omits when empty (Go `omitempty`): `''` is left out. */
const nonEmpty = (value: string | undefined | null): string | undefined =>
	typeof value === 'string' && value !== '' ? value : undefined;

/** A number field the API omits when zero (Go `omitempty`): `0` is left out. */
const nonZero = (value: number | undefined | null): number | undefined =>
	typeof value === 'number' && value !== 0 ? value : undefined;

/** A value given (not `undefined`/`null`): sent even when empty or zero. */
const given = <T>(value: T | undefined | null): T | undefined =>
	value === undefined || value === null ? undefined : value;

/** A duration's wire form: `{value, unit}` (`unit` omitted when empty). */
function durationBody(d: Duration | undefined | null): Body | undefined {
	if (d === undefined || d === null) return undefined;
	return compact({ value: d.value, unit: nonEmpty(d.unit) });
}

// ── Shared list filters ─────────────────────────────────────────────────────

/** Checks an instant filter: a valid `Date`, or an RFC 3339 string. */
function instant(v: Validator, field: string, value: unknown): void {
	if (value === undefined || value === null) return;
	if (
		value instanceof Date
			? Number.isNaN(value.getTime())
			: typeof value !== 'string' || !isRFC3339(value)
	) {
		v.add(field, 'must be a Date or an RFC 3339 timestamp');
	}
}

function validateFilters(v: Validator, p: TransactionListFilters): void {
	v.limit('limit', p.limit);
	v.uuid('customerUuid', p.customerUuid);
	v.uuid('productUuid', p.productUuid);
	instant(v, 'createdAfter', p.createdAfter);
	instant(v, 'createdBefore', p.createdBefore);
	v.uuid('userUuid', p.userUuid);
	v.exclusive('includeMembers', p.includeMembers === true, 'userUuid', !!p.userUuid);
}

function filtersQuery(p: TransactionListFilters): Query {
	return new Query()
		.page(p.limit, p.cursor)
		.string('customerUuid', p.customerUuid)
		.string('productUuid', p.productUuid)
		.time('createdAfter', p.createdAfter)
		.time('createdBefore', p.createdBefore)
		.flag('includeMembers', p.includeMembers)
		.string('userUuid', p.userUuid);
}

const SUBSCRIPTION_STATUSES = knownValues(SubscriptionStatus);
const COMBINED_SOURCES = knownValues(CombinedPaymentSource);
const FAILURE_KINDS = knownValues(FailureKind);
const FAILURE_CATEGORIES = knownValues(FailureCategory);
const INVITATION_STATUSES = knownValues(InvitationStatus);
const EVENT_TYPES = knownValues(EventType);

// ── Products ────────────────────────────────────────────────────────────────

/** Checks subscription terms; `prefix` is the wire path (`subscription.` on products). */
function validateTerms(
	v: Validator,
	p: SubscriptionTermsParams,
	prefix: string,
	frequencyRequired: boolean
): void {
	if (p.frequency !== undefined && p.frequency !== null)
		v.duration(`${prefix}frequency`, p.frequency, true);
	else if (frequencyRequired) v.add(`${prefix}frequency`, 'is required');
	if (p.trialPeriod !== undefined && p.trialPeriod !== null)
		v.duration(`${prefix}trialPeriod`, p.trialPeriod, false);
	if (p.minPeriods !== undefined && p.minPeriods !== null)
		v.intRange(`${prefix}minPeriods`, p.minPeriods, 0, 1000);
}

function termsBody(p: SubscriptionTermsParams | undefined | null): Body | undefined {
	if (p === undefined || p === null) return undefined;
	return compact({
		frequency: durationBody(p.frequency),
		trialPeriod: durationBody(p.trialPeriod),
		minPeriods: given(p.minPeriods),
	});
}

export function productListQuery(p: ProductListParams | undefined): string {
	optionalParams(p);
	return new Query()
		.flag('includeHidden', p?.includeHidden)
		.bool('subscription', p?.subscription)
		.encode();
}

export function createProductBody(p: CreateProductParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('name', p.name)) v.name('name', p.name, 2, 100);
	v.text('description', p.description, 2, 500);
	v.price('price', p.price);
	v.reference('reference', p.reference);
	if (p.subscription !== undefined && p.subscription !== null) {
		validateTerms(v, p.subscription, 'subscription.', true);
	}
	v.check();
	return compact({
		name: p.name,
		description: nonEmpty(p.description),
		price: p.price,
		reference: nonEmpty(p.reference),
		subscription: termsBody(p.subscription),
	});
}

export function updateProductBody(p: UpdateProductParams): Body {
	requireParams(p);
	const v = new Validator();
	v.name('name', p.name, 2, 100);
	if (p.description !== undefined && p.description !== null)
		v.text('description', p.description, 2, 500);
	if (p.price !== undefined && p.price !== null) v.price('price', p.price);
	v.bool('isActive', p.isActive);
	if (p.subscription !== undefined && p.subscription !== null) {
		validateTerms(v, p.subscription, 'subscription.', false);
	}
	v.exclusive(
		'subscription',
		p.subscription !== undefined && p.subscription !== null,
		'removeSubscription',
		p.removeSubscription === true
	);
	v.check();
	return compact({
		name: nonEmpty(p.name),
		description: given(p.description),
		price: given(p.price),
		isActive: given(p.isActive),
		subscription: termsBody(p.subscription),
		removeSubscription: p.removeSubscription === true ? true : undefined,
	});
}

// ── Customers ───────────────────────────────────────────────────────────────

export function createCustomerBody(p: CreateCustomerParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('name', p.name)) v.name('name', p.name, 2, 100);
	v.name('lastName', p.lastName, 1, 100);
	if (v.required('email', p.email)) v.email('email', p.email);
	v.phone('phoneNumber', p.phoneNumber);
	v.text('address', p.address, 0, 500);
	v.reference('reference', p.reference);
	v.check();
	return compact({
		name: p.name,
		lastName: nonEmpty(p.lastName),
		email: p.email,
		phoneNumber: nonEmpty(p.phoneNumber),
		address: nonEmpty(p.address),
		reference: nonEmpty(p.reference),
	});
}

export function updateCustomerBody(p: UpdateCustomerParams): Body {
	requireParams(p);
	const v = new Validator();
	v.name('name', p.name, 2, 100);
	v.name('lastName', p.lastName, 1, 100);
	v.email('email', p.email);
	v.phone('phoneNumber', p.phoneNumber);
	v.text('address', p.address, 0, 500);
	v.check();
	return compact({
		name: nonEmpty(p.name),
		lastName: nonEmpty(p.lastName),
		email: nonEmpty(p.email),
		phoneNumber: given(p.phoneNumber),
		address: given(p.address),
	});
}

export function customerListQuery(p: CustomerListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.limit('limit', p?.limit);
	v.email('email', p?.email);
	v.bool('verified', p?.verified);
	v.check();
	return new Query()
		.page(p?.limit, p?.cursor)
		.string('email', p?.email)
		.bool('verified', p?.verified)
		.encode();
}

// ── Checkout sessions ───────────────────────────────────────────────────────

function validateSession(v: Validator, p: CreatePaymentSessionParams): void {
	v.reference('reference', p.reference);
	v.uuid('productUuid', p.productUuid);
	v.reference('productReference', p.productReference);
	v.name('productName', p.productName, 2, 100);
	v.text('description', p.description, 2, 500);
	v.url('successUrl', p.successUrl);
	v.url('cancelUrl', p.cancelUrl);
	v.uuid('customerUuid', p.customerUuid);
	v.reference('customerReference', p.customerReference);
	if (
		p.expiresInMinutes !== undefined &&
		p.expiresInMinutes !== null &&
		p.expiresInMinutes !== 0
	) {
		v.intRange('expiresInMinutes', p.expiresInMinutes, 10, 1440);
	}

	// Exactly one of: productUuid, productReference, an inline product. Any inline field next
	// to productUuid or productReference counts as mixing.
	const hasPrice = p.price !== undefined && p.price !== null && p.price !== 0;
	const inline = !!p.productName || hasPrice || !!p.description;
	const chosen = [!!p.productUuid, !!p.productReference, inline].filter(Boolean).length;
	if (chosen !== 1) {
		v.add(
			'productUuid',
			'or productReference, or an inline product (productName and price), is required: exactly one of them'
		);
	} else if (inline) {
		if (!p.productName) v.add('productName', 'is required for an inline product');
		if (!hasPrice) v.add('price', 'is required for an inline product');
		else v.price('price', p.price);
	}
}

function sessionBody(p: CreatePaymentSessionParams): Body {
	return {
		reference: nonEmpty(p.reference),
		productUuid: nonEmpty(p.productUuid),
		productReference: nonEmpty(p.productReference),
		productName: nonEmpty(p.productName),
		description: nonEmpty(p.description),
		price: nonZero(p.price),
		successUrl: nonEmpty(p.successUrl),
		cancelUrl: nonEmpty(p.cancelUrl),
		customerUuid: nonEmpty(p.customerUuid),
		customerReference: nonEmpty(p.customerReference),
		expiresInMinutes: nonZero(p.expiresInMinutes),
	};
}

export function createPaymentSessionBody(p: CreatePaymentSessionParams): Body {
	requireParams(p);
	const v = new Validator();
	validateSession(v, p);
	v.check();
	return compact(sessionBody(p));
}

export function createSubscriptionSessionBody(p: CreateSubscriptionSessionParams): Body {
	requireParams(p);
	const v = new Validator();
	validateSession(v, p);
	validateTerms(v, p, '', false);
	v.check();
	return compact({
		...sessionBody(p),
		frequency: durationBody(p.frequency),
		trialPeriod: durationBody(p.trialPeriod),
		minPeriods: given(p.minPeriods),
	});
}

// ── Payments and failures ───────────────────────────────────────────────────

export function paymentListQuery(p: PaymentListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	v.bool('refunded', p.refunded);
	v.check();
	return filtersQuery(p).bool('refunded', p.refunded).encode();
}

export function combinedPaymentListQuery(p: CombinedPaymentListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	v.oneOf('source', p.source, COMBINED_SOURCES);
	v.txId('subscriptionUuid', p.subscriptionUuid);
	v.bool('refunded', p.refunded);
	v.check();
	return filtersQuery(p)
		.string('source', p.source)
		.string('subscriptionUuid', p.subscriptionUuid)
		.bool('refunded', p.refunded)
		.encode();
}

export function failureListQuery(p: FailureListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	v.oneOf('kind', p.kind, FAILURE_KINDS);
	v.oneOf('category', p.category, FAILURE_CATEGORIES);
	v.txId('subscriptionUuid', p.subscriptionUuid);
	v.check();
	return filtersQuery(p)
		.string('kind', p.kind)
		.string('category', p.category)
		.string('subscriptionUuid', p.subscriptionUuid)
		.encode();
}

export function readQuery(p: ReadParams | undefined): string {
	optionalParams(p);
	return new Query().flag('includeMembers', p?.includeMembers).encode();
}

// ── Subscriptions ───────────────────────────────────────────────────────────

export function subscriptionListQuery(p: SubscriptionListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	v.oneOf('status', p.status, SUBSCRIPTION_STATUSES);
	v.reference('reference', p.reference);
	v.check();
	return filtersQuery(p).string('status', p.status).string('reference', p.reference).encode();
}

export function billListQuery(p: BillListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.limit('limit', p?.limit);
	v.check();
	return new Query().page(p?.limit, p?.cursor).encode();
}

export function cancelSubscriptionQuery(p: CancelSubscriptionParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.bool('immediate', p?.immediate);
	v.check();
	return new Query().bool('immediate', p?.immediate).encode();
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export function initiateRefundBody(p: InitiateRefundParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('txUuid', p.txUuid)) v.txId('txUuid', p.txUuid);
	if (p.refundPercent !== undefined && p.refundPercent !== null) {
		v.percent('refundPercent', p.refundPercent, 100, true);
	}
	v.text('reason', p.reason, 0, 500);
	v.text('merchantMessage', p.merchantMessage, 0, 500);
	v.check();
	return compact({
		txUuid: p.txUuid,
		refundPercent: given(p.refundPercent),
		reason: nonEmpty(p.reason),
		merchantMessage: nonEmpty(p.merchantMessage),
	});
}

/** `refunds.list` (`paged` false: no limit/cursor) and `refunds.listInactive` (`paged` true). */
export function refundListQuery(p: RefundListParams | undefined, paged: boolean): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	if (paged) v.limit('limit', p.limit);
	v.uuid('userUuid', p.userUuid);
	v.bool('includeMembers', p.includeMembers);
	v.bool('held', p.held);
	v.exclusive('includeMembers', p.includeMembers === true, 'userUuid', !!p.userUuid);
	v.check();
	const q = new Query();
	if (paged) q.page(p.limit, p.cursor);
	return q
		.bool('includeMembers', p.includeMembers)
		.string('userUuid', p.userUuid)
		.bool('held', p.held)
		.encode();
}

// ── Members and invitations ─────────────────────────────────────────────────

export function memberListQuery(p: MemberListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.limit('limit', p?.limit);
	v.check();
	return new Query().page(p?.limit, p?.cursor).encode();
}

export function updateMemberBody(p: UpdateMemberParams): Body {
	requireParams(p);
	const v = new Validator();
	v.percent('organizationFeePercent', p.organizationFeePercent ?? 0, 50, false);
	v.check();
	return { organizationFeePercent: p.organizationFeePercent ?? 0 };
}

export function createInvitationBody(p: CreateInvitationParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('email', p.email)) v.email('email', p.email);
	v.bool('trustLayer', p.trustLayer);
	if (p.organizationFeePercent !== undefined && p.organizationFeePercent !== null) {
		v.percent('organizationFeePercent', p.organizationFeePercent, 50, false);
	}
	v.url('redirectUrl', p.redirectUrl);
	v.check();
	return compact({
		email: p.email,
		role: 'user',
		trustLayer: p.trustLayer === true,
		organizationFeePercent: given(p.organizationFeePercent),
		redirectUrl: nonEmpty(p.redirectUrl),
	});
}

export function invitationListQuery(p: InvitationListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.limit('limit', p?.limit);
	v.oneOf('status', p?.status, INVITATION_STATUSES);
	v.check();
	return new Query().page(p?.limit, p?.cursor).string('status', p?.status).encode();
}

// ── Wallets and currencies ──────────────────────────────────────────────────

export function walletListQuery(p: WalletListParams | undefined): string {
	optionalParams(p);
	return new Query().flag('withBalances', p?.withBalances).encode();
}

export function supportedCurrenciesQuery(p: SupportedCurrenciesParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.uuid('userUuid', p?.userUuid);
	v.check();
	return new Query().string('userUuid', p?.userUuid).encode();
}

export function currencyListQuery(p: CurrencyListParams | undefined): string {
	optionalParams(p);
	return new Query().flag('test', p?.test).encode();
}

// ── Accounting ──────────────────────────────────────────────────────────────

/** Checks an export window (two `YYYY-MM-DD` dates, from <= to) and encodes it with the format. */
export function accountingQuery(from: string, to: string, format: 'json' | 'csv'): string {
	const v = new Validator();
	v.dateRange('from', from, 'to', to);
	v.check();
	return new Query().set('from', from).set('to', to).set('format', format).encode();
}

// ── Webhook endpoints and events ────────────────────────────────────────────

export function createWebhookEndpointBody(p: CreateWebhookEndpointParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('url', p.url)) v.url('url', p.url);
	v.endpointEvents('events', p.events);
	v.bool('includeMembers', p.includeMembers);
	v.text('description', p.description, 0, 200);
	v.check();
	return compact({
		url: p.url,
		events: Array.isArray(p.events) && p.events.length > 0 ? p.events : undefined,
		includeMembers: given(p.includeMembers),
		description: nonEmpty(p.description),
	});
}

export function updateWebhookEndpointBody(p: UpdateWebhookEndpointParams): Body {
	requireParams(p);
	const v = new Validator();
	v.url('url', p.url);
	v.endpointEvents('events', p.events);
	v.bool('includeMembers', p.includeMembers);
	if (p.description !== undefined && p.description !== null)
		v.text('description', p.description, 0, 200);
	v.oneOf('payloadVersion', p.payloadVersion, ['v2']);
	v.bool('enabled', p.enabled);
	v.check();
	return compact({
		url: nonEmpty(p.url),
		events: given(p.events),
		includeMembers: given(p.includeMembers),
		description: given(p.description),
		payloadVersion: nonEmpty(p.payloadVersion),
		enabled: given(p.enabled),
	});
}

export function eventListQuery(p: EventListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.limit('limit', p?.limit);
	v.oneOf('type', p?.type, EVENT_TYPES);
	v.check();
	return new Query()
		.page(p?.limit, p?.cursor)
		.string('type', p?.type)
		.flag('includeMembers', p?.includeMembers)
		.encode();
}
