import { ApiKey } from '../types/api-key';
import { Request } from './Request';

/**
 * Handler for API key-related requests.
 *
 * NOTE: creating and deleting API keys is a JWT-only operation on the API — it cannot be
 * performed with an API key, which is the only credential this SDK uses. Manage keys from
 * the QBitFlow dashboard instead. Only read access (`getAll`, `getForUser`) is exposed here.
 */
export class ApiKeyRequests extends Request {
	private static readonly BASE_ROUTE = '/api-key';

	/**
	 * Get all API keys for the current user
	 * @returns List of API keys
	 */
	async getAll(): Promise<ApiKey[]> {
		return this.getReq<ApiKey[]>(`${ ApiKeyRequests.BASE_ROUTE }/`);
	}

	/**
	 * Get all API keys for a specified user (must be an admin)
	 * @param userId - The user ID
	 * @returns List of API keys
	 */
	async getForUser(userId: number): Promise<ApiKey[]> {
		return this.getReq<ApiKey[]>(`${ ApiKeyRequests.BASE_ROUTE }/user/${ userId }`);
	}
}
