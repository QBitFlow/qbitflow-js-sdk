import { Request } from './Request';
import { CreateSessionDto, LinkResponse, Session } from '../types';

/**
 * Session management requests
 */
export class SessionRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/session-checkout';

	/**
	 * Create a new payment session
	 * @param sessionData - Session creation data
	 * @returns Payment link response
	 */
	async create(sessionData: CreateSessionDto): Promise<LinkResponse> {
		return this.postReq<LinkResponse>(`${SessionRequests.BASE_ROUTE}/`, sessionData);
	}

	/**
	 * Get session details by UUID
	 * @param sessionUuid - Session UUID
	 * @returns Session details
	 */
	async get(sessionUuid: string): Promise<Session> {
		return this.getReq<Session>(
			`${SessionRequests.BASE_ROUTE}/${sessionUuid}?closeToExpireError=false`
		);
	}
}
