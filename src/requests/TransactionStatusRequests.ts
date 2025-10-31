import { Request } from './Request';
import { TransactionStatus, TransactionType, StatusResponseError, StatusResponse } from '../types';
import WebSocket from 'ws';
import { WebSocketException, NotFoundException } from '../exceptions';

/**
 * Transaction status requests with WebSocket support
 */
export class TransactionStatusRequests extends Request {
	private static readonly BASE_ROUTE = '/transaction/status';

	/**
	 * Get the current status of a transaction
	 * @param transactionUuid - Transaction UUID
	 * @param transactionType - Type of transaction
	 * @returns Current transaction status
	 *
	 * @example
	 * ```typescript
	 * const status = await client.transactionStatus.get(
	 *   'transaction-uuid',
	 *   TransactionType.ONE_TIME_PAYMENT
	 * );
	 * console.log(status.status, status.txHash);
	 * ```
	 */
	async get(
		transactionUuid: string,
		transactionType: TransactionType
	): Promise<TransactionStatus> {
		const params = {
			transactionUUID: transactionUuid,
			transactionStatusType: transactionType,
		};

		return this.getReq<TransactionStatus>(TransactionStatusRequests.BASE_ROUTE, params);
	}

	/**
	 * Connect to WebSocket for real-time transaction status updates
	 * @param transactionUuid - Transaction UUID
	 * @param transactionType - Type of transaction
	 * @param handler - Callback function to handle status updates
	 * @returns Promise that resolves when connection is established
	 *
	 * @example
	 * ```typescript
	 * await client.transactionStatus.connectAndHandleMessages(
	 *   'transaction-uuid',
	 *   TransactionType.ONE_TIME_PAYMENT,
	 *   (message) => {
	 *     if ('error' in message) {
	 *       console.error('Error:', message.error);
	 *     } else {
	 *       console.log('Status update:', message.status);
	 *     }
	 *   }
	 * );
	 * ```
	 */
	async connectAndHandleMessages(
		transactionUuid: string,
		transactionType: TransactionType,
		handler: (message: StatusResponse | StatusResponseError) => void
	): Promise<void> {
		return new Promise((resolve, reject) => {
			// Build WebSocket URL
			const wsBaseUrl = this.baseUrl
				.replace('http://', 'ws://')
				.replace('https://', 'wss://');
			const endpoint = `${TransactionStatusRequests.BASE_ROUTE}/ws?transactionUUID=${transactionUuid}&transactionStatusType=${transactionType}`;
			const wsUrl = `${wsBaseUrl}${endpoint}`;

			const ws = new WebSocket(wsUrl, {
				headers: {
					'X-API-Key': this.apiKey,
				},
			});

			ws.on('open', () => {
				console.log('WebSocket connection established');
				resolve();
			});

			ws.on('message', (data: WebSocket.Data) => {
				try {
					const message = JSON.parse(data.toString());

					// Check if it's an error response
					if (message.error && message.status !== undefined) {
						const errorResponse: StatusResponseError = {
							error: message.error,
							status: message.status,
							message: message.message || message.error,
						};

						// Handle 404 - transaction not found
						if (message.status === 404) {
							ws.close();
							reject(
								new NotFoundException(
									`Transaction with UUID ${transactionUuid} not found. Perhaps the processing has not started yet.`
								)
							);
							return;
						}

						handler(errorResponse);
					} else if (message.transactionUUID && message.status) {
						const statusResponse: StatusResponse = {
							transactionUUID: message.transactionUUID || message.transaction_uuid,
							status: message.status,
						};
						handler(statusResponse);
					} else {
						console.warn('Received unknown message format:', message);
					}
				} catch (error) {
					console.error('Error parsing WebSocket message:', error);
				}
			});

			ws.on('error', (error) => {
				console.error('WebSocket error:', error);
				reject(new WebSocketException(`WebSocket connection error: ${error.message}`));
			});

			ws.on('close', (code, reason) => {
				console.log(`WebSocket connection closed (code: ${code}, reason: ${reason})`);

				// Attempt to reconnect if it wasn't a clean close
				if (code !== 1000) {
					console.log('Attempting to reconnect...');
					setTimeout(() => {
						this.connectAndHandleMessages(
							transactionUuid,
							transactionType,
							handler
						).catch((err) => {
							console.error('Reconnection failed:', err);
						});
					}, 5000); // Reconnect after 5 seconds
				}
			});
		});
	}
}
