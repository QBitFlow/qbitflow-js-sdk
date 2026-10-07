/**
 * Decoding schemas for every response and webhook payload, mirroring the Go server types
 * (docs/core). `object<T>()` requires exactly one decoder per property of `T`, so a schema
 * cannot drift from its interface without a compile error.
 *
 * @internal Not part of the public API.
 */

import {
	boolean,
	custom,
	enumString,
	integer,
	lazy,
	list,
	nullable,
	number,
	object,
	rawMember,
	Schema,
	string,
	timestamp,
	unknownValue,
} from './decode.js';
import type { AccountingEvent } from './types/accounting.js';
import type { ApiKey } from './types/api-key.js';
import type { ClaimFunds, ClaimRequestResponse } from './types/claim.js';
import type {
	BlockData,
	CursorDataResponse,
	NetworkFees,
	OrganizationFee,
	PaymentMetadata,
	ReferralFee,
	SuccessResponse,
	TxAmountsFull,
	TxAmountsMinUnits,
	TxAmountsUSD,
	TxMetadata,
} from './types/common.js';
import type { Currency } from './types/currency.js';
import type { Customer } from './types/customer.js';
import type { CombinedPayment, Payment } from './types/payment.js';
import type { Product } from './types/product.js';
import type { RefundEntry, RefundStatus } from './types/refund.js';
import {
	LinkResponse,
	OneTimePaymentSession,
	SessionCheckout,
	SessionWebhookResponse,
	SubscriptionSession,
} from './types/session.js';
import { TransactionStatus, TransactionStatusValue, TransactionType } from './types/status.js';
import {
	Subscription,
	SubscriptionHistory,
	SubscriptionStatus,
	SubscriptionStatusTransition,
	SubscriptionWebhook,
	SubscriptionWebhookEnvelope,
	SubscriptionWebhookType,
} from './types/subscription.js';
import type { User, UserRole } from './types/user.js';

// ── Shared ───────────────────────────────────────────────────────────────────

export const SuccessResponseSchema: Schema<SuccessResponse> = object<SuccessResponse>({
	message: string,
});

export const CurrencySchema: Schema<Currency> = object<Currency>({
	id: integer,
	symbol: string,
	name: string,
	decimals: integer,
	address: string,
	mainCurrencyId: nullable(integer),
	mainCurrency: nullable(lazy(() => CurrencySchema)),
	test: boolean,
});

const OrganizationFeeSchema = object<OrganizationFee>({
	organizationId: integer,
	organization: string,
	feeBps: integer,
});

const ReferralFeeSchema = object<ReferralFee>({
	referralId: integer,
	referrer: string,
	feeBps: integer,
	deadline: timestamp,
});

const NetworkFeesSchema = object<NetworkFees>({
	amount: string,
	unitsConsumed: integer,
});

const BlockDataSchema = object<BlockData>({
	number: string,
	timestamp: integer,
});

export const TxMetadataSchema: Schema<TxMetadata> = object<TxMetadata>({
	networkFees: NetworkFeesSchema,
	blockData: BlockDataSchema,
	mainCurrencyPriceUSD: number,
});

const TxAmountsUSDSchema = object<TxAmountsUSD>({
	platform: number,
	organization: number,
	referral: number,
	merchant: number,
});

const TxAmountsMinUnitsSchema = object<TxAmountsMinUnits>({
	platform: string,
	organization: string,
	referral: string,
	merchant: string,
});

const TxAmountsFullSchema = object<TxAmountsFull>({
	usd: TxAmountsUSDSchema,
	minUnits: TxAmountsMinUnitsSchema,
});

export const PaymentMetadataSchema: Schema<PaymentMetadata> = object<PaymentMetadata>({
	feeBps: integer,
	organizationFee: nullable(OrganizationFeeSchema),
	referralFee: nullable(ReferralFeeSchema),
	txMetadata: TxMetadataSchema,
	txAmounts: TxAmountsFullSchema,
});

/** A cursor-paginated envelope `{ items, nextCursor }` of `item`. */
export function cursorPage<T>(item: Schema<T>): Schema<CursorDataResponse<T>> {
	return object<CursorDataResponse<T>>({
		items: list(item),
		nextCursor: nullable(string),
	});
}

// ── Payments & subscriptions ─────────────────────────────────────────────────

export const PaymentSchema: Schema<Payment> = object<Payment>({
	uuid: string,
	reference: nullable(string),
	createdAt: timestamp,
	from: string,
	to: string,
	name: string,
	description: string,
	amount: number,
	amountMinUnits: string,
	currencyId: integer,
	currency: CurrencySchema,
	test: boolean,
	productId: integer,
	transactionHash: string,
	customerUUID: nullable(string),
	organizationId: integer,
	userId: integer,
	metadata: PaymentMetadataSchema,
});

export const CombinedPaymentSchema: Schema<CombinedPayment> = object<CombinedPayment>({
	source: enumString<'payment' | 'subscription_history'>(),
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	name: string,
	description: string,
	amount: number,
	amountMinUnits: string,
	currencyId: integer,
	currency: CurrencySchema,
	productId: nullable(integer),
	transactionHash: string,
	customerUUID: string,
	subscriptionUUID: nullable(string),
	test: boolean,
	metadata: nullable(PaymentMetadataSchema),
});

export const SubscriptionSchema: Schema<Subscription> = object<Subscription>({
	uuid: string,
	reference: nullable(string),
	from: string,
	to: string,
	productId: integer,
	subscriptionHash: string,
	currencyId: integer,
	currency: CurrencySchema,
	test: boolean,
	customerUUID: nullable(string),
	frequency: integer,
	allowance: string,
	subscriptionStatus: enumString<SubscriptionStatus>(),
	stopped: boolean,
	lastBillingDate: timestamp,
	nextBillingDate: timestamp,
	minimumCancellationDate: nullable(timestamp),
	createdAt: timestamp,
	updatedAt: timestamp,
	organizationId: integer,
	userId: integer,
});

export const SubscriptionHistorySchema: Schema<SubscriptionHistory> = object<SubscriptionHistory>({
	uuid: string,
	createdAt: timestamp,
	from: string,
	to: string,
	name: string,
	description: string,
	amount: number,
	amountMinUnits: string,
	currencyId: integer,
	currency: CurrencySchema,
	test: boolean,
	productId: integer,
	subscriptionUUID: string,
	transactionHash: string,
	customerUUID: nullable(string),
	organizationId: integer,
	userId: integer,
	metadata: PaymentMetadataSchema,
});

// ── Sessions & transaction status ────────────────────────────────────────────

export const LinkResponseSchema: Schema<LinkResponse> = object<LinkResponse>({
	uuid: string,
	link: string,
});

const sessionFields = {
	uuid: string,
	reference: string,
	productId: integer,
	productReference: string,
	productName: string,
	description: string,
	price: number,
	successUrl: string,
	cancelUrl: string,
	organizationId: integer,
	organizationName: string,
	feeBps: integer,
	organizationFeeBps: integer,
	userId: integer,
	userName: string,
	test: boolean,
	customerUUID: nullable(string),
	customerReference: string,
	txType: enumString<TransactionType>(),
	availableCurrencies: list(integer),
};

export const OneTimePaymentSessionSchema: Schema<OneTimePaymentSession> =
	object<OneTimePaymentSession>(sessionFields);

export const SubscriptionSessionSchema: Schema<SubscriptionSession> = object<SubscriptionSession>({
	...sessionFields,
	frequency: integer,
	trialPeriod: integer,
	minPeriods: integer,
	upgradingFromTrial: boolean,
});

/**
 * Whether a raw session is a subscription: `txType: "createSubscription"`, or an unknown
 * `txType` together with a billing `frequency`.
 */
export function isRawSubscriptionSession(value: unknown): boolean {
	const txType = rawMember(value, 'txType');
	if (txType === TransactionType.CREATE_SUBSCRIPTION) {
		return true;
	}
	if (txType === TransactionType.ONE_TIME_PAYMENT) {
		return false;
	}
	const frequency = rawMember(value, 'frequency');
	return typeof frequency === 'number' && frequency > 0;
}

/** A session decoded with the schema its `txType` calls for. */
export const SessionCheckoutSchema: Schema<SessionCheckout> = custom<SessionCheckout>(
	'a session object',
	(value, path, ctx) =>
		isRawSubscriptionSession(value)
			? SubscriptionSessionSchema.decode(value, path, ctx)
			: OneTimePaymentSessionSchema.decode(value, path, ctx)
);

export const TransactionStatusSchema: Schema<TransactionStatus> = object<TransactionStatus>({
	status: enumString<TransactionStatusValue>(),
	txHash: string,
	message: string,
	settlementDetails: nullable(PaymentMetadataSchema),
});

export const SessionWebhookSchema: Schema<SessionWebhookResponse> = object<SessionWebhookResponse>({
	uuid: string,
	status: nullable(TransactionStatusSchema),
	session: SessionCheckoutSchema,
	txType: enumString<TransactionType>(),
	managementPageLink: string,
});

const SubscriptionStatusTransitionSchema = object<SubscriptionStatusTransition>({
	previousStatus: enumString<SubscriptionStatus>(),
	currentStatus: enumString<SubscriptionStatus>(),
	updatedAt: timestamp,
});

const SubscriptionWebhookEnvelopeSchema = object<SubscriptionWebhookEnvelope & { type: string }>({
	subscriptionUUID: string,
	subscriptionReference: string,
	type: string,
});

/** A subscription webhook, `data` decoded by `type` (kept raw for an unknown `type`). */
export const SubscriptionWebhookSchema: Schema<SubscriptionWebhook> = custom<SubscriptionWebhook>(
	'a subscription webhook object',
	(value, path, ctx) => {
		const envelope = SubscriptionWebhookEnvelopeSchema.decode(value, path, ctx);
		const dataPath = path === '' ? 'data' : `${path}.data`;
		const rawData = rawMember(value, 'data');
		switch (envelope.type) {
			case SubscriptionWebhookType.STATUS_TRANSITION:
				return {
					...envelope,
					type: SubscriptionWebhookType.STATUS_TRANSITION,
					data: SubscriptionStatusTransitionSchema.decode(rawData, dataPath, ctx),
				};
			case SubscriptionWebhookType.BILLING:
				return {
					...envelope,
					type: SubscriptionWebhookType.BILLING,
					data: SubscriptionHistorySchema.decode(rawData, dataPath, ctx),
				};
			default:
				// An unknown type: keep `data` as the raw JSON (null when absent).
				return { ...envelope, data: unknownValue.decode(rawData ?? null, dataPath, ctx) };
		}
	}
);

// ── Customers, products, users, API keys ─────────────────────────────────────

export const CustomerSchema: Schema<Customer> = object<Customer>({
	uuid: string,
	name: string,
	lastName: string,
	email: string,
	phoneNumber: string,
	address: string,
	reference: string,
	createdAt: timestamp,
	test: boolean,
	organizationId: integer,
	userId: integer,
});

export const ProductSchema: Schema<Product> = object<Product>({
	id: integer,
	name: string,
	description: string,
	price: number,
	reference: string,
	createdAt: timestamp,
	isActive: boolean,
	test: boolean,
	organizationId: integer,
	userId: integer,
});

export const UserSchema: Schema<User> = object<User>({
	id: integer,
	name: string,
	lastName: string,
	email: string,
	createdAt: timestamp,
	updatedAt: timestamp,
	organizationId: integer,
	role: enumString<UserRole>(),
	organizationFeeBps: integer,
	claimedAt: nullable(timestamp),
});

export const ApiKeySchema: Schema<ApiKey> = object<ApiKey>({
	id: integer,
	name: string,
	organizationId: integer,
	userId: integer,
	createdAt: timestamp,
	expiresAt: nullable(timestamp),
	role: enumString<UserRole>(),
	test: boolean,
});

// ── Refunds, claims, accounting ──────────────────────────────────────────────

export const RefundEntrySchema: Schema<RefundEntry> = object<RefundEntry>({
	uuid: string,
	txId: string,
	test: boolean,
	reason: string,
	status: enumString<RefundStatus>(),
	createdAt: timestamp,
	merchantMessage: string,
	respondedAt: nullable(timestamp),
	txHash: string,
	amountMinUnits: string,
	organizationId: integer,
	userId: integer,
	metadata: nullable(TxMetadataSchema),
});

export const ClaimFundsSchema: Schema<ClaimFunds> = object<ClaimFunds>({
	userId: integer,
	totalAmountOwed: number,
	funded: boolean,
	test: boolean,
	createdAt: timestamp,
});

export const ClaimRequestResponseSchema: Schema<ClaimRequestResponse> =
	object<ClaimRequestResponse>({
		message: string,
		link: string,
	});

export const AccountingEventSchema: Schema<AccountingEvent> = object<AccountingEvent>({
	paymentId: string,
	paymentReference: string,
	type: enumString<
		| 'payment'
		| 'subscriptionHistory'
		| 'subHistory'
		| 'refund'
		| 'organizationFee'
		| 'referralFee'
	>(),
	txTimeUtc: timestamp,
	receiptUrl: string,
	relatedPaymentId: string,
	relatedPaymentReference: string,
	productId: integer,
	productReference: string,
	productName: string,
	productDescription: string,
	customerUUID: string,
	customerReference: string,
	chain: string,
	blockNumberOrSlot: string,
	txHash: string,
	fromAddress: string,
	toAddress: string,
	tokenSymbol: string,
	currencyDecimals: integer,
	tokenContractOrMint: string,
	explorerUrl: string,
	grossAmount: string,
	grossAmountUsd: number,
	platformFeePercent: number,
	platformFeeUsd: number,
	platformFee: string,
	organizationFeePercent: number,
	organizationFeeUsd: number,
	organizationFee: string,
	networkFeesUsd: number,
	networkFees: string,
	netAmountUsd: number,
	netAmount: string,
});
