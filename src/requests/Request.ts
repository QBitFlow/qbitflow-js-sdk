import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
	DEFAULT_BASE_URL,
	DEFAULT_MAX_RETRIES,
	DEFAULT_RETRY_DELAY,
	DEFAULT_TIMEOUT,
} from '../config';
import {
	FieldError,
	ForbiddenException,
	NetworkException,
	NotFoundException,
	RateLimitException,
	ServerException,
	UnauthorizedException,
	ValidationException,
} from '../exceptions';
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
		maxRetries: number = DEFAULT_MAX_RETRIES,
		headers?: Record<string, string>
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
				...headers,
			},
		});
	}

	/**
	 * Act on behalf of a specific user within the same organization, scoping the request
	 * to that user's resources. Requires an organization-level admin/owner API key.
	 *
	 * Passing `0` means "act at the organization level" — the header is omitted entirely
	 * rather than sent as `0`, which the API rejects.
	 *
	 * @param userID - ID of the user to act for, or 0 to act at the organization level
	 * @returns A new Request instance with the `On-Behalf-Of` header set
	 *
	 * @example
	 * ```typescript
	 * // Acting for user with ID 123 - return all products available to that user
	 * const userProducts = await client.products.onBehalfOf(123).getAll();
	 * ```
	 */
	public onBehalfOf(userID: number): this {
		const RequestConstructor = this.constructor as new (
			apiKey: string,
			baseUrl?: string,
			timeout?: number,
			maxRetries?: number,
			headers?: Record<string, string>
		) => this;
		// 0 (or anything not a positive integer) means no impersonation: omit the header.
		const headers: Record<string, string> =
			Number.isInteger(userID) && userID > 0 ? { 'On-Behalf-Of': userID.toString() } : {};
		return new RequestConstructor(
			this.apiKey,
			this.baseUrl,
			this.timeout,
			this.maxRetries,
			headers
		);
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
		params?: any,
		extraConfig?: Partial<AxiosRequestConfig>
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
			...extraConfig,
		};

		let lastError: Error | null = null;

		// Retry logic
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			let response: AxiosResponse<T>;

			try {
				response = await this.axiosInstance.request(config);
			} catch (error) {
				lastError = error as Error;

				if (axios.isAxiosError(error)) {
					const axiosError = error as AxiosError;

					// Handle specific HTTP status codes
					if (axiosError.response) {
						const status = axiosError.response.status;
						const { message: errorMessage, fields } = this.extractError(axiosError);

						// Don't retry on client errors (4xx)
						if (status >= 400 && status < 500) {
							throw this.handleClientError(status, errorMessage, fields);
						}

						// Retry on server errors (5xx)
						if (status >= 500 && attempt < this.maxRetries) {
							await sleep(DEFAULT_RETRY_DELAY * (attempt + 1));
							continue;
						}

						throw new ServerException(errorMessage, fields);
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

			// Reached only when the request itself succeeded; every branch above either
			// retries via `continue` or throws.
			return this.unwrapSuccess<T>(response, config);
		}

		// If we exhausted all retries
		throw new NetworkException(
			`Request failed after ${this.maxRetries} retries: ${lastError?.message}`
		);
	}

	/**
	 * Return the decoded body of a successful response.
	 *
	 * Axios leaves a body it could not parse as JSON as a raw string, so returning
	 * `response.data` unchecked hands the caller a `string` typed as `T` — a proxy's HTML
	 * page or an error page served with a 200 would masquerade as a payment object and
	 * fail much later, somewhere unrelated. Callers that genuinely want a non-JSON body
	 * (the CSV accounting export) opt in through `responseType` and pass through untouched.
	 *
	 * @param response - The successful Axios response
	 * @param config - The request config, used to tell whether JSON was expected
	 * @returns The response body
	 */
	private unwrapSuccess<T>(response: AxiosResponse<T>, config: AxiosRequestConfig): T {
		const expectsJson = config.responseType === undefined || config.responseType === 'json';

		// An empty body (e.g. 204 No Content) is a legitimate "nothing to return".
		if (expectsJson && typeof response.data === 'string' && response.data !== '') {
			throw new ServerException(
				`Expected a JSON response but the body could not be parsed: ${response.data}`
			);
		}

		return response.data;
	}

	/**
	 * Extract the field-level failures from a decoded error body.
	 *
	 * The API reports validation failures as a list, one entry per offending field:
	 * `{"errors":[{"field":"Price","message":"Price is too short"}]}`. Every entry is
	 * kept — surfacing only the first hides the rest of what the caller has to fix.
	 *
	 * @param errors - The raw `errors` member of an error body
	 * @returns One entry per reported field failure; empty if there are none
	 */
	private extractFieldErrors(errors: unknown): FieldError[] {
		if (!Array.isArray(errors)) {
			return [];
		}

		const entries: FieldError[] = [];

		for (const raw of errors) {
			if (typeof raw === 'string' && raw !== '') {
				entries.push({ field: '', message: raw });
				continue;
			}

			if (raw !== null && typeof raw === 'object') {
				const entry = raw as { field?: unknown; message?: unknown };
				const field = typeof entry.field === 'string' ? entry.field : '';
				const message = typeof entry.message === 'string' ? entry.message : '';

				if (field !== '' || message !== '') {
					entries.push({ field, message });
				}
			}
		}

		return entries;
	}

	/**
	 * Extract the message and the field failures from an Axios error response
	 * @param error - Axios error
	 * @returns Human-readable message plus any per-field failures
	 */
	private extractError(error: AxiosError): { message: string; fields: FieldError[] } {
		const data: unknown = error.response?.data;

		if (!data) {
			return { message: 'An error occurred', fields: [] };
		}

		if (typeof data === 'string') {
			return { message: data, fields: [] };
		}

		if (typeof data !== 'object') {
			return { message: String(data), fields: [] };
		}

		const body = data as { error?: unknown; errors?: unknown; message?: unknown };
		const fields = this.extractFieldErrors(body.errors);

		// Single-message envelope, used for everything that is not a validation failure.
		if (typeof body.error === 'string' && body.error !== '') {
			return { message: body.error, fields };
		}

		// Validation envelope: report every field, not just the first.
		if (fields.length > 0) {
			const message = fields
				.map((entry) => (entry.field ? `${entry.field}: ${entry.message}` : entry.message))
				.join('; ');

			return { message, fields };
		}

		// `message` is the *success* envelope's key and does not appear on error responses,
		// but honour it in case a gateway synthesises one.
		if (typeof body.message === 'string' && body.message !== '') {
			return { message: body.message, fields };
		}

		return { message: 'An error occurred', fields };
	}

	/**
	 * Handle client errors (4xx status codes)
	 * @param status - HTTP status code
	 * @param message - Error message
	 * @param fields - Per-field validation failures, when the API reported any
	 * @returns Appropriate error instance
	 */
	private handleClientError(status: number, message: string, fields: FieldError[] = []): Error {
		switch (status) {
			case 400:
				return new ValidationException(message, fields);
			case 401:
				return new UnauthorizedException(message, fields);
			case 403:
				return new ForbiddenException(message, fields);
			case 404:
				return new NotFoundException(message, fields);
			case 429:
				return new RateLimitException(message, fields);
			default:
				return new ValidationException(message, fields);
		}
	}

	/**
	 * Make a GET request
	 * @param endpoint - API endpoint
	 * @param params - Query parameters
	 * @returns Response data
	 */
	protected async getReq<T = any>(
		endpoint: string,
		params?: any,
		extraConfig?: Partial<AxiosRequestConfig>
	): Promise<T> {
		return this.makeRequest<T>(endpoint, 'GET', undefined, params, extraConfig);
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
