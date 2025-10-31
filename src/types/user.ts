export enum UserRole {
	ADMIN = 'admin',
	USER = 'user',
}

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
 * @param updateAt - Date when the user was last updated
 * @param organizationId - Identifier of the organization the user belongs to
 * @param role - Role of the user within the organization
 * @param organizationFeeBps - Organization fee in basis points for this user (if applicable). 1 BPS = 0.01%
 */
export interface User {
	id: number;
	name: string;
	lastName: string;
	email: string;
	createdAt: Date;
	updateAt: Date;
	organizationId: number;
	role: UserRole;
	organizationFeeBps: number;
}

/**
 * Data Transfer Object for creating a new user
 *
 * @param name - First name of the user
 * @param lastName - Last name of the user
 * @param email - Email address of the user
 * @param password - Password for the user account
 * @param role - Role of the user within the organization
 * @param organizationFeeBps - Organization fee in basis points for this user (if applicable). 1 BPS = 0.01%
 */
export interface CreateUserDto {
	name: string;
	lastName: string;
	email: string;
	password: string;
	role: UserRole;
	organizationFeeBps: number;
}

/**
 * Data Transfer Object for updating an existing user
 *
 * @param name - First name of the user
 * @param lastName - Last name of the user
 * @param email - Email address of the user
 * @param password - (Optional) New password for the user account
 * @param organizationFeeBps - Organization fee in basis points for this user (if applicable). 1 BPS = 0.01%
 */
export interface UpdateUserDto {
	name: string;
	lastName: string;
	email: string;
	password?: string;
	organizationFeeBps: number;
}
