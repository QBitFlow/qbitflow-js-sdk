/**
 * Pay-as-you-go subscription requests — TEMPORARILY DISABLED
 *
 * This feature will be re-enabled in a future release once the new PAYG infrastructure
 * has been deployed. The implementation is preserved here for reference.
 */

import { ValidationException } from '../exceptions';
import {
	Duration,
	LinkResponse,
	PaygSubscriptionSession,
	StatusLinkResponse,
	Subscription,
	SubscriptionHistory,
	SuccessResponse,
} from '../types';
import { validateCreateSession } from '../utils';
import { Request } from './Request';
import { SessionRequests } from './SessionRequests';

// Stub for the PAYG-specific subscription type (extends the base Subscription)
interface PayAsYouGoSubscription extends Subscription {
	unitsCurrentPeriod: number;
	maxSpendingPerPeriod: number;
	freeCredits: number;
}

/**
 * Pay-as-you-go subscription requests (currently disabled)
 */
export class PayAsYouGoRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/subscription';
	private readonly sessionRequests: SessionRequests;

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number, headers?: Record<string, string>) {
		super(apiKey, baseUrl, timeout, maxRetries, headers);
		this.sessionRequests = new SessionRequests(apiKey, baseUrl, timeout, maxRetries, headers);
	}

	/**
	 * Create a new pay-as-you-go subscription session
	 * @param options - PAYG subscription session options
	 * @returns Payment link response with UUID and link
	 */
	async createSession(options: {
		productId: number;
		frequency: Duration;
		freeCredits?: number;
		successUrl?: string;
		cancelUrl?: string;
		customerUUID?: string;
	}): Promise<LinkResponse> {
		// PAYG session creation endpoint is not yet available.
		// This will be wired to /transaction/session-checkout/new/payg once re-enabled.
		throw new ValidationException('Pay-as-you-go subscriptions are temporarily unavailable');
		validateCreateSession(options); // unreachable; kept to satisfy the linter
		return Promise.reject(); // unreachable
	}

	/**
	 * Get PAYG session details by UUID
	 * @param sessionUUID - Session UUID
	 * @returns Session details
	 */
	async getSession(sessionUUID: string): Promise<PaygSubscriptionSession> {
		return this.sessionRequests.get<PaygSubscriptionSession>(sessionUUID);
	}

	/**
	 * Get a pay-as-you-go subscription by UUID
	 * @param paygUUID - PAYG subscription UUID
	 * @returns PAYG subscription details
	 */
	async get(paygUUID: string): Promise<PayAsYouGoSubscription> {
		return this.getReq<PayAsYouGoSubscription>(
			`${ PayAsYouGoRequests.BASE_ROUTE }/${ paygUUID }`
		);
	}

	/**
	 * Get a pay-as-you-go subscription by the reference you assigned when creating it.
	 *
	 * @param reference - Your own subscription reference
	 * @returns PAYG subscription details
	 */
	async getByReference(reference: string): Promise<PayAsYouGoSubscription> {
		if (!reference) {
			throw new ValidationException('Subscription reference is required');
		}
		return this.getReq<PayAsYouGoSubscription>(
			`${ PayAsYouGoRequests.BASE_ROUTE }/reference/payAsYouGo/${ encodeURIComponent(reference) }`
		);
	}

	/**
	 * Get subscription payment history
	 * @param subscriptionUUID - Subscription UUID
	 * @returns List of subscription payment history records
	 */
	async getPaymentHistory(subscriptionUUID: string): Promise<SubscriptionHistory[]> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		return this.getReq<SubscriptionHistory[]>(
			`${ PayAsYouGoRequests.BASE_ROUTE }/history/${ subscriptionUUID }`
		);
	}

	/**
	 * Force cancel a PAYG subscription
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Success response
	 */
	async forceCancel(subscriptionUUID: string): Promise<SuccessResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		return this.getReq<SuccessResponse>(
			`${ PayAsYouGoRequests.BASE_ROUTE }/processing/force-cancel/${ subscriptionUUID }`
		);
	}

	/**
	 * Execute a test billing cycle (test mode only)
	 * @param subscriptionUUID - Subscription UUID
	 * @returns Status link response
	 */
	async executeTestBilling(subscriptionUUID: string): Promise<StatusLinkResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		return this.getReq<StatusLinkResponse>(
			`${ PayAsYouGoRequests.BASE_ROUTE }/processing/execute-billing/${ subscriptionUUID }`
		);
	}

	/**
	 * Increase the units for the current billing period
	 * @param subscriptionUUID - Subscription UUID
	 * @param unitsToAdd - Number of units to add
	 * @returns Success response
	 */
	async increaseUnitsCurrentPeriod(
		subscriptionUUID: string,
		unitsToAdd: number
	): Promise<SuccessResponse> {
		if (!subscriptionUUID) {
			throw new ValidationException('Subscription UUID is required');
		}
		if (unitsToAdd <= 0) {
			throw new ValidationException('Units to add must be greater than zero');
		}
		return this.postReq<SuccessResponse>(
			`${ PayAsYouGoRequests.BASE_ROUTE }/payg/increase-units-current-period`,
			{ subscriptionUUID, increaseByAmount: unitsToAdd }
		);
	}
}
