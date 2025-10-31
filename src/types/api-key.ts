import { UserRole } from './user';

/**
 * Represents an API Key in the QBitFlow system
 *
 * API Keys are used to authenticate requests to the QBitFlow API.
 *
 * @see {@link https://qbitflow.app/docs API Key Documentation}
 *
 * @param id - Unique identifier for the API key
 * @param name - Name of the API key
 * @param organizationId - Identifier of the organization the API key belongs to
 * @param userID - Identifier of the user who created the API key
 * @param createdAt - Date when the API key was created
 * @param expiresAt - (Optional) Date when the API key expires
 * @param role - Role associated with the API key
 * @param test - Indicates if the API key is a test key
 */
export interface ApiKey {
	id: number; // Unique identifier for the API key
	name: string;
	organizationId: number;
	userId: number;
	createdAt: Date;
	expiresAt?: Date;
	role: UserRole;
	test: boolean;
}

/**
 * Data Transfer Object for creating a new API key
 *
 * @param name - Name of the API key
 * @param userID - Identifier of the user who is creating the API key
 * @param expiresAt - (Optional) Date when the API key should expire
 * @param test - Indicates if the API key is a test key
 */
export interface CreateApiKeyDto {
	name: string;
	userId: number;
	expiresAt?: Date;
	test: boolean;
}

/**
 * Response returned when an API key is created.
 * This contains the actual API key value which is only shown once during creation.
 *
 * @param data - The created API key details
 * @param key - The actual API key string
 */
export interface CreatedApiKeyResponse {
	data: ApiKey;
	key: string;
}
