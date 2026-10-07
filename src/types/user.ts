/**
 * A user's role.
 *
 * The hierarchy is `HANDLE < USER < ADMIN < OWNER`. `HANDLE` and `OWNER` are read-only —
 * the API accepts only `admin` or `user` when creating a user, so use
 * {@link AssignableUserRole} there.
 */
export enum UserRole {
	/** Lowest authenticated tier — a special case of a user, backing the second frontend app */
	HANDLE = 'handle',
	USER = 'user',
	ADMIN = 'admin',
	/** Organization owner */
	OWNER = 'owner',
}

/**
 * The roles that can be assigned when creating a user.
 *
 * The API binds this field `oneof=admin user`, so `HANDLE` and `OWNER` are rejected with a
 * `400`. Narrowing the type turns that into a compile error instead.
 */
export type AssignableUserRole = UserRole.ADMIN | UserRole.USER;

/**
 * Represents a user in the QBitFlow system
 *
 * Users are members of your organization who can access the QBitFlow platform and receive payments on their behalf (using their own wallets).
 * @see {@link https://qbitflow.app/docs User API Documentation}
 *
 * @param id - Unique identifier for the user
 * @param name - First name of the user
 * @param lastName - Last name of the user
 * @param email - Email address of the user
 * @param createdAt - Date when the user was created
 * @param updatedAt - Date when the user was last updated
 * @param organizationId - Identifier of the organization the user belongs to
 * @param role - Role of the user within the organization
 * @param organizationFeeBps - Organization fee in basis points for this user (if applicable). 1 BPS = 0.01%
 * @param claimedAt - RFC3339 timestamp when the invited user claimed their account, `null` until then
 */
export interface User {
	id: number;
	name: string;
	lastName: string;
	email: string;
	/** RFC3339 timestamp, e.g. `"2026-09-21T22:02:09.986381+02:00"` */
	createdAt: string;
	/** RFC3339 timestamp */
	updatedAt: string;
	organizationId: number;
	/** Role within the organization. A role this SDK does not know yet arrives as its raw string. */
	role: UserRole | (string & {});
	organizationFeeBps: number;
	/** RFC3339 timestamp, set once the invited user has claimed their account; `null` until then */
	claimedAt: string | null;
}

/**
 * Data Transfer Object for creating a new user
 *
 * @param name - First name of the user
 * @param lastName - Last name of the user
 * @param email - Email address of the user
 * @param role - Role of the user within the organization
 * @param organizationFeeBps - Organization fee in basis points for this user (if applicable). 1 BPS = 0.01%
 */
export interface CreateUserDto {
	name: string;
	lastName: string;
	email: string;
	/** Only `ADMIN` / `USER` (or the strings `'admin'` / `'user'`) — the API rejects `HANDLE` and `OWNER` on create */
	role: AssignableUserRole | `${AssignableUserRole}`;
	/** Optional. Organization fee in basis points, an integer 0-5000 (100 bps = 1%). Defaults to 0. */
	organizationFeeBps?: number;
}

/**
 * Data Transfer Object for updating an existing user.
 *
 * Updates are **partial**: every field is optional and any field you omit keeps its
 * stored value. An empty string for `name` / `lastName` / `email` counts as "not provided"
 * and is left out of the request. An empty object is a valid no-op.
 *
 * `password` is deliberately absent. Changing a password is a JWT-only, self-service
 * operation on the API — it cannot be done with an API key, which is the only credential
 * this SDK uses. A password sent with an API key is silently ignored by the API (the
 * request still returns 200), so exposing it here would be misleading. Change passwords
 * from the QBitFlow dashboard instead.
 *
 * @param name - (Optional) First name of the user, 2-100 characters
 * @param lastName - (Optional) Last name of the user, 2-100 characters
 * @param email - (Optional) Email address of the user, unique within the organization
 * @param organizationFeeBps - (Optional) Organization fee in basis points, 0-5000 (100 bps = 1%).
 *   Requires admin authority: an admin/owner key, or an organization-level key acting via
 *   `onBehalfOf`. A non-admin caller that sends this field is rejected with 403.
 */
export interface UpdateUserDto {
	name?: string;
	lastName?: string;
	email?: string;
	organizationFeeBps?: number;
}
