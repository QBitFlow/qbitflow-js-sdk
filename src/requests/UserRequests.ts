import { ValidationException } from '../exceptions';
import { SuccessResponse } from '../types';
import { CreateUserDto, UpdateUserDto, User } from '../types/user';
import { Request } from './Request';

/**
 * Handler for user-related API requests
 */
export class UserRequests extends Request {
	private static readonly BASE_ROUTE = '/user';

	/**
	 * Create a new user
	 * @param user The user to create
	 * @returns The created user
	 */
	async create(user: CreateUserDto): Promise<User> {
		return this.postReq<User>(`${ UserRequests.BASE_ROUTE }/`, user);
	}

	/**	
	 * Get all users
	 * @returns List of users
	 */
	async getAll(): Promise<User[]> {
		return this.getReq<User[]>(`${ UserRequests.BASE_ROUTE }/all`);
	}

	/**
	 * Get current authenticated user
	 * @returns The current user
	 */
	async get(): Promise<User> {
		return this.getReq<User>(`${ UserRequests.BASE_ROUTE }/`);
	}

	/**
	 * Get user by ID
	 * @param userId The user ID
	 * @returns The user
	 */
	async getById(userId: string): Promise<User> {
		return this.getReq<User>(`${ UserRequests.BASE_ROUTE }/id/${ userId }`);
	}

	/**
	 * Get user by email
	 * @param email The user email
	 * @returns the user
	 */
	async getByEmail(email: string): Promise<User> {
		if (!email?.includes('@')) {
			throw new ValidationException('Valid email is required');
		}
		return this.getReq<User>(`${ UserRequests.BASE_ROUTE }/email/${ encodeURIComponent(email) }`);
	}

	/**	Update user by ID
	 * @param userId The user ID
	 * @param userData The data to update
	 * @returns The updated user
	 */
	async update(userId: number, userData: UpdateUserDto): Promise<User> {
		return this.putReq<User>(`${ UserRequests.BASE_ROUTE }/${ userId }`, userData);
	}

	/**
	 * Delete user by ID
	 * @param userId The user ID
	 */
	async delete(userId: number): Promise<SuccessResponse> {
		return this.deleteReq<SuccessResponse>(`${ UserRequests.BASE_ROUTE }/${ userId }`);
	}
}
