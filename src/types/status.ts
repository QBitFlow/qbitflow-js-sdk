/**
 * Transaction status types and enums
 */

import { PaymentMetadata } from './common';

/**
 * Types of transactions supported by the API
 */
export enum TransactionType {
	/** One-time payment transaction (native currency) */
	ONE_TIME_PAYMENT = 'payment',
	/** Transfer transaction (native currency) */
	TRANSFER = 'transfer',
	/** Transfer transaction (token) */
	TOKEN_TRANSFER = 'tokenTransfer',
	/** Create subscription transaction */
	CREATE_SUBSCRIPTION = 'createSubscription',
	/** Cancel subscription transaction */
	CANCEL_SUBSCRIPTION = 'cancelSubscription',
	/** Execute subscription payment transaction */
	EXECUTE_SUBSCRIPTION_PAYMENT = 'executeSubscription',
	/** Create pay-as-you-go subscription transaction */
	CREATE_PAYG_SUBSCRIPTION = 'createPAYGSubscription',
	/** Cancel pay-as-you-go subscription transaction */
	CANCEL_PAYG_SUBSCRIPTION = 'cancelPAYGSubscription',
	/** Increase allowance transaction */
	INCREASE_ALLOWANCE = 'increaseAllowance',
	/** Update max amount transaction */
	UPDATE_MAX_AMOUNT = 'updateMaxAmount',
	/** Refund transaction */
	REFUND = 'refund',
	/** Faucet transaction (test networks) */
	FAUCET = 'faucet',
	/** Claim-funds transaction */
	CLAIM_FUNDS = 'claimFunds',
}

/**
 * Short transaction category encoded in a UUID prefix
 * (e.g. "payment" -> pay@, "subscription" -> sub@) and reported on session data.
 */
export enum TransactionShortType {
	/** One-time payment */
	PAYMENT = 'payment',
	/** Subscription */
	SUBSCRIPTION = 'subscription',
	/** Pay-as-you-go subscription */
	PAY_AS_YOU_GO = 'payAsYouGo',
	/** Subscription billing history record */
	SUBSCRIPTION_HISTORY = 'subscriptionHistory',
	/** Refund */
	REFUND = 'refund',
	/** Transfer */
	TRANSFER = 'transfer',
}

/**
 * Status values for a transaction type
 */
export enum TransactionStatusValue {
	/** Transaction has been created but not yet processed */
	CREATED = 'created',
	/** Waiting for blockchain confirmation */
	WAITING_CONFIRMATION = 'waitingConfirmation',
	/** Transaction is pending processing */
	PENDING = 'pending',
	/** Transaction has been successfully completed */
	COMPLETED = 'completed',
	/** Transaction has failed */
	FAILED = 'failed',
	/** Transaction has been cancelled */
	CANCELLED = 'cancelled',
	/** Transaction has expired */
	EXPIRED = 'expired',
}

/**
 * Detailed status information for a transaction. Provides detailed information about the current state of a transaction.
 */
export interface TransactionStatus {
	/** Current status of the transaction */
	status: TransactionStatusValue;
	/** Transaction hash on the blockchain */
	txHash: string;
	/** Additional status message */
	message?: string;
	/**
	 * Finalized payment metadata for a completed, successful transaction
	 * (omitted until the transaction is settled).
	 */
	settlementDetails?: PaymentMetadata;
}

/**
 * WebSocket status response for real-time updates
 */
export interface StatusResponse {
	/** UUID of the transaction */
	transactionUUID: string;
	/** Current status of the transaction */
	status: TransactionStatus;
}

/**
 * Error response from WebSocket status connection
 */
export interface StatusResponseError {
	/** Error message */
	error: string;
	/** HTTP status code */
	status: number;
	/** Additional error message */
	message: string;
}
