/**
 * The decoding schemas of every answer and webhook event, mirroring the API's types (docs/api).
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
	list,
	object,
	optional,
	raw,
	rawMember,
	type Schema,
	string,
	stringMap,
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
	Credential,
	DurationUnit,
	EndpointDisabledReason,
	EventType,
	FailureCategory,
	FailureKind,
	FeeLineType,
	InvitationStatus,
	LedgerEntryType,
	NetworkFeesPayer,
	NotRefundableReason,
	RefundInitiator,
	RefundStatus,
	Role,
	SubscriptionStatus,
	TransactionKind,
	TransactionType,
	TransferType,
	WebhookPayloadVersion,
} from './enums.js';
import type { AccountingEvent } from './models/accounting.js';
import type {
	CheckoutSessionStatus,
	CreatedCheckoutSession,
	PaymentSessionData,
	SubscriptionSessionData,
} from './models/checkout.js';
import type {
	Attempt,
	Currency,
	CustomerSummary,
	Duration,
	FeeLine,
	OrganizationFee,
	Page,
	ReferralFee,
	RefundSummary,
	Settlement,
	SettlementTransaction,
	Split,
	TokenAmount,
	TransferSettlement,
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
	SubscriptionStatusChanged,
	SubscriptionUpcomingBill,
	WebhookTest,
} from './models/events.js';
import type {
	CreatedInvitation,
	HeldFunds,
	Invitation,
	LedgerEntry,
	Me,
	MeMember,
	MeSpace,
	Member,
	MemberHeldFunds,
} from './models/members.js';
import type { Bill, Failure, Payment, Transaction } from './models/payments.js';
import type { Product, SubscriptionTerms } from './models/products.js';
import type { Refund, RefundApproval } from './models/refunds.js';
import type { Allowance, DunningStatus, Subscription, TestBill } from './models/subscriptions.js';
import type { Balance, TokenWallet, Wallet } from './models/wallets.js';
import type {
	DeliveryAttempt,
	EndpointDelivery,
	WebhookEndpoint,
	WebhookEndpointCreated,
} from './models/webhooks.js';

const optString = optional(string);
const optBoolean = optional(boolean);
const optTimestamp = optional(timestamp);

/** A page of `item`s: `{items, hasMore, nextCursor?}` (absent `items` → `[]`). */
export function page<T>(item: Schema<T>): Schema<Page<T>> {
	return object<Page<T>>({ items: list(item), hasMore: boolean, nextCursor: optString });
}

// ── Common ──────────────────────────────────────────────────────────────────

export const DurationSchema = object<Duration>({
	value: unsigned,
	unit: optional(enumString<DurationUnit>()),
});

export const CurrencySchema = object<Currency>({
	id: unsigned,
	code: string,
	symbol: string,
	name: string,
	chain: enumString<Chain>(),
	decimals: unsigned,
	address: optString,
	mainCurrencyId: optional(unsigned),
	test: boolean,
});

const tokenAmountFields: Fields<TokenAmount> = {
	amount: string,
	amountMinUnits: string,
	amountUsd: optString,
};
export const TokenAmountSchema = object<TokenAmount>(tokenAmountFields);

export const CustomerSummarySchema = object<CustomerSummary>({
	uuid: string,
	firstName: string,
	lastName: optString,
	email: string,
	reference: optString,
	deleted: boolean,
});

export const RefundSummarySchema = object<RefundSummary>({
	uuid: string,
	status: enumString<RefundStatus>(),
	initiatedBy: enumString<RefundInitiator>(),
	refundPercent: string,
	amount: optString,
	amountMinUnits: string,
	amountUsd: optString,
	createdAt: timestamp,
	respondedAt: optTimestamp,
});

export const AttemptSchema = object<Attempt>({
	status: enumString<AttemptStatus>(),
	code: optString,
	message: optString,
	txHash: optString,
	at: timestamp,
});

const OrganizationFeeSchema = object<OrganizationFee>({ address: string, feePercent: string });

const ReferralFeeSchema = object<ReferralFee>({
	address: string,
	feePercent: string,
	deadline: timestamp,
});

const SplitSchema = object<Split>({
	platform: TokenAmountSchema,
	organization: optional(TokenAmountSchema),
	referral: optional(TokenAmountSchema),
	merchant: TokenAmountSchema,
	networkFee: optional(TokenAmountSchema),
});

export const SettlementTransactionSchema = object<SettlementTransaction>({
	blockNumber: string,
	blockTime: optTimestamp,
	gasUsed: optional(unsigned),
	fee: TokenAmountSchema,
	l1Fee: optional(TokenAmountSchema),
	nativePriceUsd: optString,
});

export const SettlementSchema = object<Settlement>({
	feePercent: string,
	organizationFee: optional(OrganizationFeeSchema),
	referralFee: optional(ReferralFeeSchema),
	split: optional(SplitSchema),
	transaction: optional(SettlementTransactionSchema),
});

export const TransferSettlementSchema = object<TransferSettlement>({
	transaction: optional(SettlementTransactionSchema),
});

export const FeeLineSchema = object<FeeLine>({
	type: enumString<FeeLineType>(),
	label: string,
	description: optString,
	amountUsd: string,
});

// ── Payments ────────────────────────────────────────────────────────────────

const paymentFields: Fields<Payment> = {
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	amount: string,
	amountMinUnits: string,
	amountUsd: string,
	currency: CurrencySchema,
	txHash: string,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	reference: optString,
	priceUsd: string,
	fees: list(FeeLineSchema),
	productName: string,
	productDescription: optString,
	metadata: stringMap,
	productUuid: optString,
	customerUuid: optString,
	customerReference: optString,
	note: optString,
	customer: optional(CustomerSummarySchema),
	settlement: SettlementSchema,
	confirmedAt: optTimestamp,
	paid: optString,
	paidMinUnits: optString,
	paidUsd: optString,
	refund: optional(RefundSummarySchema),
	refundable: optBoolean,
	notRefundableReason: optional(enumString<NotRefundableReason>()),
	checkoutOpenedAt: optTimestamp,
};
export const PaymentSchema = object<Payment>(paymentFields);

export const BillSchema = object<Bill>({
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	amount: string,
	amountMinUnits: string,
	amountUsd: string,
	currency: CurrencySchema,
	txHash: string,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	productName: string,
	productDescription: optString,
	productUuid: optString,
	subscriptionUuid: string,
	customerUuid: optString,
	customerReference: optString,
	customer: optional(CustomerSummarySchema),
	settlement: SettlementSchema,
	periodStart: optTimestamp,
	periodEnd: optTimestamp,
	confirmedAt: optTimestamp,
	paid: optString,
	paidMinUnits: optString,
	paidUsd: optString,
	refund: optional(RefundSummarySchema),
	refundable: optBoolean,
	notRefundableReason: optional(enumString<NotRefundableReason>()),
});

export const TransactionSchema = object<Transaction>({
	type: enumString<TransactionKind>(),
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	productName: string,
	productDescription: optString,
	priceUsd: optString,
	fees: list(FeeLineSchema),
	amount: string,
	amountMinUnits: string,
	amountUsd: string,
	currency: CurrencySchema,
	productUuid: optString,
	txHash: string,
	customerUuid: optString,
	customer: optional(CustomerSummarySchema),
	customerReference: optString,
	subscriptionUuid: optString,
	periodStart: optTimestamp,
	periodEnd: optTimestamp,
	reference: optString,
	subscriptionReference: optString,
	metadata: stringMap,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	settlement: SettlementSchema,
	confirmedAt: optTimestamp,
	paid: optString,
	paidMinUnits: optString,
	paidUsd: optString,
	refund: optional(RefundSummarySchema),
	refundable: optBoolean,
	notRefundableReason: optional(enumString<NotRefundableReason>()),
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
	attempted: string,
	attemptedMinUnits: string,
	attemptedUsd: string,
	currency: CurrencySchema,
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

export const CreatedCheckoutSessionSchema = object<CreatedCheckoutSession>({
	link: string,
	uuid: string,
	expiresAt: timestamp,
});

export const CheckoutSessionStatusSchema = object<CheckoutSessionStatus>({
	uuid: string,
	status: enumString<CheckoutSessionStatusValue>(),
	txHash: optString,
	message: optString,
	lastAttempt: optional(AttemptSchema),
	expiresAt: optTimestamp,
});

const paymentSessionFields: Fields<PaymentSessionData> = {
	uuid: string,
	reference: optString,
	productUuid: optString,
	productReference: optString,
	productName: optString,
	description: optString,
	priceUsd: string,
	fees: list(FeeLineSchema),
	amountUsd: string,
	successUrl: optString,
	cancelUrl: optString,
	redirectUrl: optString,
	organizationName: string,
	userName: optString,
	test: boolean,
	txType: enumString<TransactionType>(),
	availableCurrencies: list(CurrencySchema),
	metadata: stringMap,
	createdAt: optTimestamp,
	expiresAt: optTimestamp,
};
export const PaymentSessionDataSchema = object<PaymentSessionData>(paymentSessionFields);

export const SubscriptionSessionDataSchema = object<SubscriptionSessionData>({
	...paymentSessionFields,
	frequency: DurationSchema,
	trialPeriod: optional(DurationSchema),
	minPeriods: optional(unsigned),
	upgradingFromTrial: boolean,
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

const AllowanceSchema = object<Allowance>({
	...tokenAmountFields,
	remainingPeriods: optional(unsigned),
	maxPerPeriod: optString,
	maxPerPeriodMinUnits: optString,
});

const subscriptionFields: Fields<Subscription> = {
	uuid: string,
	reference: optString,
	createdAt: timestamp,
	updatedAt: timestamp,
	from: optString,
	to: string,
	productUuid: optString,
	subscriptionHash: optString,
	currency: CurrencySchema,
	frequency: DurationSchema,
	status: enumString<SubscriptionStatus>(),
	actionRequired: optional(enumString<ActionRequired>()),
	currentPeriodEnd: optTimestamp,
	priceUsd: string,
	fees: list(FeeLineSchema),
	allowance: optional(AllowanceSchema),
	lastBilledAt: optTimestamp,
	nextBillingAt: optTimestamp,
	cancelledAt: optTimestamp,
	cancellationReason: optional(enumString<CancellationReason>()),
	cancellableAt: optTimestamp,
	metadata: stringMap,
	managementPageLink: optString,
	test: boolean,
	userUuid: optString,
	customerUuid: optString,
	customerReference: optString,
	customer: optional(CustomerSummarySchema),
	dunning: optional(DunningStatusSchema),
};
export const SubscriptionSchema = object<Subscription>(subscriptionFields);

export const TestBillSchema = object<TestBill>({
	billUuid: string,
	stage: enumString<BillingStage>(),
	outcome: optional(enumString<BillingOutcome>()),
	attempts: unsigned,
	nextAttemptAt: optTimestamp,
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
	reason: optString,
	status: enumString<RefundStatus>(),
	createdAt: timestamp,
	merchantMessage: optString,
	respondedAt: optTimestamp,
	test: boolean,
	userUuid: optString,
	txHash: optString,
	initiatedBy: enumString<RefundInitiator>(),
	held: boolean,
	paid: string,
	paidMinUnits: string,
	paidUsd: optString,
	refundPercent: string,
	amount: string,
	amountMinUnits: string,
	amountUsd: optString,
	currency: CurrencySchema,
	settlement: optional(TransferSettlementSchema),
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	approval: optional(RefundApprovalSchema),
	customerUuid: optString,
	productName: optString,
	customer: optional(CustomerSummarySchema),
});

// ── Customers and products ──────────────────────────────────────────────────

export const CustomerSchema = object<Customer>({
	uuid: string,
	firstName: string,
	lastName: optString,
	email: string,
	verified: boolean,
	phoneNumber: optString,
	address: optString,
	reference: optString,
	metadata: stringMap,
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
	description: optString,
	priceUsd: string,
	createdAt: timestamp,
	isActive: boolean,
	reference: string,
	metadata: stringMap,
	subscription: optional(SubscriptionTermsSchema),
	paymentLink: optString,
	test: boolean,
	userUuid: optString,
});

// ── Me, members, invitations ────────────────────────────────────────────────

const MeMemberSchema = object<MeMember>({
	userUuid: string,
	firstName: string,
	lastName: optString,
	email: string,
});

const MeSpaceSchema = object<MeSpace>({
	uuid: string,
	organizationUuid: string,
	organizationName: string,
	userUuid: optString,
	test: boolean,
	role: enumString<Role>(),
	member: optional(MeMemberSchema),
	organizationFeePercent: optString,
	trustedAt: optTimestamp,
	createdAt: timestamp,
});

export const MeSchema = object<Me>({
	credential: enumString<Credential>(),
	apiKeyUuid: optString,
	userUuid: optString,
	role: optional(enumString<Role>()),
	onBehalfOfUserUuid: optString,
	space: optional(MeSpaceSchema),
});

const memberFields: Fields<Member> = {
	userUuid: string,
	firstName: string,
	lastName: optString,
	email: string,
	test: boolean,
	organizationFeePercent: string,
	trustedAt: optTimestamp,
	joinedAt: timestamp,
	acceptedCurrencies: list(CurrencySchema),
	spaceUuid: string,
};
export const MemberSchema = object<Member>(memberFields);

export const LedgerEntrySchema = object<LedgerEntry>({
	txUuid: string,
	type: enumString<LedgerEntryType>(),
	description: string,
	refundedTxUuid: optString,
	amountUsd: string,
	settlement: optional(SettlementSchema),
	currency: CurrencySchema,
	owed: string,
	owedMinUnits: string,
	owedUsd: string,
	createdAt: timestamp,
});

export const HeldFundsSchema = object<HeldFunds>({
	ledgers: list(LedgerEntrySchema),
	totalUsd: string,
});

export const MemberHeldFundsSchema = object<MemberHeldFunds>({
	userUuid: string,
	totalUsd: string,
	count: integer,
	oldestAt: timestamp,
});

const invitationFields: Fields<Invitation> = {
	uuid: string,
	test: optBoolean,
	email: string,
	role: enumString<Role>(),
	holdFunds: optBoolean,
	organizationFeePercent: optString,
	redirectUrl: optString,
	expiresAt: timestamp,
	acceptedByUserUuid: optString,
	acceptedAt: optTimestamp,
	revokedAt: optTimestamp,
	createdAt: timestamp,
	status: enumString<InvitationStatus>(),
};
export const InvitationSchema = object<Invitation>(invitationFields);

export const CreatedInvitationSchema = object<CreatedInvitation>({
	...invitationFields,
	link: string,
});

// ── Wallets ─────────────────────────────────────────────────────────────────

const BalanceSchema = object<Balance>({ currency: CurrencySchema, ...tokenAmountFields });

const TokenWalletSchema = object<TokenWallet>({
	uuid: string,
	createdAt: timestamp,
	currency: CurrencySchema,
	walletUuid: string,
	balance: optional(BalanceSchema),
});

export const WalletSchema = object<Wallet>({
	uuid: string,
	createdAt: timestamp,
	address: string,
	test: boolean,
	userUuid: optString,
	tokenWallets: list(TokenWalletSchema),
	currency: CurrencySchema,
});

// ── Accounting ──────────────────────────────────────────────────────────────

export const AccountingEventSchema = object<AccountingEvent>({
	txTimeUtc: timestamp,
	type: enumString<AccountingEventType>(),
	reference: optString,
	relatedReference: optString,
	productName: optString,
	customerReference: optString,
	grossAmountUsd: optString,
	platformFeeUsd: optString,
	referralFeeUsd: optString,
	organizationFeeUsd: optString,
	netAmountUsd: optString,
	chain: enumString<Chain>(),
	currency: string,
	currencyDecimals: unsigned,
	currencyPriceUsd: optString,
	grossAmount: optString,
	grossAmountMinUnits: optString,
	platformFee: optString,
	platformFeeMinUnits: optString,
	referralFee: optString,
	referralFeeMinUnits: optString,
	organizationFee: optString,
	organizationFeeMinUnits: optString,
	netAmount: optString,
	netAmountMinUnits: optString,
	networkFeesPaidBy: optional(enumString<NetworkFeesPayer>()),
	networkFees: optString,
	networkFeesMinUnits: optString,
	networkFeesCurrency: optString,
	networkFeesCurrencyDecimals: optional(unsigned),
	networkFeesCurrencyPriceUsd: optString,
	networkFeesUsd: optString,
	platformFeePercent: optString,
	referralFeePercent: optString,
	organizationFeePercent: optString,
	fromAddress: optString,
	toAddress: optString,
	txHash: optString,
	blockNumberOrSlot: optString,
	tokenContractOrMint: optString,
	explorerUrl: optString,
	receiptUrl: optString,
	txUuid: optString,
	relatedTxUuid: optString,
	productUuid: optString,
	productReference: optString,
	productDescription: optString,
	customerUuid: optString,
	userUuid: optString,
});

// ── Webhook endpoints and the event log ─────────────────────────────────────

const webhookEndpointFields: Fields<WebhookEndpoint> = {
	uuid: string,
	test: boolean,
	url: string,
	events: list(enumString<EventType>()),
	includeMembers: boolean,
	payloadVersion: enumString<WebhookPayloadVersion>(),
	description: optString,
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
	skipped: boolean,
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

const SubscriptionBilledSchema = object<SubscriptionBilled>({
	bill: BillSchema,
	subscription: SubscriptionSchema,
});

const SubscriptionStatusChangedSchema = object<SubscriptionStatusChanged>({
	...subscriptionFields,
	previousStatus: enumString<SubscriptionStatus>(),
});

const SubscriptionActionRequiredChangedSchema = object<SubscriptionActionRequiredChanged>({
	...subscriptionFields,
	previousActionRequired: optional(enumString<ActionRequired>()),
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
});

const SubscriptionUpcomingBillSchema = object<SubscriptionUpcomingBill>({
	...subscriptionFields,
	billingAt: timestamp,
	amountUsd: string,
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
	amount: string,
	amountMinUnits: string,
	amountUsd: string,
	currency: CurrencySchema,
	txHash: string,
	chain: optional(enumString<Chain>()),
	explorerUrl: optString,
	test: boolean,
	userUuid: optString,
	received: boolean,
	type: enumString<TransferType>(),
	settlement: TransferSettlementSchema,
	ledgers: list(LedgerEntrySchema),
});

const WebhookTestSchema = object<WebhookTest>({ endpointUuid: string, message: string });

/** Each known event type's data schema. */
export const EVENT_DATA_SCHEMAS: Record<string, Schema<unknown>> = {
	'payment.completed': PaymentCompletedSchema,
	'subscription.created': SubscriptionSchema,
	'subscription.billed': SubscriptionBilledSchema,
	'subscription.statusChanged': SubscriptionStatusChangedSchema,
	'subscription.actionRequiredChanged': SubscriptionActionRequiredChangedSchema,
	'subscription.billingFailed': SubscriptionBillingFailedSchema,
	'subscription.upcomingBill': SubscriptionUpcomingBillSchema,
	'refund.requested': RefundSchema,
	'refund.approved': RefundSchema,
	'refund.rejected': RefundSchema,
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
