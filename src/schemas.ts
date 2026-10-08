/**
 * The decoding schemas of every answer and webhook event, mirroring the API's types (docs/core).
 * `object<T>()` needs exactly one decoder per property of `T`, so a schema cannot drift from its
 * interface without a compile error.
 *
 * @internal Not part of the public API.
 */

import {
	boolean,
	custom,
	enumString,
	type Fields,
	integer,
	lazy,
	list,
	nullable,
	number,
	object,
	optional,
	raw,
	rawMember,
	type Schema,
	string,
	timestamp,
	unsigned,
} from './decode.js';
import type {
	AccountingEventType,
	ActionRequired,
	AttemptStatus,
	BillingFailureReason,
	BillingOutcome,
	BillingStage,
	CancellationReason,
	Chain,
	CheckoutSessionStatusValue,
	CombinedPaymentSource,
	Credential,
	DurationUnit,
	EndpointDisabledReason,
	EventType,
	FailureCategory,
	FailureKind,
	FeeLineType,
	InvitationStatus,
	LedgerEntryType,
	NotRefundableReason,
	RefundInitiator,
	RefundStatus,
	Role,
	SubscriptionStatus,
	TransactionType,
	TransferType,
	WebhookPayloadVersion,
} from './enums.js';
import type { AccountingEvent } from './models/accounting.js';
import type {
	CheckoutSession,
	CheckoutSessionStatus,
	PaymentSessionData,
	SubscriptionSessionData,
} from './models/checkout.js';
import type {
	Attempt,
	BlockData,
	Currency,
	CustomerSummary,
	Duration,
	NetworkFees,
	OrganizationFee,
	Page,
	PaymentMetadata,
	ReferralFee,
	RefundSummary,
	TxAmounts,
	TxAmountsMinUnits,
	TxAmountsUsd,
	TxMetadata,
} from './models/common.js';
import type { Customer } from './models/customers.js';
import type {
	EventEnvelope,
	HeldFundsReleased,
	MemberJoined,
	PaymentCompleted,
	SubscriptionActionRequiredChanged,
	SubscriptionBilled,
	SubscriptionBillingFailed,
	SubscriptionCreated,
	SubscriptionStatusChanged,
	SubscriptionUpcomingBill,
	WebhookTest,
} from './models/events.js';
import type {
	HeldFunds,
	Invitation,
	InvitationCreated,
	LedgerEntry,
	Me,
	MeMember,
	MeSpace,
	Member,
	MemberHeldFundsSummary,
} from './models/members.js';
import type { Bill, CombinedPayment, Failure, FeeLine, Payment } from './models/payments.js';
import type { Product, SubscriptionTerms } from './models/products.js';
import type { Refund, RefundApproval } from './models/refunds.js';
import type { BillingState, DunningStatus, Subscription } from './models/subscriptions.js';
import type { Balance, TokenWallet, Wallet } from './models/wallets.js';
import type {
	DeliveryAttempt,
	EndpointDelivery,
	WebhookEndpoint,
	WebhookEndpointCreated,
} from './models/webhooks.js';

const optString = optional(string);
const optNumber = optional(number);
const optBoolean = optional(boolean);
const optTimestamp = optional(timestamp);
const nullableTimestamp = nullable(timestamp);

/** A page of `item`s; `hasMore` is computed from `nextCursor`. */
export function page<T>(item: Schema<T>): Schema<Page<T>> {
	const inner = object<{ items: T[]; nextCursor: string | null }>({
		items: list(item),
		nextCursor: nullable(string),
	});
	return custom('an object', (value, path, ctx) => {
		const p = inner.decode(value, path, ctx);
		return { ...p, hasMore: p.nextCursor !== null } as Page<T>;
	});
}

// ── Common ──────────────────────────────────────────────────────────────────

export const DurationSchema = object<Duration>({
	value: unsigned,
	unit: optional(enumString<DurationUnit>()),
});

export const CurrencySchema: Schema<Currency> = object<Currency>({
	id: unsigned,
	name: string,
	symbol: string,
	decimals: unsigned,
	address: string,
	mainCurrencyId: optional(unsigned),
	mainCurrency: nullable(lazy(() => CurrencySchema)),
	test: boolean,
});

export const CustomerSummarySchema = object<CustomerSummary>({
	uuid: string,
	name: string,
	lastName: optString,
	email: string,
	reference: optString,
	deleted: optBoolean,
});

export const RefundSummarySchema = object<RefundSummary>({
	uuid: string,
	status: enumString<RefundStatus>(),
	initiatedBy: enumString<RefundInitiator>(),
	refundPercent: number,
	amountMinUnits: string,
	amountUsd: number,
	createdAt: timestamp,
	respondedAt: nullableTimestamp,
});

export const AttemptSchema = object<Attempt>({
	status: enumString<AttemptStatus>(),
	code: optString,
	message: optString,
	txHash: optString,
	at: timestamp,
});

const OrganizationFeeSchema = object<OrganizationFee>({ organization: string, feePercent: number });

const ReferralFeeSchema = object<ReferralFee>({
	referrer: string,
	feePercent: number,
	deadline: timestamp,
});

const NetworkFeesSchema = object<NetworkFees>({
	amount: string,
	unitsConsumed: unsigned,
	l1Fee: optString,
});

const BlockDataSchema = object<BlockData>({ number: string, timestamp: unsigned });

export const TxMetadataSchema = object<TxMetadata>({
	networkFees: NetworkFeesSchema,
	blockData: BlockDataSchema,
	mainCurrencyPriceUsd: optNumber,
});

const TxAmountsUsdSchema = object<TxAmountsUsd>({
	platform: number,
	organization: optNumber,
	referral: optNumber,
	merchant: number,
	networkFee: optNumber,
});

const TxAmountsMinUnitsSchema = object<TxAmountsMinUnits>({
	platform: string,
	organization: string,
	referral: string,
	merchant: string,
	networkFee: optString,
});

const TxAmountsSchema = object<TxAmounts>({
	usd: TxAmountsUsdSchema,
	minUnits: TxAmountsMinUnitsSchema,
});

export const PaymentMetadataSchema = object<PaymentMetadata>({
	feePercent: number,
	organizationFee: optional(OrganizationFeeSchema),
	referralFee: optional(ReferralFeeSchema),
	txMetadata: TxMetadataSchema,
	txAmounts: TxAmountsSchema,
});

// ── Payments ────────────────────────────────────────────────────────────────

const FeeLineSchema = object<FeeLine>({
	type: enumString<FeeLineType>(),
	label: string,
	description: optString,
	amountUsd: string,
});

const paymentFields: Fields<Payment> = {
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	amount: number,
	amountMinUnits: string,
	currencyId: unsigned,
	currency: nullable(CurrencySchema),
	txHash: string,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	reference: optString,
	price: number,
	fees: list(FeeLineSchema),
	name: string,
	description: string,
	productUuid: optString,
	customerUuid: optString,
	customerReference: optString,
	note: optString,
	customer: optional(CustomerSummarySchema),
	metadata: PaymentMetadataSchema,
	confirmedAt: optTimestamp,
	paidMinUnits: optString,
	paidUsd: optNumber,
	refund: optional(RefundSummarySchema),
	refundable: optBoolean,
	notRefundableReason: optional(enumString<NotRefundableReason>()),
	checkoutOpenedAt: optTimestamp,
};
export const PaymentSchema = object<Payment>(paymentFields);

const billFields: Fields<Bill> = {
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	amount: number,
	amountMinUnits: string,
	currencyId: unsigned,
	currency: nullable(CurrencySchema),
	txHash: string,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	name: string,
	description: string,
	productUuid: optString,
	subscriptionUuid: string,
	customerUuid: optString,
	customerReference: optString,
	customer: optional(CustomerSummarySchema),
	metadata: PaymentMetadataSchema,
	periodStart: optTimestamp,
	periodEnd: optTimestamp,
	confirmedAt: optTimestamp,
	paidMinUnits: optString,
	paidUsd: optNumber,
	refund: optional(RefundSummarySchema),
	refundable: optBoolean,
	notRefundableReason: optional(enumString<NotRefundableReason>()),
};
export const BillSchema = object<Bill>(billFields);

export const CombinedPaymentSchema = object<CombinedPayment>({
	source: enumString<CombinedPaymentSource>(),
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	name: string,
	description: string,
	amount: number,
	amountMinUnits: string,
	currencyId: unsigned,
	currency: nullable(CurrencySchema),
	productUuid: optString,
	txHash: string,
	customerUuid: optString,
	customer: optional(CustomerSummarySchema),
	customerReference: optString,
	subscriptionUuid: optString,
	reference: optString,
	subscriptionReference: optString,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	refund: optional(RefundSummarySchema),
	refundable: optBoolean,
	notRefundableReason: optional(enumString<NotRefundableReason>()),
	metadata: nullable(PaymentMetadataSchema),
});

export const FailureSchema = object<Failure>({
	uuid: string,
	kind: enumString<FailureKind>(),
	txUuid: string,
	attempt: integer,
	subscriptionUuid: optString,
	code: string,
	category: enumString<FailureCategory>(),
	message: optString,
	attemptedUsd: number,
	attemptedMinUnits: string,
	currencyId: unsigned,
	from: string,
	txHash: optString,
	customerUuid: optString,
	productUuid: optString,
	createdAt: timestamp,
	customer: optional(CustomerSummarySchema),
	test: boolean,
	userUuid: optString,
});

// ── Checkout sessions ───────────────────────────────────────────────────────

export const CheckoutSessionSchema = object<CheckoutSession>({
	link: string,
	uuid: string,
	expiresAt: optTimestamp,
});

export const CheckoutSessionStatusSchema = object<CheckoutSessionStatus>({
	uuid: string,
	status: enumString<CheckoutSessionStatusValue>(),
	txHash: optString,
	message: optString,
	lastAttempt: optional(AttemptSchema),
});

const paymentSessionFields: Fields<PaymentSessionData> = {
	uuid: string,
	reference: optString,
	productUuid: optString,
	productReference: optString,
	productName: optString,
	description: optString,
	price: optNumber,
	fees: list(FeeLineSchema),
	amount: optNumber,
	successUrl: optString,
	cancelUrl: optString,
	redirectUrl: optString,
	organizationName: string,
	userName: optString,
	test: boolean,
	txType: enumString<TransactionType>(),
	availableCurrencyIds: list(unsigned),
	createdAt: optTimestamp,
	expiresAt: optTimestamp,
};
export const PaymentSessionDataSchema = object<PaymentSessionData>(paymentSessionFields);

export const SubscriptionSessionDataSchema = object<SubscriptionSessionData>({
	...paymentSessionFields,
	frequency: DurationSchema,
	trialPeriod: optional(DurationSchema),
	minPeriods: optional(unsigned),
	upgradingFromTrial: optBoolean,
});

/** `checkout.expired`'s data: a subscription session for `txType` `createSubscription`, else a payment session. */
export const CheckoutExpiredDataSchema = custom<PaymentSessionData | SubscriptionSessionData>(
	'an object',
	(value, path, ctx) => {
		const txType = rawMember(value, 'txType');
		return txType === 'createSubscription'
			? SubscriptionSessionDataSchema.decode(value, path, ctx)
			: PaymentSessionDataSchema.decode(value, path, ctx);
	}
);

// ── Subscriptions ───────────────────────────────────────────────────────────

const DunningStatusSchema = object<DunningStatus>({
	failedAttempts: unsigned,
	remainingAttempts: unsigned,
	failingSince: optTimestamp,
	nextAttemptAt: optTimestamp,
	awaitingMaximumSince: optTimestamp,
});

const subscriptionFields: Fields<Subscription> = {
	uuid: string,
	reference: optString,
	createdAt: timestamp,
	updatedAt: timestamp,
	from: string,
	to: string,
	productUuid: string,
	subscriptionHash: string,
	currencyId: unsigned,
	currency: nullable(CurrencySchema),
	frequency: DurationSchema,
	allowance: string,
	status: enumString<SubscriptionStatus>(),
	actionRequired: optional(enumString<ActionRequired>()),
	currentPeriodEnd: optTimestamp,
	priceUsd: string,
	maxAmountPerPeriod: optString,
	lastBillingDate: timestamp,
	nextBillingDate: optTimestamp,
	cancelledAt: optTimestamp,
	cancellationReason: optional(enumString<CancellationReason>()),
	minimumCancellationDate: optTimestamp,
	test: boolean,
	userUuid: optString,
	customerUuid: optString,
	customerReference: optString,
	customer: optional(CustomerSummarySchema),
	dunning: optional(DunningStatusSchema),
};
export const SubscriptionSchema = object<Subscription>(subscriptionFields);

export const BillingStateSchema = object<BillingState>({
	billUuid: string,
	stage: enumString<BillingStage>(),
	outcome: optional(enumString<BillingOutcome>()),
	attempts: unsigned,
	nextAttempt: optTimestamp,
	txHash: optString,
	failureCode: optString,
});

// ── Refunds ─────────────────────────────────────────────────────────────────

const RefundApprovalSchema = object<RefundApproval>({
	status: enumString<CheckoutSessionStatusValue>(),
	txHash: optString,
	lastAttempt: optional(AttemptSchema),
});

export const RefundSchema = object<Refund>({
	uuid: string,
	txUuid: string,
	reason: string,
	status: enumString<RefundStatus>(),
	createdAt: timestamp,
	merchantMessage: string,
	respondedAt: nullableTimestamp,
	test: boolean,
	userUuid: optString,
	txHash: string,
	initiatedBy: enumString<RefundInitiator>(),
	held: boolean,
	paidMinUnits: string,
	paidUsd: number,
	refundPercent: number,
	amountMinUnits: string,
	amountUsd: number,
	currencyId: unsigned,
	metadata: nullable(TxMetadataSchema),
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	approval: optional(RefundApprovalSchema),
	productName: optString,
	customer: optional(CustomerSummarySchema),
});

// ── Customers and products ──────────────────────────────────────────────────

export const CustomerSchema = object<Customer>({
	uuid: string,
	name: string,
	lastName: optString,
	email: string,
	verified: boolean,
	phoneNumber: optString,
	address: optString,
	reference: optString,
	createdAt: timestamp,
	test: boolean,
	userUuid: optString,
});

const SubscriptionTermsSchema = object<SubscriptionTerms>({
	frequency: DurationSchema,
	trialPeriod: optional(DurationSchema),
	minPeriods: optional(unsigned),
});

export const ProductSchema = object<Product>({
	uuid: string,
	name: string,
	description: string,
	price: number,
	createdAt: timestamp,
	isActive: boolean,
	reference: string,
	subscription: optional(SubscriptionTermsSchema),
	paymentLink: optString,
	test: boolean,
	userUuid: optString,
});

// ── Me, members, invitations ────────────────────────────────────────────────

const MeMemberSchema = object<MeMember>({
	userUuid: string,
	name: string,
	lastName: string,
	email: string,
});

const MeSpaceSchema = object<MeSpace>({
	uuid: string,
	organizationUuid: string,
	organizationName: string,
	userUuid: optString,
	member: optional(MeMemberSchema),
	test: boolean,
});

export const MeSchema = object<Me>({
	credential: enumString<Credential>(),
	apiKeyUuid: optString,
	userUuid: optString,
	role: optional(enumString<Role>()),
	onBehalfOf: optString,
	space: optional(MeSpaceSchema),
});

const memberFields: Fields<Member> = {
	userUuid: string,
	name: string,
	lastName: string,
	email: string,
	test: boolean,
	organizationFeePercent: number,
	trustedAt: nullableTimestamp,
	joinedAt: timestamp,
	acceptedCurrencyIds: list(unsigned),
	spaceUuid: string,
};
export const MemberSchema = object<Member>(memberFields);

export const LedgerEntrySchema = object<LedgerEntry>({
	txUuid: string,
	type: enumString<LedgerEntryType>(),
	description: string,
	refundedTxUuid: optString,
	amount: number,
	metadata: nullable(PaymentMetadataSchema),
	currencyId: unsigned,
	owedMinUnits: string,
	owedUsd: number,
	createdAt: timestamp,
});

export const HeldFundsSchema = object<HeldFunds>({
	ledgers: list(LedgerEntrySchema),
	totalAmount: number,
});

export const MemberHeldFundsSummarySchema = object<MemberHeldFundsSummary>({
	userUuid: string,
	totalAmount: number,
	count: integer,
	oldestAt: timestamp,
});

export const InvitationSchema = object<Invitation>({
	uuid: string,
	test: nullable(boolean),
	email: string,
	role: enumString<Role>(),
	trustLayer: nullable(boolean),
	organizationFeePercent: number,
	redirectUrl: optString,
	expiresAt: timestamp,
	acceptedByUserUuid: optString,
	acceptedAt: nullableTimestamp,
	revokedAt: nullableTimestamp,
	createdAt: timestamp,
	status: enumString<InvitationStatus>(),
});

export const InvitationCreatedSchema = object<InvitationCreated>({
	invitation: InvitationSchema,
	link: string,
});

// ── Wallets ─────────────────────────────────────────────────────────────────

const BalanceSchema = object<Balance>({ currency: string, balance: string, balanceUsd: number });

const TokenWalletSchema = object<TokenWallet>({
	uuid: string,
	createdAt: timestamp,
	tokenId: unsigned,
	token: CurrencySchema,
	walletUuid: string,
	balance: optional(BalanceSchema),
});

export const WalletSchema = object<Wallet>({
	uuid: string,
	createdAt: timestamp,
	publicKey: string,
	test: boolean,
	userUuid: optString,
	tokenWallets: list(TokenWalletSchema),
	currencyId: unsigned,
	currency: CurrencySchema,
});

// ── Accounting ──────────────────────────────────────────────────────────────

export const AccountingEventSchema = object<AccountingEvent>({
	paymentUuid: optString,
	paymentReference: optString,
	type: enumString<AccountingEventType>(),
	txTimeUtc: timestamp,
	receiptUrl: optString,
	relatedPaymentUuid: optString,
	relatedPaymentReference: optString,
	userUuid: optString,
	productUuid: optString,
	productReference: optString,
	productName: optString,
	productDescription: optString,
	customerUuid: optString,
	customerReference: optString,
	chain: enumString<Chain>(),
	blockNumberOrSlot: string,
	txHash: optString,
	fromAddress: optString,
	toAddress: optString,
	tokenSymbol: string,
	currencyDecimals: unsigned,
	tokenContractOrMint: string,
	explorerUrl: optString,
	grossAmount: optString,
	grossAmountUsd: optNumber,
	platformFeePercent: optNumber,
	platformFeeUsd: optNumber,
	platformFee: optString,
	organizationFeePercent: optNumber,
	organizationFeeUsd: optNumber,
	organizationFee: optString,
	referralFeePercent: number,
	referralFeeUsd: number,
	referralFee: string,
	networkFeesUsd: optNumber,
	networkFees: optString,
	netAmountUsd: optNumber,
	netAmount: optString,
	userName: optString,
	userLastName: optString,
	customerName: optString,
	customerLastName: optString,
});

// ── Webhook endpoints and the event log ─────────────────────────────────────

const webhookEndpointFields: Fields<WebhookEndpoint> = {
	uuid: string,
	test: boolean,
	url: string,
	events: list(enumString<EventType>()),
	includeMembers: boolean,
	payloadVersion: enumString<WebhookPayloadVersion>(),
	description: string,
	createdAt: timestamp,
	rotatedAt: optTimestamp,
	disabledAt: optTimestamp,
	disabledReason: optional(enumString<EndpointDisabledReason>()),
	failingSince: optTimestamp,
	lastDeliveredAt: optTimestamp,
};
export const WebhookEndpointSchema = object<WebhookEndpoint>(webhookEndpointFields);

export const WebhookEndpointCreatedSchema = object<WebhookEndpointCreated>({
	...webhookEndpointFields,
	secret: string,
});

const DeliveryAttemptSchema = object<DeliveryAttempt>({
	uuid: string,
	eventId: string,
	eventType: enumString<EventType>(),
	endpointUuid: string,
	attempt: integer,
	delivered: boolean,
	skipped: optBoolean,
	statusCode: optional(integer),
	error: optString,
	durationMs: integer,
	attemptedAt: timestamp,
});

export const EndpointDeliverySchema = object<EndpointDelivery>({
	endpointUuid: string,
	url: string,
	delivered: boolean,
	attempts: list(DeliveryAttemptSchema),
});

// ── Webhook event data ──────────────────────────────────────────────────────

const PaymentCompletedSchema = object<PaymentCompleted>({
	...paymentFields,
	managementPageLink: optString,
});

const SubscriptionCreatedSchema = object<SubscriptionCreated>({
	...subscriptionFields,
	managementPageLink: optString,
});

const SubscriptionBilledSchema = object<SubscriptionBilled>({
	...billFields,
	subscriptionReference: optString,
	subscriptionStatus: enumString<SubscriptionStatus>(),
});

const SubscriptionStatusChangedSchema = object<SubscriptionStatusChanged>({
	...subscriptionFields,
	previousStatus: enumString<SubscriptionStatus>(),
	managementPageLink: optString,
});

const SubscriptionActionRequiredChangedSchema = object<SubscriptionActionRequiredChanged>({
	...subscriptionFields,
	previousActionRequired: optional(enumString<ActionRequired>()),
	managementPageLink: optString,
});

const SubscriptionBillingFailedSchema = object<SubscriptionBillingFailed>({
	...subscriptionFields,
	reason: enumString<BillingFailureReason>(),
	failureCode: optString,
	billUuid: string,
	amountUsd: string,
	attempt: unsigned,
	remainingAttempts: unsigned,
	nextAttemptAt: optTimestamp,
	managementPageLink: optString,
});

const SubscriptionUpcomingBillSchema = object<SubscriptionUpcomingBill>({
	...subscriptionFields,
	billingDate: timestamp,
	amountUsd: number,
	trialEnding: boolean,
	balanceSufficient: optBoolean,
	allowanceSufficient: optBoolean,
});

const MemberJoinedSchema = object<MemberJoined>({ ...memberFields, invitationUuid: string });

const HeldFundsReleasedSchema = object<HeldFundsReleased>({
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	amount: number,
	amountMinUnits: string,
	currencyId: unsigned,
	currency: nullable(CurrencySchema),
	txHash: string,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	received: boolean,
	type: enumString<TransferType>(),
	txMetadata: TxMetadataSchema,
	ledgers: list(LedgerEntrySchema),
});

const WebhookTestSchema = object<WebhookTest>({ endpointUuid: string, message: string });

/** Each known event type's data schema. */
export const EVENT_DATA_SCHEMAS: Record<string, Schema<unknown>> = {
	'payment.completed': PaymentCompletedSchema,
	'subscription.created': SubscriptionCreatedSchema,
	'subscription.billed': SubscriptionBilledSchema,
	'subscription.statusChanged': SubscriptionStatusChangedSchema,
	'subscription.actionRequiredChanged': SubscriptionActionRequiredChangedSchema,
	'subscription.billingFailed': SubscriptionBillingFailedSchema,
	'subscription.upcomingBill': SubscriptionUpcomingBillSchema,
	'refund.requested': RefundSchema,
	'refund.completed': RefundSchema,
	'refund.denied': RefundSchema,
	'member.joined': MemberJoinedSchema,
	'member.removed': MemberSchema,
	'heldFunds.released': HeldFundsReleasedSchema,
	'checkout.expired': CheckoutExpiredDataSchema,
	'webhook.test': WebhookTestSchema,
};

const envelopeFields: Fields<Omit<EventEnvelope<string, unknown>, 'data'>> = {
	id: string,
	type: string,
	version: enumString<WebhookPayloadVersion>(),
	createdAt: timestamp,
	test: boolean,
	userUuid: optString,
};
export const EnvelopeSchema = object<Omit<EventEnvelope<string, unknown>, 'data'>>(envelopeFields);

/**
 * An event: its envelope, and its data decoded by its type (raw for an unknown type). The
 * result is typed by the caller (`Event`, `EventDetail`).
 */
export const EventSchema = custom<EventEnvelope<string, unknown>>(
	'an object',
	(value, path, ctx) => {
		const envelope = EnvelopeSchema.decode(value, path, ctx);
		const dataSchema = Object.prototype.hasOwnProperty.call(EVENT_DATA_SCHEMAS, envelope.type)
			? EVENT_DATA_SCHEMAS[envelope.type]
			: raw;
		const dataPath = path === '' ? 'data' : `${path}.data`;
		return { ...envelope, data: dataSchema.decode(rawMember(value, 'data'), dataPath, ctx) };
	}
);

/** An event of the log with its deliveries. */
export const EventDetailSchema = custom<
	EventEnvelope<string, unknown> & { deliveries: EndpointDelivery[] }
>('an object', (value, path, ctx) => {
	const event = EventSchema.decode(value, path, ctx);
	const deliveriesPath = path === '' ? 'deliveries' : `${path}.deliveries`;
	return {
		...event,
		deliveries: list(EndpointDeliverySchema).decode(
			rawMember(value, 'deliveries'),
			deliveriesPath,
			ctx
		),
	};
});
