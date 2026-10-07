/**
 * Refund types
 */

import { TxMetadata } from './common.js';

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
 * A refund entry attached to a transaction.
 */
export interface RefundEntry {
	/** Unique identifier for the refund, `refund@`-prefixed */
	uuid: string;
	/** Transaction ID the refund is for, e.g. "pay@<uuid>" */
	txId: string;
	/** Whether this is a test refund */
	test: boolean;
	/** Reason provided for the refund */
	reason: string;
	/**
	 * Current status of the refund. A value this SDK does not know yet arrives as its raw
	 * string.
	 */
	status: RefundStatus | (string & {});
	/** RFC3339 timestamp when the refund was created */
	createdAt: string;
	/** Message from the merchant (`''` until the merchant answers) */
	merchantMessage: string;
	/** RFC3339 timestamp when the merchant responded; `null` while pending */
	respondedAt: string | null;
	/** On-chain transaction hash of the refund (`''` until processed) */
	txHash: string;
	/** Refund amount in the smallest units of the currency, as a decimal string */
	amountMinUnits: string;
	/** ID of the organization that owns this refund */
	organizationId: number;
	/** ID of the user that owns this refund; `0` for organization-level */
	userId: number;
	/** On-chain metadata attached to the refund; `null` until processed */
	metadata: TxMetadata | null;
}
