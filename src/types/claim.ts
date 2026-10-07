/**
 * Account-claim types.
 *
 * An organization provisions users, holds the funds they earn, and later invites them to
 * claim their account (set a password, connect a wallet). Once claimed, the amounts owed
 * are transferred to the user's wallet.
 */

/**
 * Organization record (shared model; not returned by the claim routes themselves)
 */
export interface Organization {
	/** Organization ID */
	id: number;
	/** Organization name */
	name: string;
	/** Default platform fee percentage */
	feePercentage: number;
	/** RFC3339 timestamp when the organization was created */
	createdAt: string;
}

/**
 * Response of `claims.createRequest()` / `claims.getRequestByUser()`.
 */
export interface ClaimRequestResponse {
	/** Human-readable confirmation */
	message: string;
	/** The invite link the user follows to set a password and connect a wallet */
	link: string;
}

/**
 * Funds owed to a user who has claimed their account.
 * Represents the organization's pending obligation to transfer earnings.
 */
export interface ClaimFunds {
	/** ID of the user */
	userId: number;
	/** Total amount owed in USD */
	totalAmountOwed: number;
	/** Whether the transfer has been funded */
	funded: boolean;
	/** Whether this is a test entry */
	test: boolean;
	/** RFC3339 timestamp when the claim funds entry was created */
	createdAt: string;
}
