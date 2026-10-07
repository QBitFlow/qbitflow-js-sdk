/**
 * The API's enums. Each is a string-literal union widened with `(string & {})`: a value the SDK
 * does not know yet is kept as is, never rejected. Compare against the exported `const`
 * objects (`SubscriptionStatus.PastDue`), which list the known values.
 *
 * @module
 */

/** A value of `T`, or a value the SDK does not know yet. */
type Open<T extends string> = T | (string & {});

/** The known values of an enum object. */
type ValuesOf<T> = T[keyof T];

/** A subscription's lifecycle status. */
export const SubscriptionStatus = {
	/** In its free trial. */
	Trial: 'trial',
	/** The trial ended without its customer confirming it. */
	TrialExpired: 'trialExpired',
	/** Billed normally. */
	Active: 'active',
	/** A bill failed: retried (dunning) until it is paid or the subscription cancelled. */
	PastDue: 'pastDue',
	/** Paused by its customer: not billed until resumed. */
	Paused: 'paused',
	/** Stopped: cancelled at the end of the current period. */
	Stopped: 'stopped',
	/** Cancelled. Final. */
	Cancelled: 'cancelled',
} as const;
export type SubscriptionStatus = Open<ValuesOf<typeof SubscriptionStatus>>;

/** What a subscription's customer must do (absent: nothing). */
export const ActionRequired = {
	/** The allowance is too low for the next bill. */
	TopUpAllowance: 'topUpAllowance',
	/** The bill is above the customer's maximum per period. */
	RaiseMaximum: 'raiseMaximum',
	/** The trial must be confirmed to be billed. */
	ConfirmTrial: 'confirmTrial',
} as const;
export type ActionRequired = Open<ValuesOf<typeof ActionRequired>>;

/** Why a subscription stopped or was cancelled. */
export const CancellationReason = {
	Customer: 'customer',
	Merchant: 'merchant',
	BillingFailed: 'billingFailed',
	TrialNotConverted: 'trialNotConverted',
	MerchantClosed: 'merchantClosed',
	InactiveOnChain: 'inactiveOnChain',
} as const;
export type CancellationReason = Open<ValuesOf<typeof CancellationReason>>;

/** Why a bill failed (`subscription.billingFailed`). */
export const BillingFailureReason = {
	InsufficientBalance: 'insufficientBalance',
	AllowanceExhausted: 'allowanceExhausted',
	ApprovalRevoked: 'approvalRevoked',
	MaxAmountExceeded: 'maxAmountExceeded',
	Other: 'other',
} as const;
export type BillingFailureReason = Open<ValuesOf<typeof BillingFailureReason>>;

/** Where a billing run is ({@link BillingState.stage}). */
export const BillingStage = {
	/** Being planned, charged or recorded. */
	Running: 'running',
	/** Waiting for its next attempt, its due date, or the end of a trial's grace period. */
	Waiting: 'waiting',
	/** Over the customer's maximum: waiting for their new one. */
	Pending: 'pending',
	Done: 'done',
} as const;
export type BillingStage = Open<ValuesOf<typeof BillingStage>>;

/** How a finished billing run ended. */
export const BillingOutcome = {
	Paid: 'paid',
	/** Nothing to bill: paid already, cancelled, or gone. */
	NotDue: 'notDue',
	/** Below the minimum amount: the period moved on without a charge. */
	Skipped: 'skipped',
	/** The subscription was cancelled. */
	Cancelled: 'cancelled',
	/** Its customer paused the subscription: not charged. */
	Paused: 'paused',
} as const;
export type BillingOutcome = Open<ValuesOf<typeof BillingOutcome>>;

/** A checkout session's (or a refund approval's) status. */
export const CheckoutSessionStatusValue = {
	/** Waiting for the customer: nothing sent yet, or the last attempt failed (`lastAttempt`). */
	Created: 'created',
	/** A transaction was sent: waiting for the network and its record. */
	WaitingConfirmation: 'waitingConfirmation',
	/** Confirmed and recorded. Final. */
	Completed: 'completed',
	/** Expired unpaid. Final. */
	Expired: 'expired',
} as const;
export type CheckoutSessionStatusValue = Open<ValuesOf<typeof CheckoutSessionStatusValue>>;

/** A failed attempt's status. */
export const AttemptStatus = {
	/** Not sent, not confirmed, or failed on the network: nothing was paid. */
	Failed: 'failed',
} as const;
export type AttemptStatus = Open<ValuesOf<typeof AttemptStatus>>;

/** A refund's status. */
export const RefundStatus = {
	Pending: 'pending',
	Approved: 'approved',
	Rejected: 'rejected',
} as const;
export type RefundStatus = Open<ValuesOf<typeof RefundStatus>>;

/** Who started a refund. */
export const RefundInitiator = {
	/** Requested by the customer; the merchant answers. */
	Customer: 'customer',
	/** Sent by the merchant without a request. */
	Merchant: 'merchant',
} as const;
export type RefundInitiator = Open<ValuesOf<typeof RefundInitiator>>;

/** Why a transaction cannot be refunded now. */
export const NotRefundableReason = {
	RefundExists: 'refundExists',
	HeldFundsReleased: 'heldFundsReleased',
} as const;
export type NotRefundableReason = Open<ValuesOf<typeof NotRefundableReason>>;

/** What a combined feed row is. */
export const CombinedPaymentSource = {
	/** A one-time payment (`pay@…`). */
	Payment: 'payment',
	/** A subscription's bill (`sub-hist@…`). */
	SubscriptionHistory: 'subscriptionHistory',
} as const;
export type CombinedPaymentSource = Open<ValuesOf<typeof CombinedPaymentSource>>;

/** What a failed attempt was paying. */
export const FailureKind = {
	/** A one-time payment's attempt (`pay@…`). */
	Payment: 'payment',
	/** A subscription checkout's: its creation and first bill (`sub@…`). */
	SubscriptionCheckout: 'subscriptionCheckout',
	/** A subscription's bill (`sub-hist@…`). */
	Bill: 'bill',
} as const;
export type FailureKind = Open<ValuesOf<typeof FailureKind>>;

/** What a failure means, from its code. */
export const FailureCategory = {
	/** The customer's wallet couldn't pay. */
	InsufficientBalance: 'insufficientBalance',
	/** A subscription's allowance is used up or expired. */
	AllowanceExhausted: 'allowanceExhausted',
	/** The wallet no longer lets the subscription pull the token. */
	ApprovalRevoked: 'approvalRevoked',
	/** A bill above the customer's maximum per period. */
	MaxAmountExceeded: 'maxAmountExceeded',
	/** Sent and reverted on-chain. */
	Reverted: 'reverted',
	/** Sent, never taken or confirmed in time. */
	NotConfirmed: 'notConfirmed',
	/** The customer's signature was refused. */
	SignatureRejected: 'signatureRejected',
	Other: 'other',
} as const;
export type FailureCategory = Open<ValuesOf<typeof FailureCategory>>;

/** A blockchain (the testnet's in test mode). */
export const Chain = {
	/** Ethereum. */
	ETH: 'ETH',
	/** Base. */
	BASE: 'BASE',
	/** Solana. */
	SOL: 'SOL',
} as const;
export type Chain = Open<ValuesOf<typeof Chain>>;

/** A transaction's kind (`checkout.expired`'s `txType`: `payment` or `createSubscription`). */
export const TransactionType = {
	Payment: 'payment',
	Transfer: 'transfer',
	TokenTransfer: 'tokenTransfer',
	CreateSubscription: 'createSubscription',
	CancelSubscription: 'cancelSubscription',
	ForceCancelSubscription: 'forceCancelSubscription',
	ExecuteSubscription: 'executeSubscription',
	CreatePaygSubscription: 'createPaygSubscription',
	CancelPaygSubscription: 'cancelPaygSubscription',
	IncreaseAllowance: 'increaseAllowance',
	UpdateMaxAmount: 'updateMaxAmount',
	Refund: 'refund',
	Faucet: 'faucet',
	ClaimFunds: 'claimFunds',
	ReleaseHeldFunds: 'releaseHeldFunds',
} as const;
export type TransactionType = Open<ValuesOf<typeof TransactionType>>;

/** A transfer's kind (`heldFunds.released`). */
export const TransferType = {
	/** v1: funds held for a user, paid when they claimed their account. */
	AccountClaim: 'accountClaim',
	/** The funds an organization held for a member, paid out to them. */
	HeldFundsRelease: 'heldFundsRelease',
	Internal: 'internal',
	External: 'external',
} as const;
export type TransferType = Open<ValuesOf<typeof TransferType>>;

/** A held-funds line's kind. */
export const LedgerEntryType = {
	Payment: 'payment',
	SubscriptionHistory: 'subscriptionHistory',
	Refund: 'refund',
} as const;
export type LedgerEntryType = Open<ValuesOf<typeof LedgerEntryType>>;

/** An accounting export row's kind. */
export const AccountingEventType = {
	Payment: 'payment',
	SubscriptionHistory: 'subscriptionHistory',
	Refund: 'refund',
	OrganizationFee: 'organizationFee',
	ReferralFee: 'referralFee',
} as const;
export type AccountingEventType = Open<ValuesOf<typeof AccountingEventType>>;

/** An invitation's status (computed when read). */
export const InvitationStatus = {
	/** Sent, waiting for the person. */
	Pending: 'pending',
	/** The person joined. */
	Accepted: 'accepted',
	/** Revoked by the organization (or replaced by a newer one). */
	Revoked: 'revoked',
	/** Not accepted in time. */
	Expired: 'expired',
} as const;
export type InvitationStatus = Open<ValuesOf<typeof InvitationStatus>>;

/** A webhook event's type. */
export const EventType = {
	PaymentCompleted: 'payment.completed',
	SubscriptionCreated: 'subscription.created',
	SubscriptionBilled: 'subscription.billed',
	SubscriptionStatusChanged: 'subscription.statusChanged',
	SubscriptionActionRequiredChanged: 'subscription.actionRequiredChanged',
	SubscriptionBillingFailed: 'subscription.billingFailed',
	SubscriptionUpcomingBill: 'subscription.upcomingBill',
	RefundRequested: 'refund.requested',
	RefundCompleted: 'refund.completed',
	RefundDenied: 'refund.denied',
	MemberJoined: 'member.joined',
	MemberRemoved: 'member.removed',
	HeldFundsReleased: 'heldFunds.released',
	CheckoutExpired: 'checkout.expired',
	WebhookTest: 'webhook.test',
} as const;
/** A known webhook event type. */
export type KnownEventType = ValuesOf<typeof EventType>;
export type EventType = Open<KnownEventType>;

/** A webhook endpoint's (and an event's) payload version. */
export const WebhookPayloadVersion = {
	/** v1's bodies (endpoints migrated from v1; not parsed by this SDK). */
	V1: 'v1',
	/** The event envelope. */
	V2: 'v2',
} as const;
export type WebhookPayloadVersion = Open<ValuesOf<typeof WebhookPayloadVersion>>;

/** Why a webhook endpoint is disabled. */
export const EndpointDisabledReason = {
	/** Every delivery failing for too long. */
	Failing: 'failing',
	/** Disabled by its owner. */
	Owner: 'owner',
	/** Its member removed, or its organization closed. */
	Closed: 'closed',
} as const;
export type EndpointDisabledReason = Open<ValuesOf<typeof EndpointDisabledReason>>;

/** A {@link Duration}'s unit (months = 30 days, years = 365 days). */
export const DurationUnit = {
	Seconds: 'seconds',
	Minutes: 'minutes',
	Hours: 'hours',
	Days: 'days',
	Weeks: 'weeks',
	Months: 'months',
	Years: 'years',
} as const;
export type DurationUnit = Open<ValuesOf<typeof DurationUnit>>;

/**
 * What a credential (or an invitation) may do in a space. An API key is `admin` (organization
 * key) or `user` (a member's key, or `onBehalfOf`).
 */
export const Role = {
	Owner: 'owner',
	Admin: 'admin',
	User: 'user',
	Handle: 'handle',
} as const;
export type Role = Open<ValuesOf<typeof Role>>;

/** What authenticated a request ({@link Me.credential}). */
export const Credential = {
	/** An API key (`X-API-Key`). */
	ApiKey: 'apiKey',
	/** A signed-in person's access token. */
	Session: 'session',
} as const;
export type Credential = Open<ValuesOf<typeof Credential>>;

/** `details.reason` of a 409 `merchant_not_ready`. */
export const MerchantNotReadyReason = {
	NoWallet: 'noWallet',
	OrganizationNoWallet: 'organizationNoWallet',
	NoTokenWallet: 'noTokenWallet',
} as const;
export type MerchantNotReadyReason = Open<ValuesOf<typeof MerchantNotReadyReason>>;

/** The known values of an enum object, as a list (filter checks). @internal */
export function knownValues<T extends Record<string, string>>(e: T): string[] {
	return Object.values(e);
}
