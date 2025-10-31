import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import {
	NotFoundException,
	UnauthorizedException,
	ForbiddenException,
	ValidationException,
	RateLimitException,
	ServerException,
	NetworkException,
} from '../exceptions';
import {
	DEFAULT_BASE_URL,
	DEFAULT_TIMEOUT,
	DEFAULT_MAX_RETRIES,
	DEFAULT_RETRY_DELAY,
} from '../config';
import { sleep } from '../utils';

/**
 * Base Request class for making HTTP requests to the QBitFlow API
 */
export class Request {
	protected apiKey: string;
	protected baseUrl: string;
	protected timeout: number;
	protected maxRetries: number;
	protected axiosInstance: AxiosInstance;

	/**
	 * Create a new Request instance
	 * @param apiKey - API key for authentication
	 * @param baseUrl - Base URL for the API
	 * @param timeout - Request timeout in milliseconds
	 * @param maxRetries - Maximum number of retry attempts
	 */
	constructor(
		apiKey: string,
		baseUrl: string = DEFAULT_BASE_URL,
		timeout: number = DEFAULT_TIMEOUT,
		maxRetries: number = DEFAULT_MAX_RETRIES
	) {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
		this.timeout = timeout;
		this.maxRetries = maxRetries;

		// Create axios instance with default configuration
		this.axiosInstance = axios.create({
			baseURL: this.baseUrl,
			timeout: this.timeout,
			headers: {
				'X-API-Key': this.apiKey,
				'Content-Type': 'application/json',
			},
		});
	}

	/**
	 * Make an HTTP request with retry logic
	 * @param endpoint - API endpoint (with or without leading slash)
	 * @param method - HTTP method
	 * @param data - Request body data (for POST, PUT)
	 * @param params - URL query parameters (for GET)
	 * @returns Response data
	 */
	protected async makeRequest<T = any>(
		endpoint: string,
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
		data?: any,
		params?: any
	): Promise<T> {
		// Ensure endpoint starts with /
		if (!endpoint.startsWith('/')) {
			endpoint = '/' + endpoint;
		}

		const config: AxiosRequestConfig = {
			method,
			url: endpoint,
			data,
			params,
		};

		let lastError: Error | null = null;

		// Retry logic
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const response: AxiosResponse<T> = await this.axiosInstance.request(config);
				return response.data;
			} catch (error) {
				lastError = error as Error;

				if (axios.isAxiosError(error)) {
					const axiosError = error as AxiosError;

					// Handle specific HTTP status codes
					if (axiosError.response) {
						const status = axiosError.response.status;
						const errorMessage = this.extractErrorMessage(axiosError);

						// Don't retry on client errors (4xx)
						if (status >= 400 && status < 500) {
							throw this.handleClientError(status, errorMessage);
						}

						// Retry on server errors (5xx)
						if (status >= 500 && attempt < this.maxRetries) {
							await sleep(DEFAULT_RETRY_DELAY * (attempt + 1));
							continue;
						}

						throw new ServerException(errorMessage);
					} else if (axiosError.request) {
						// Network error - retry
						if (attempt < this.maxRetries) {
							await sleep(DEFAULT_RETRY_DELAY * (attempt + 1));
							continue;
						}
						throw new NetworkException('Network request failed: No response received');
					}
				}

				// Unknown error - don't retry
				throw lastError;
			}
		}

		// If we exhausted all retries
		throw new NetworkException(
			`Request failed after ${this.maxRetries} retries: ${lastError?.message}`
		);
	}

	/**
	 * Extract error message from Axios error response
	 * @param error - Axios error
	 * @returns Error message string
	 */
	private extractErrorMessage(error: AxiosError): string {
		const response = error.response;
		if (!response?.data) {
			return 'An error occurred';
		}

		const data = response.data as any;

		if (typeof data === 'string') {
			return data;
		}

		// Check for error field
		if (data.error) {
			return data.error;
		}

		// Check for errors array
		if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
			const firstError = data.errors[0];
			if (firstError.message) {
				return firstError.message;
			}
		}

		// Check for message field
		if (data.message) {
			return data.message;
		}

		return 'An error occurred';
	}

	/**
	 * Handle client errors (4xx status codes)
	 * @param status - HTTP status code
	 * @param message - Error message
	 * @returns Appropriate error instance
	 */
	private handleClientError(status: number, message: string): Error {
		switch (status) {
			case 400:
				return new ValidationException(message);
			case 401:
				return new UnauthorizedException(message);
			case 403:
				return new ForbiddenException(message);
			case 404:
				return new NotFoundException(message);
			case 429:
				return new RateLimitException(message);
			default:
				return new ValidationException(message);
		}
	}

	/**
	 * Make a GET request
	 * @param endpoint - API endpoint
	 * @param params - Query parameters
	 * @returns Response data
	 */
	protected async getReq<T = any>(endpoint: string, params?: any): Promise<T> {
		return this.makeRequest<T>(endpoint, 'GET', undefined, params);
	}

	/**
	 * Make a POST request
	 * @param endpoint - API endpoint
	 * @param data - Request body data
	 * @returns Response data
	 */
	protected async postReq<T = any>(endpoint: string, data: any): Promise<T> {
		return this.makeRequest<T>(endpoint, 'POST', data);
	}

	/**
	 * Make a PUT request
	 * @param endpoint - API endpoint
	 * @param data - Request body data
	 * @returns Response data
	 */
	protected async putReq<T = any>(endpoint: string, data: any): Promise<T> {
		return this.makeRequest<T>(endpoint, 'PUT', data);
	}

	/**
	 * Make a DELETE request
	 * @param endpoint - API endpoint
	 * @returns Response data
	 */
	protected async deleteReq<T = any>(endpoint: string): Promise<T> {
		return this.makeRequest<T>(endpoint, 'DELETE');
	}
}
