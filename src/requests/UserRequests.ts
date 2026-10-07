import { list } from '../decode.js';
import { SuccessResponseSchema, UserSchema } from '../schemas.js';
import { SuccessResponse } from '../types/index.js';
import { CreateUserDto, UpdateUserDto, User } from '../types/user.js';
import {
	prepareCreateUserBody,
	prepareUpdateUserBody,
	requirePositiveInt,
	validateEmail,
} from '../utils/index.js';
import { Request } from './Request.js';

/**
 * Handler for user-related API requests
 */
export class UserRequests extends Request {
	private static readonly BASE_ROUTE = '/user';

	/**
	 * Create a new user (admin role required). The user is created unclaimed; see `claims`.
	 * @param user The user to create
	 * @returns The created user
	 * @throws {ValidationException} When `name`/`lastName` are not 2–100 alphanumspace
	 *   characters, `email` is invalid, `role` is not `admin`/`user`, or
	 *   `organizationFeeBps` is not an integer in 0–5000
	 */
	async create(user: CreateUserDto): Promise<User> {
		const body = prepareCreateUserBody(user);
		return this.postJson(UserSchema, `${UserRequests.BASE_ROUTE}/`, body);
	}

	/**
	 * Get all users of the organization (admin role required)
	 * @returns List of users
	 */
	async getAll(): Promise<User[]> {
		return this.getJson(list(UserSchema), `${UserRequests.BASE_ROUTE}/all`);
	}

	/**
	 * Get the current authenticated user (the key's user, or the acted-for user with
	 * `onBehalfOf`)
	 * @returns The current user
	 */
	async get(): Promise<User> {
		return this.getJson(UserSchema, `${UserRequests.BASE_ROUTE}/`);
	}

	/**
	 * Get user by ID (admin role required)
	 * @param userId The user ID
	 * @returns The user
	 * @throws {ValidationException} When `userId` is not a positive integer
	 */
	async getById(userId: number): Promise<User> {
		requirePositiveInt('userId', userId);
		return this.getJson(UserSchema, `${UserRequests.BASE_ROUTE}/id/${userId}`);
	}

	/**
	 * Get user by email (admin role required)
	 * @param email The user email
	 * @returns the user
	 * @throws {ValidationException} When `email` is not a valid e-mail address
	 */
	async getByEmail(email: string): Promise<User> {
		validateEmail('email', email);
		return this.getJson(
			UserSchema,
			`${UserRequests.BASE_ROUTE}/email/${encodeURIComponent(email)}`
		);
	}

	/**
	 * Update user by ID. Updates are partial: omitted fields keep their stored value, and an
	 * empty `name` / `lastName` / `email` counts as "not provided".
	 * @param userId The user ID
	 * @param userData The data to update
	 * @returns The updated user
	 * @throws {ValidationException} When `userId` is not a positive integer or a provided
	 *   field breaks the API's rules
	 */
	async update(userId: number, userData: UpdateUserDto): Promise<User> {
		requirePositiveInt('userId', userId);
		const body = prepareUpdateUserBody(userData);
		return this.putJson(UserSchema, `${UserRequests.BASE_ROUTE}/${userId}`, body);
	}

	/**
	 * Delete (soft-delete) user by ID (admin role required)
	 * @param userId The user ID
	 * @throws {ValidationException} When `userId` is not a positive integer
	 */
	async delete(userId: number): Promise<SuccessResponse> {
		requirePositiveInt('userId', userId);
		return this.deleteJson(SuccessResponseSchema, `${UserRequests.BASE_ROUTE}/${userId}`);
	}
}
