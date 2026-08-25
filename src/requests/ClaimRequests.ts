import { ValidationException } from '../exceptions';
import { SuccessResponse } from '../types';
import { ClaimFunds } from '../types/claim';
import { Request } from './Request';

/**
 * Claim requests — manage fund transfers to users who have claimed their accounts
 */
export class ClaimRequests extends Request {
	private static readonly BASE_ROUTE = '/user/claim';

	/**
	 * Get an existing claim request for a user by their ID.
	 * Returns the claim link if one has already been created for that user.
	 * Admin role required.
	 *
	 * @param userId - ID of the user to look up
	 * @returns Confirmation message and the existing claim link
	 *
	 * @example
	 * ```typescript
	 * const { link } = await client.claims.getRequestByUser(42);
	 * ```
	 */
	async getRequestByUser(userId: number): Promise<{ message: string; link: string }> {
		if (!userId) {
			throw new ValidationException('userId is required');
		}
		return this.getReq(`${ ClaimRequests.BASE_ROUTE }/request/${ userId }`);
	}

	/**
	 * Create a claim request for a user within your organization.
	 * Returns a one-time link the user can follow to set up their password and wallet.
	 * Admin role required.
	 *
	 * @param userId - ID of the user to create the claim request for
	 * @returns Confirmation message and the claim link to share with the user
	 *
	 * @example
	 * ```typescript
	 * const { link } = await client.claims.createRequest(42);
	 * // Send `link` to the user via email
	 * ```
	 */
	async createRequest(userId: number): Promise<{ message: string; link: string }> {
		if (!userId) {
			throw new ValidationException('userId is required');
		}
		return this.postReq(`${ ClaimRequests.BASE_ROUTE }/request`, { userId });
	}

	/**
	 * Get all active claim funds for your organization.
	 * These are balances your organization owes to users who have recently claimed their accounts.
	 *
	 * @returns List of pending claim fund obligations
	 *
	 * @example
	 * ```typescript
	 * const funds = await client.claims.getFunds();
	 * funds.forEach(f => console.log(f.userId, f.totalAmountOwed));
	 * ```
	 */
	async getFunds(): Promise<ClaimFunds[]> {
		return this.getReq<ClaimFunds[]>(`${ ClaimRequests.BASE_ROUTE }/funds`);
	}

	/**
	 * Trigger a test claim fund entry for a user (test mode only).
	 * Computes the total owed from ledger entries and creates a ClaimFunds entry,
	 * letting you test the claim process without waiting for the hourly background job.
	 * Admin role required.
	 *
	 * @param userId - ID of the user to trigger the claim fund computation for
	 * @returns Success response
	 *
	 * @example
	 * ```typescript
	 * const result = await client.claims.triggerTestClaimFunds(42);
	 * console.log(result.message);
	 * ```
	 */
	async triggerTestClaimFunds(userId: number): Promise<SuccessResponse> {
		if (!userId) {
			throw new ValidationException('userId is required');
		}
		return this.getReq<SuccessResponse>(`${ ClaimRequests.BASE_ROUTE }/funds/test-trigger`, { userID: userId });
	}
}
