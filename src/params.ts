/**
 * Each params type's checks, query string and request body. Bodies carry the
 * wire names explicitly and only the params' known fields; a field left out (or, for the
 * fields the API treats so, left empty) is omitted. The clearable fields
 * (`UpdateCustomerParams.lastName`/`phoneNumber`/`address`, `UpdateProductParams.description`,
 * `UpdateWebhookEndpointParams.description`) send an explicit `''`; `metadata` is sent as given
 * (a key set to `''` deletes it on an update). Money and percents are decimal strings, sent
 * verbatim (`"12.50"` stays `"12.50"`).
 *
 * @internal Not part of the public API.
 */

import { isRFC3339 } from './decode.js';
import { Query } from './encode.js';
import {
	FailureCategory,
	FailureKind,
	InvitationStatus,
	knownValues,
	RefundStatus,
	TransactionKind,
} from './enums.js';
import type {
	CheckoutFees,
	CreatePaymentSessionParams,
	CreateSubscriptionSessionParams,
} from './models/checkout.js';
import type { Duration, PageParams, ReadParams, TransactionListFilters } from './models/common.js';
import type {
	CreateCustomerParams,
	CustomerListParams,
	UpdateCustomerParams,
} from './models/customers.js';
import type {
	CreateInvitationParams,
	InvitationListParams,
	UpdateMemberParams,
} from './models/members.js';
import type {
	FailureListParams,
	PaymentListParams,
	TransactionListParams,
} from './models/payments.js';
import type {
	CreateProductParams,
	ProductListParams,
	SubscriptionTermsParams,
	UpdateProductParams,
} from './models/products.js';
import type { RefundListParams } from './models/refunds.js';
import type {
	CancelSubscriptionParams,
	SubscriptionListParams,
	UpdateSubscriptionParams,
} from './models/subscriptions.js';
import type {
	AcceptedCurrenciesParams,
	CurrencyListParams,
	WalletListParams,
} from './models/wallets.js';
import type {
	CreateWebhookEndpointParams,
	EventListParams,
	UpdateWebhookEndpointParams,
} from './models/webhooks.js';
import { MAX_USD, optionalParams, requireParams, Validator } from './validate.js';

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

/** A metadata map on the wire: as given, left out when absent or without keys (Go `omitempty`). */
function metadataBody(
	m: Record<string, string> | undefined | null
): Record<string, string> | undefined {
	return m !== undefined && m !== null && Object.keys(m).length > 0 ? { ...m } : undefined;
}

/** A duration's wire form: `{value, unit}` (`unit` omitted when empty). */
function durationBody(d: Duration | undefined | null): Body | undefined {
	if (d === undefined || d === null) return undefined;
	return compact({ value: d.value, unit: nonEmpty(d.unit) });
}

// ── Shared list checks ──────────────────────────────────────────────────────

/** Checks a paginated list's `limit` (an integer when set) and `cursor` (at most 200 characters). */
function validatePage(v: Validator, p: PageParams | undefined): void {
	v.limit('limit', p?.limit);
	v.cursor(p?.cursor);
}

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
	validatePage(v, p);
	v.uuid('customerUuid', p.customerUuid);
	v.uuid('productUuid', p.productUuid);
	instant(v, 'createdAfter', p.createdAfter);
	instant(v, 'createdBefore', p.createdBefore);
	v.bool('includeMembers', p.includeMembers);
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

/** A paginated list without filters (members, bills, webhook endpoints). */
export function pageQuery(p: PageParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	validatePage(v, p);
	v.check();
	return new Query().page(p?.limit, p?.cursor).encode();
}

const TRANSACTION_KINDS = knownValues(TransactionKind);
const FAILURE_KINDS = knownValues(FailureKind);
const FAILURE_CATEGORIES = knownValues(FailureCategory);
const INVITATION_STATUSES = knownValues(InvitationStatus);
const REFUND_STATUSES = knownValues(RefundStatus);

/** The most statuses `RefundListParams.status` may name. */
const MAX_REFUND_STATUSES = 5;

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
	const v = new Validator();
	validatePage(v, p);
	v.bool('includeHidden', p?.includeHidden);
	v.bool('subscription', p?.subscription);
	v.reference('reference', p?.reference);
	v.check();
	return new Query()
		.page(p?.limit, p?.cursor)
		.flag('includeHidden', p?.includeHidden)
		.bool('subscription', p?.subscription)
		.string('reference', p?.reference)
		.encode();
}

export function createProductBody(p: CreateProductParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('name', p.name)) v.name('name', p.name, 2, 100);
	v.text('description', p.description, 2, 500);
	if (v.required('priceUsd', p.priceUsd)) v.usd('priceUsd', p.priceUsd, MAX_USD);
	v.reference('reference', p.reference);
	if (p.subscription !== undefined && p.subscription !== null) {
		validateTerms(v, p.subscription, 'subscription.', true);
	}
	v.metadata('metadata', p.metadata);
	v.check();
	return compact({
		name: p.name,
		description: nonEmpty(p.description),
		priceUsd: p.priceUsd,
		reference: nonEmpty(p.reference),
		subscription: termsBody(p.subscription),
		metadata: metadataBody(p.metadata),
	});
}

export function updateProductBody(p: UpdateProductParams): Body {
	requireParams(p);
	const v = new Validator();
	v.name('name', p.name, 2, 100);
	if (p.description !== undefined && p.description !== null)
		v.text('description', p.description, 2, 500);
	if (p.priceUsd !== undefined && p.priceUsd !== null && p.priceUsd !== '')
		v.usd('priceUsd', p.priceUsd, MAX_USD);
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
	v.metadata('metadata', p.metadata);
	v.check();
	return compact({
		name: nonEmpty(p.name),
		description: given(p.description),
		priceUsd: nonEmpty(p.priceUsd),
		isActive: given(p.isActive),
		subscription: termsBody(p.subscription),
		removeSubscription: p.removeSubscription === true ? true : undefined,
		metadata: metadataBody(p.metadata),
	});
}

// ── Customers ───────────────────────────────────────────────────────────────

export function createCustomerBody(p: CreateCustomerParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('firstName', p.firstName)) v.name('firstName', p.firstName, 2, 100);
	v.name('lastName', p.lastName, 1, 100);
	if (v.required('email', p.email)) v.email('email', p.email);
	v.phone('phoneNumber', p.phoneNumber);
	v.text('address', p.address, 0, 500);
	v.reference('reference', p.reference);
	v.metadata('metadata', p.metadata);
	v.check();
	return compact({
		firstName: p.firstName,
		lastName: nonEmpty(p.lastName),
		email: p.email,
		phoneNumber: nonEmpty(p.phoneNumber),
		address: nonEmpty(p.address),
		reference: nonEmpty(p.reference),
		metadata: metadataBody(p.metadata),
	});
}

export function updateCustomerBody(p: UpdateCustomerParams): Body {
	requireParams(p);
	const v = new Validator();
	v.name('firstName', p.firstName, 2, 100);
	v.name('lastName', p.lastName, 1, 100);
	v.email('email', p.email);
	v.phone('phoneNumber', p.phoneNumber);
	v.text('address', p.address, 0, 500);
	v.metadata('metadata', p.metadata);
	v.check();
	return compact({
		firstName: nonEmpty(p.firstName),
		lastName: given(p.lastName),
		email: nonEmpty(p.email),
		phoneNumber: given(p.phoneNumber),
		address: given(p.address),
		metadata: metadataBody(p.metadata),
	});
}

export function customerListQuery(p: CustomerListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	validatePage(v, p);
	v.email('email', p?.email);
	v.reference('reference', p?.reference);
	v.check();
	return new Query()
		.page(p?.limit, p?.cursor)
		.string('email', p?.email)
		.string('reference', p?.reference)
		.encode();
}

/**
 * Checks a `getByReference` argument like a created reference: required, 1 to 100 of
 * `A-Z a-z 0-9 . _ : @ -`, not `.` or `..` alone.
 */
export function referenceQuery(reference: unknown): string {
	const v = new Validator();
	if (v.required('reference', reference)) v.reference('reference', reference);
	v.check();
	return new Query().set('reference', reference as string).encode();
}

// ── Checkout sessions ───────────────────────────────────────────────────────

/** The most fee lines of a checkout's own (`fees.items`). */
const MAX_FEE_ITEMS = 10;

/**
 * Checks a checkout's `fees` when given: at most 10 lines; each label the name
 * rule, 1 to 40; each description the text rule, at most 200; each amount the usd rule. Field
 * errors on their wire paths.
 */
function validateFees(v: Validator, fees: unknown): void {
	if (fees === undefined || fees === null) return;
	if (typeof fees !== 'object' || Array.isArray(fees)) {
		v.add('fees', 'must be an object {processingFee, items}');
		return;
	}
	const { processingFee, items } = fees as { processingFee?: unknown; items?: unknown };
	v.bool('fees.processingFee', processingFee);
	if (items === undefined || items === null) return;
	if (!Array.isArray(items)) {
		v.add('fees.items', 'must be a list of fee lines');
		return;
	}
	// Each line is still checked past the 10th (as the Go reference does).
	if (items.length > MAX_FEE_ITEMS)
		v.add('fees.items', `must have at most ${MAX_FEE_ITEMS} lines`);
	items.forEach((item: unknown, i) => {
		const path = `fees.items[${i}]`;
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			v.add(path, 'must be an object {label, description, amountUsd}');
			return;
		}
		const { label, description, amountUsd } = item as Record<string, unknown>;
		if (v.required(`${path}.label`, label)) v.name(`${path}.label`, label, 1, 40);
		v.text(`${path}.description`, description, 0, 200);
		if (v.required(`${path}.amountUsd`, amountUsd))
			v.usd(`${path}.amountUsd`, amountUsd, MAX_USD);
	});
}

/** A checkout's `fees` on the wire: as given, an empty `description` or `items` left out. */
function feesBody(fees: CheckoutFees | undefined | null): Body | undefined {
	if (fees === undefined || fees === null) return undefined;
	const items = fees.items?.map((item) =>
		compact({
			label: item.label,
			description: nonEmpty(item.description),
			amountUsd: item.amountUsd,
		})
	);
	return compact({
		processingFee: given(fees.processingFee),
		items: items && items.length > 0 ? items : undefined,
	});
}

/** Checks every field of a session but its fees (reported last). */
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
	v.metadata('metadata', p.metadata);

	// Exactly one of: productUuid, productReference, an inline product. Any inline field next
	// to productUuid or productReference counts as mixing.
	const hasPrice = p.priceUsd !== undefined && p.priceUsd !== null && p.priceUsd !== '';
	const inline = !!p.productName || hasPrice || !!p.description;
	const chosen = [!!p.productUuid, !!p.productReference, inline].filter(Boolean).length;
	if (chosen !== 1) {
		v.add(
			'productUuid',
			'or productReference, or an inline product (productName and priceUsd), is required: exactly one of them'
		);
	} else if (inline) {
		if (!p.productName) v.add('productName', 'is required for an inline product');
		if (!hasPrice) v.add('priceUsd', 'is required for an inline product');
		else v.usd('priceUsd', p.priceUsd, MAX_USD);
	}
}

function sessionBody(p: CreatePaymentSessionParams): Body {
	return {
		reference: nonEmpty(p.reference),
		productUuid: nonEmpty(p.productUuid),
		productReference: nonEmpty(p.productReference),
		productName: nonEmpty(p.productName),
		description: nonEmpty(p.description),
		priceUsd: nonEmpty(p.priceUsd),
		successUrl: nonEmpty(p.successUrl),
		cancelUrl: nonEmpty(p.cancelUrl),
		customerUuid: nonEmpty(p.customerUuid),
		customerReference: nonEmpty(p.customerReference),
		expiresInMinutes: nonZero(p.expiresInMinutes),
		metadata: metadataBody(p.metadata),
	};
}

export function createPaymentSessionBody(p: CreatePaymentSessionParams): Body {
	requireParams(p);
	const v = new Validator();
	validateSession(v, p);
	validateFees(v, p.fees);
	v.check();
	return compact({ ...sessionBody(p), fees: feesBody(p.fees) });
}

export function createSubscriptionSessionBody(p: CreateSubscriptionSessionParams): Body {
	requireParams(p);
	const v = new Validator();
	validateSession(v, p);
	validateTerms(v, p, '', false);
	// The fees' errors come after the terms' (the request's order).
	validateFees(v, p.fees);
	v.check();
	return compact({
		...sessionBody(p),
		frequency: durationBody(p.frequency),
		trialPeriod: durationBody(p.trialPeriod),
		minPeriods: given(p.minPeriods),
		fees: feesBody(p.fees),
	});
}

// ── Payments, transactions and failures ─────────────────────────────────────

export function paymentListQuery(p: PaymentListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	v.reference('reference', p.reference);
	v.bool('refunded', p.refunded);
	v.check();
	return filtersQuery(p).string('reference', p.reference).bool('refunded', p.refunded).encode();
}

export function transactionListQuery(p: TransactionListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	v.oneOf('type', p.type, TRANSACTION_KINDS);
	v.txId('subscriptionUuid', p.subscriptionUuid);
	v.bool('refunded', p.refunded);
	v.check();
	return filtersQuery(p)
		.string('type', p.type)
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
	const v = new Validator();
	v.bool('includeMembers', p?.includeMembers);
	v.check();
	return new Query().flag('includeMembers', p?.includeMembers).encode();
}

// ── Subscriptions ───────────────────────────────────────────────────────────

export function subscriptionListQuery(p: SubscriptionListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validateFilters(v, p);
	// Not checked against the known statuses: a newer one is sent as is.
	v.str('status', p.status);
	v.reference('reference', p.reference);
	v.check();
	return filtersQuery(p).string('status', p.status).string('reference', p.reference).encode();
}

export function updateSubscriptionBody(p: UpdateSubscriptionParams): Body {
	requireParams(p);
	const v = new Validator();
	v.metadata('metadata', p.metadata);
	v.check();
	return compact({ metadata: metadataBody(p.metadata) });
}

export function cancelSubscriptionQuery(p: CancelSubscriptionParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.bool('immediate', p?.immediate);
	v.check();
	return new Query().bool('immediate', p?.immediate).encode();
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export function refundListQuery(p: RefundListParams | undefined): string {
	optionalParams(p);
	if (!p) return '';
	const v = new Validator();
	validatePage(v, p);
	const statuses: unknown = p.status;
	if (statuses !== undefined && statuses !== null) {
		if (!Array.isArray(statuses)) {
			v.add('status', 'must be a list of refund statuses');
		} else {
			if (statuses.length > MAX_REFUND_STATUSES)
				v.add('status', `must name at most ${MAX_REFUND_STATUSES} statuses`);
			statuses.forEach((status: unknown, i) => {
				const field = `status[${i}]`;
				if (typeof status !== 'string' || status === '') v.add(field, 'is required');
				else v.oneOf(field, status, REFUND_STATUSES);
			});
		}
	}
	v.txId('txUuid', p.txUuid);
	v.bool('held', p.held);
	v.bool('includeMembers', p.includeMembers);
	v.uuid('userUuid', p.userUuid);
	v.exclusive('includeMembers', p.includeMembers === true, 'userUuid', !!p.userUuid);
	v.check();
	const q = new Query().page(p.limit, p.cursor);
	for (const status of p.status ?? []) q.add('status', status);
	return q
		.string('txUuid', p.txUuid)
		.bool('held', p.held)
		.bool('includeMembers', p.includeMembers)
		.string('userUuid', p.userUuid)
		.encode();
}

// ── Members and invitations ─────────────────────────────────────────────────

export function updateMemberBody(p: UpdateMemberParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('organizationFeePercent', p.organizationFeePercent))
		v.percent('organizationFeePercent', p.organizationFeePercent, 50);
	v.check();
	return { organizationFeePercent: p.organizationFeePercent };
}

export function createInvitationBody(p: CreateInvitationParams): Body {
	requireParams(p);
	const v = new Validator();
	if (v.required('email', p.email)) v.email('email', p.email);
	v.bool('holdFunds', p.holdFunds);
	if (
		p.organizationFeePercent !== undefined &&
		p.organizationFeePercent !== null &&
		p.organizationFeePercent !== ''
	) {
		v.percent('organizationFeePercent', p.organizationFeePercent, 50);
	}
	v.url('redirectUrl', p.redirectUrl);
	v.bool('sendEmail', p.sendEmail);
	v.check();
	return compact({
		email: p.email,
		role: 'user',
		holdFunds: p.holdFunds === true,
		organizationFeePercent: nonEmpty(p.organizationFeePercent),
		redirectUrl: nonEmpty(p.redirectUrl),
		sendEmail: given(p.sendEmail),
	});
}

export function invitationListQuery(p: InvitationListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	validatePage(v, p);
	v.oneOf('status', p?.status, INVITATION_STATUSES);
	v.check();
	return new Query().page(p?.limit, p?.cursor).string('status', p?.status).encode();
}

// ── Wallets and currencies ──────────────────────────────────────────────────

export function walletListQuery(p: WalletListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.bool('withBalances', p?.withBalances);
	v.check();
	return new Query().flag('withBalances', p?.withBalances).encode();
}

export function acceptedCurrenciesQuery(p: AcceptedCurrenciesParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.uuid('userUuid', p?.userUuid);
	v.check();
	return new Query().string('userUuid', p?.userUuid).encode();
}

export function currencyListQuery(p: CurrencyListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	v.bool('test', p?.test);
	v.bool('main', p?.main);
	v.check();
	return new Query().flag('test', p?.test).flag('main', p?.main).encode();
}

// ── Accounting ──────────────────────────────────────────────────────────────

/**
 * Checks an export window (two `YYYY-MM-DD` dates, from <= to; the API enforces the 92-day
 * maximum, both days included) and encodes it with the format.
 */
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
	v.bool('enabled', p.enabled);
	v.check();
	return compact({
		url: nonEmpty(p.url),
		events: given(p.events),
		includeMembers: given(p.includeMembers),
		description: given(p.description),
		enabled: given(p.enabled),
	});
}

export function eventListQuery(p: EventListParams | undefined): string {
	optionalParams(p);
	const v = new Validator();
	validatePage(v, p);
	// Not checked against the known types: newer ones appear over time (the API's 400).
	v.str('type', p?.type);
	v.bool('includeMembers', p?.includeMembers);
	v.check();
	return new Query()
		.page(p?.limit, p?.cursor)
		.string('type', p?.type)
		.flag('includeMembers', p?.includeMembers)
		.encode();
}
