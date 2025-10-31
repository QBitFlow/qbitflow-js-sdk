import { SuccessResponse } from '../types';
import { ApiKey, CreateApiKeyDto, CreatedApiKeyResponse } from '../types/api-key';
import { Request } from './Request';

/**
 * Handler for API key-related requests
 */
export class ApiKeyRequests extends Request {
	private static readonly BASE_ROUTE = '/api-key';

	constructor(apiKey: string, baseUrl?: string, timeout?: number, maxRetries?: number) {
		super(apiKey, baseUrl, timeout, maxRetries);
	}

	/**
	 * Create a new API key for a specified user
	 * @param apiKeyData - The new API key data
	 * @returns Created API key
	 */
	async create(apiKeyData: CreateApiKeyDto): Promise<CreatedApiKeyResponse> {
		return this.postReq<CreatedApiKeyResponse>(`${ApiKeyRequests.BASE_ROUTE}/`, apiKeyData);
	}

	/**
	 * Get all API keys for the current user
	 * @returns List of API keys
	 */
	async getAll(): Promise<ApiKey[]> {
		return this.getReq<ApiKey[]>(`${ApiKeyRequests.BASE_ROUTE}/`);
	}

	/**
	 * Get all API keys for a specified user (must be an admin)
	 * @param userId - The user ID
	 * @returns List of API keys
	 */
	async getForUser(userId: number): Promise<ApiKey[]> {
		return this.getReq<ApiKey[]>(`${ApiKeyRequests.BASE_ROUTE}/user/${userId}`);
	}

	/**
	 * Delete an API key by its ID
	 * @param apiKeyId - The API key ID
	 */
	async delete(apiKeyId: number): Promise<SuccessResponse> {
		return this.deleteReq<SuccessResponse>(`${ApiKeyRequests.BASE_ROUTE}/${apiKeyId}`);
	}
}
