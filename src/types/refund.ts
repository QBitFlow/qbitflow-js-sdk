/**
 * Refund types
 */

/**
 * Possible states of a refund
 */
export enum RefundStatus {
	PENDING = 'pending',
	APPROVED = 'approved',
	REFUSED = 'refused',
	FAILED = 'failed',
}

/**
 * A refund entry attached to a transaction
 */
export interface RefundEntry {
	/** Unique identifier for the refund */
	uuid: string;
	/** Internal transaction ID, e.g. "pay@<uuid>" */
	txId: string;
	/** Whether this is a test refund */
	test: boolean;
	/** Reason provided for the refund */
	reason: string;
	/** Current status of the refund */
	status: RefundStatus;
	/** Timestamp when the refund was created */
	createdAt: string;
	/** Optional message from the merchant */
	merchantMessage?: string;
	/** Timestamp when the refund was processed (null if still pending) */
	respondedAt?: string;
	/** ID of the organization that owns this refund */
	organizationId: number;
	/** On-chain transaction hash of the refund (null until processed) */
	txHash?: string;
	/** Refund amount in the smallest units of the currency */
	amountMinUnits: string;
	/** Optional arbitrary metadata */
	metadata?: Record<string, unknown>;
}
