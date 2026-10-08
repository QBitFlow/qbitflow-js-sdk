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
	/** RFC3339 timestamp for when the API key was created */
	createdAt: string;
	/** RFC3339 timestamp for when the API key expires; null/omitted when the key never expires */
	expiresAt?: string | null;
	role: UserRole;
	test: boolean;
}
