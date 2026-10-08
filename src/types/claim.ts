
/**
 * Organization information (returned alongside a claim request)
 */
export interface Organization {
	/** Organization ID */
	id: number;
	/** Organization name */
	name: string;
	/** Default platform fee percentage */
	feePercentage: number;
	/** Timestamp when the organization was created */
	createdAt: string;
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
	/** Timestamp when the claim funds entry was created */
	createdAt: string;
}
