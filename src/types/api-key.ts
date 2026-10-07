import { UserRole } from './user.js';

/**
 * Represents an API Key in the QBitFlow system
 *
 * API Keys are used to authenticate requests to the QBitFlow API. The hashed key material
 * is never returned; the plaintext key is shown once, at creation, in the dashboard.
 *
 * @see {@link https://qbitflow.app/docs API Key Documentation}
 */
export interface ApiKey {
	/** Unique identifier for the API key */
	id: number;
	/** Name of the API key */
	name: string;
	/** Identifier of the organization the API key belongs to */
	organizationId: number;
	/** Identifier of the user the key is bound to; `0` for an organization-level key */
	userId: number;
	/** RFC3339 timestamp for when the API key was created */
	createdAt: string;
	/** RFC3339 timestamp for when the API key expires; `null` when the key never expires */
	expiresAt: string | null;
	/**
	 * Role the key carries (derived from its user; an organization-level key is `admin`).
	 * A role this SDK does not know yet arrives as its raw string.
	 */
	role: UserRole | (string & {});
	/** Indicates if the API key is a test-mode key */
	test: boolean;
}
