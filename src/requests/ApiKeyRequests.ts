import { list } from '../decode.js';
import { ApiKeySchema } from '../schemas.js';
import { ApiKey } from '../types/api-key.js';
import { requirePositiveInt } from '../utils/index.js';
import { Request } from './Request.js';

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
	 * Get the caller's API keys. A `user` sees only their own keys; an admin/owner (or an
	 * organization-level key) sees every key in the organization.
	 * @returns List of API keys
	 */
	async getAll(): Promise<ApiKey[]> {
		return this.getJson(list(ApiKeySchema), `${ApiKeyRequests.BASE_ROUTE}/`);
	}

	/**
	 * Get all API keys for a specified user (admin role required)
	 * @param userId - The user ID
	 * @returns List of API keys
	 * @throws {ValidationException} When `userId` is not a positive integer
	 */
	async getForUser(userId: number): Promise<ApiKey[]> {
		requirePositiveInt('userId', userId);
		return this.getJson(list(ApiKeySchema), `${ApiKeyRequests.BASE_ROUTE}/user/${userId}`);
	}
}
