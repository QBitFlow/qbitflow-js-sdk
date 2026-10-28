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
/** A `SubscriptionStatus` value (a string): one of {@link SubscriptionStatus}'s, or a newer one the SDK keeps as is. */
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
/** A `ActionRequired` value (a string): one of {@link ActionRequired}'s, or a newer one the SDK keeps as is. */
export type ActionRequired = Open<ValuesOf<typeof ActionRequired>>;

/** Why a subscription stopped or was cancelled. */
export const CancellationReason = {
	/** Cancelled by its customer. */
	Customer: 'customer',
	/** Cancelled by its merchant (`subscriptions.cancel`, or the dashboard). */
	Merchant: 'merchant',
	/** Its bill's last attempt failed. */
	BillingFailed: 'billingFailed',
	/** Its trial ended and its customer didn't subscribe within the grace period. */
	TrialNotConverted: 'trialNotConverted',
	/** Its merchant's space closed (a member removed, the organization closed). */
	MerchantClosed: 'merchantClosed',
	/** The contract no longer had it active (cancelled outside QBitFlow). */
	InactiveOnChain: 'inactiveOnChain',
} as const;
/** A `CancellationReason` value (a string): one of {@link CancellationReason}'s, or a newer one the SDK keeps as is. */
export type CancellationReason = Open<ValuesOf<typeof CancellationReason>>;

/** Why a bill failed (`subscription.billingFailed`). */
export const BillingFailureReason = {
	/** The customer's wallet doesn't hold the bill: they add funds to it. */
	InsufficientBalance: 'insufficientBalance',
	/** What remains of the allowance the customer signed doesn't cover the bill (or it expired): they top it up (the management page). */
	AllowanceExhausted: 'allowanceExhausted',
	/** The customer's wallet revoked the token approval the subscription pulls through: they approve it again (the management page). */
	ApprovalRevoked: 'approvalRevoked',
	/** The bill, at today's price, exceeds the maximum the customer signed: they sign a new maximum (the management page). */
	MaxAmountExceeded: 'maxAmountExceeded',
	/** Another refusal of the charge, caused by the customer's wallet. */
	Other: 'other',
} as const;
/** A `BillingFailureReason` value (a string): one of {@link BillingFailureReason}'s, or a newer one the SDK keeps as is. */
export type BillingFailureReason = Open<ValuesOf<typeof BillingFailureReason>>;

/** Where a bill stands ({@link TestBill.stage}). */
export const BillingStage = {
	/** Being planned, charged or recorded. */
	Running: 'running',
	/** Waiting for its next attempt, its due date, or the end of a trial's grace period. */
	Waiting: 'waiting',
	/** Over the customer's maximum: waiting for their new one. */
	Pending: 'pending',
	/** Over: see its `outcome`. */
	Done: 'done',
} as const;
/** A `BillingStage` value (a string): one of {@link BillingStage}'s, or a newer one the SDK keeps as is. */
export type BillingStage = Open<ValuesOf<typeof BillingStage>>;

/** How a bill ended ({@link TestBill.outcome}). */
export const BillingOutcome = {
	/** Charged and recorded (`subscription.billed`). */
	Paid: 'paid',
	/** Nothing to bill: paid already, cancelled, or gone. */
	NotDue: 'notDue',
	/** Below the minimum amount: the period moved on without a charge. */
	Skipped: 'skipped',
	/**
	 * The subscription was cancelled (stopped, its trial over, its merchant closed, inactive
	 * on-chain, or its last attempt failed).
	 */
	Cancelled: 'cancelled',
	/** Its customer paused the subscription: not charged. */
	Paused: 'paused',
} as const;
/** A `BillingOutcome` value (a string): one of {@link BillingOutcome}'s, or a newer one the SDK keeps as is. */
export type BillingOutcome = Open<ValuesOf<typeof BillingOutcome>>;

/** A checkout session's (or a refund approval's) status. */
export const CheckoutSessionStatusValue = {
	/** Waiting for the customer: nothing sent yet, or the last attempt failed (`lastAttempt`). */
	Created: 'created',
	/** A transaction was sent: waiting for the network and its record. */
	WaitingConfirmation: 'waitingConfirmation',
	/** Confirmed and recorded. Final. */
	Completed: 'completed',
	/** Expired unpaid (at its `expiresAt`, or expired by its merchant). Final. */
	Expired: 'expired',
} as const;
/** A `CheckoutSessionStatusValue` value (a string): one of {@link CheckoutSessionStatusValue}'s, or a newer one the SDK keeps as is. */
export type CheckoutSessionStatusValue = Open<ValuesOf<typeof CheckoutSessionStatusValue>>;

/** Who added a line to a checkout's price ({@link FeeLine.type}). */
export const FeeLineType = {
	/** The merchant's own line: a tax, shipping, a service fee. */
	Custom: 'custom',
	/** QBitFlow's processing fee, which the merchant has the customer pay (computed by QBitFlow). */
	ProcessingFee: 'processingFee',
} as const;
/** A `FeeLineType` value (a string): one of {@link FeeLineType}'s, or a newer one the SDK keeps as is. */
export type FeeLineType = Open<ValuesOf<typeof FeeLineType>>;

/**
 * Where a refund stands. An approval and a rejection are final: the transaction never gets
 * another refund.
 */
export const RefundStatus = {
	/** A customer's request not answered yet. */
	Pending: 'pending',
	/**
	 * The refund transfer is confirmed (`refund.approved`); the merchant's own refund is recorded
	 * only then.
	 */
	Approved: 'approved',
	/** Rejected by whoever decides it (`refund.rejected`). */
	Rejected: 'rejected',
} as const;
/** A `RefundStatus` value (a string): one of {@link RefundStatus}'s, or a newer one the SDK keeps as is. */
export type RefundStatus = Open<ValuesOf<typeof RefundStatus>>;

/** Who started a refund. */
export const RefundInitiator = {
	/** Requested by the customer; the merchant answers. */
	Customer: 'customer',
	/** Sent by the merchant without a request. */
	Merchant: 'merchant',
} as const;
/** A `RefundInitiator` value (a string): one of {@link RefundInitiator}'s, or a newer one the SDK keeps as is. */
export type RefundInitiator = Open<ValuesOf<typeof RefundInitiator>>;

/** Why a transaction cannot be refunded now. */
export const NotRefundableReason = {
	/** The transaction already has a refund (one per transaction, whatever it became). */
	RefundExists: 'refundExists',
	/** A held member's payment whose funds were already released to the member. */
	HeldFundsReleased: 'heldFundsReleased',
} as const;
/** A `NotRefundableReason` value (a string): one of {@link NotRefundableReason}'s, or a newer one the SDK keeps as is. */
export type NotRefundableReason = Open<ValuesOf<typeof NotRefundableReason>>;

/**
 * What a row of the transactions feed is ({@link Transaction.type}). Not
 * {@link TransactionType}, which is a checkout's `txType`.
 */
export const TransactionKind = {
	/** A one-time payment (`pay@…`): `payments.get`. */
	Payment: 'payment',
	/** A subscription's bill (`sub-hist@…`): `subscriptions.getBill`. */
	Bill: 'bill',
} as const;
/** A `TransactionKind` value (a string): one of {@link TransactionKind}'s, or a newer one the SDK keeps as is. */
export type TransactionKind = Open<ValuesOf<typeof TransactionKind>>;

/** What a failed attempt was paying. */
export const FailureKind = {
	/** A one-time payment's attempt (`pay@…`). */
	Payment: 'payment',
	/** A subscription checkout's: its creation and first bill (`sub@…`). */
	SubscriptionCheckout: 'subscriptionCheckout',
	/** A subscription's bill (`sub-hist@…`). */
	Bill: 'bill',
} as const;
/** A `FailureKind` value (a string): one of {@link FailureKind}'s, or a newer one the SDK keeps as is. */
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
	/** Any other failure. */
	Other: 'other',
} as const;
/** A `FailureCategory` value (a string): one of {@link FailureCategory}'s, or a newer one the SDK keeps as is. */
export type FailureCategory = Open<ValuesOf<typeof FailureCategory>>;

/** A blockchain, by its native coin's symbol ({@link Currency.chain}; the testnet's in test mode). */
export const Chain = {
	/** Ethereum. */
	ETH: 'ETH',
	/** Base. */
	BASE: 'BASE',
	/** Solana. */
	SOL: 'SOL',
} as const;
/** A `Chain` value (a string): one of {@link Chain}'s, or a newer one the SDK keeps as is. */
export type Chain = Open<ValuesOf<typeof Chain>>;

/** A transaction's kind (`checkout.expired`'s `txType`: `payment` or `createSubscription`). */
export const TransactionType = {
	/** A one-time payment's checkout. */
	Payment: 'payment',
	/** A subscription's checkout. */
	CreateSubscription: 'createSubscription',
} as const;
/** A `TransactionType` value (a string): one of {@link TransactionType}'s, or a newer one the SDK keeps as is. */
export type TransactionType = Open<ValuesOf<typeof TransactionType>>;

/** A held-funds line's kind. A held member sells no subscription, so no bill is ever a line. */
export const LedgerEntryType = {
	/** A payment made to the member while the organization held their funds. */
	Payment: 'payment',
	/** A refund the organization sent of one of them. */
	Refund: 'refund',
} as const;
/** A `LedgerEntryType` value (a string): one of {@link LedgerEntryType}'s, or a newer one the SDK keeps as is. */
export type LedgerEntryType = Open<ValuesOf<typeof LedgerEntryType>>;

/** An accounting export row's kind. */
export const AccountingEventType = {
	/** A one-time payment (`pay@…`). */
	Payment: 'payment',
	/** A subscription's bill (`sub-hist@…`). */
	Bill: 'bill',
	/** A refund the space sent (`refund@…`). */
	Refund: 'refund',
	/** The fee the organization earned on a member's payment or bill. */
	OrganizationFee: 'organizationFee',
	/** The referrer's share earned on a referred organization's payment or bill. */
	ReferralFee: 'referralFee',
} as const;
/** A `AccountingEventType` value (a string): one of {@link AccountingEventType}'s, or a newer one the SDK keeps as is. */
export type AccountingEventType = Open<ValuesOf<typeof AccountingEventType>>;

/** Whose wallet paid an accounting event's network fees ({@link AccountingEvent.networkFeesPaidBy}). */
export const NetworkFeesPayer = {
	/** A payment or a bill: the payer, on top of the amount. */
	Payer: 'payer',
	/** A refund the space sent from its wallet. */
	Merchant: 'merchant',
	/**
	 * A refund of a payment the organization held for its member, sent from the organization's
	 * wallet.
	 */
	Organization: 'organization',
} as const;
/** A `NetworkFeesPayer` value (a string): one of {@link NetworkFeesPayer}'s, or a newer one the SDK keeps as is. */
export type NetworkFeesPayer = Open<ValuesOf<typeof NetworkFeesPayer>>;

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
/** A `InvitationStatus` value (a string): one of {@link InvitationStatus}'s, or a newer one the SDK keeps as is. */
export type InvitationStatus = Open<ValuesOf<typeof InvitationStatus>>;

/** A webhook event's type. */
export const EventType = {
	/** A one-time payment confirmed: fulfil the order. */
	PaymentCompleted: 'payment.completed',
	/** A subscription signed (paid, or its trial started). */
	SubscriptionCreated: 'subscription.created',
	/** A subscription's bill paid. */
	SubscriptionBilled: 'subscription.billed',
	/** A subscription's status changed. */
	SubscriptionStatusChanged: 'subscription.statusChanged',
	/** What a subscription's customer must do changed. */
	SubscriptionActionRequiredChanged: 'subscription.actionRequiredChanged',
	/** A bill's attempt failed, or a bill waits for a new maximum. */
	SubscriptionBillingFailed: 'subscription.billingFailed',
	/** A bill, or a trial's end, is near. */
	SubscriptionUpcomingBill: 'subscription.upcomingBill',
	/** A customer requested a refund. */
	RefundRequested: 'refund.requested',
	/** Was `refund.completed`. */
	RefundApproved: 'refund.approved',
	/** Was `refund.denied`. */
	RefundRejected: 'refund.rejected',
	/** Someone accepted an invitation: a new member. */
	MemberJoined: 'member.joined',
	/** A member was removed. */
	MemberRemoved: 'member.removed',
	/** A member's held funds were paid out to them. */
	HeldFundsReleased: 'heldFunds.released',
	/** A checkout session expired unpaid. */
	CheckoutExpired: 'checkout.expired',
	/** Sent only by an endpoint's test (the dashboard); no endpoint subscribes to it. */
	WebhookTest: 'webhook.test',
} as const;
/** A known webhook event type. */
export type KnownEventType = ValuesOf<typeof EventType>;
/** A `EventType` value (a string): one of {@link EventType}'s, or a newer one the SDK keeps as is. */
export type EventType = Open<KnownEventType>;

/** Why a webhook endpoint is disabled. */
export const EndpointDisabledReason = {
	/** Every delivery failing for 3 days (live mode only). */
	Failing: 'failing',
	/** Disabled by its owner. */
	Owner: 'owner',
	/** Its member removed, or its organization closed. */
	Closed: 'closed',
} as const;
/** A `EndpointDisabledReason` value (a string): one of {@link EndpointDisabledReason}'s, or a newer one the SDK keeps as is. */
export type EndpointDisabledReason = Open<ValuesOf<typeof EndpointDisabledReason>>;

/** A {@link Duration}'s unit (months = 30 days, years = 365 days). */
export const DurationUnit = {
	/** Seconds. */
	Seconds: 'seconds',
	/** Minutes. */
	Minutes: 'minutes',
	/** Hours. */
	Hours: 'hours',
	/** Days. */
	Days: 'days',
	/** Weeks (7 days). */
	Weeks: 'weeks',
	/** Months (30 days). */
	Months: 'months',
	/** Years (365 days). */
	Years: 'years',
} as const;
/** A `DurationUnit` value (a string): one of {@link DurationUnit}'s, or a newer one the SDK keeps as is. */
export type DurationUnit = Open<ValuesOf<typeof DurationUnit>>;

/**
 * What a credential may do in a space (`Me.role`, `Me.space.role`): an API key is `admin` (an
 * organization key) or `user` (a member's key, or an organization key acting `onBehalfOf` a
 * member).
 */
export const Role = {
	/** An organization key: every method. */
	Admin: 'admin',
	/** A member's key, or an organization key acting `onBehalfOf` a member: the admin methods answer 403. */
	User: 'user',
} as const;
/** A `Role` value (a string): one of {@link Role}'s, or a newer one the SDK keeps as is. */
export type Role = Open<ValuesOf<typeof Role>>;

/** `details.reason` of a 409 `merchant_not_ready`. */
export const MerchantNotReadyReason = {
	/** The space's wallets accept no currency. */
	NoWallet: 'noWallet',
	/** The organization, which holds the member's funds, has no wallet accepting a currency. */
	OrganizationNoWallet: 'organizationNoWallet',
	/** No wallet of the space accepts a token, which a subscription needs. */
	NoTokenWallet: 'noTokenWallet',
	/**
	 * A subscription checkout of a member whose funds the organization holds: one-time payments
	 * only until `members.trust`.
	 */
	FundsHeld: 'fundsHeld',
} as const;
/** A `MerchantNotReadyReason` value (a string): one of {@link MerchantNotReadyReason}'s, or a newer one the SDK keeps as is. */
export type MerchantNotReadyReason = Open<ValuesOf<typeof MerchantNotReadyReason>>;

/** The known values of an enum object, as a list (filter checks). @internal */
export function knownValues<T extends Record<string, string>>(e: T): string[] {
	return Object.values(e);
}
