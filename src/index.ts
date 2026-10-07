/**
 * QBitFlow JavaScript/TypeScript SDK
 * Official SDK for the QBitFlow - Next Generation Crypto Payment Processing
 *
 * @packageDocumentation
 */

// Export main client
export { QBitFlow } from './QBitFlow.js';

// Export all types
export * from './types/index.js';

// Export exceptions
export * from './exceptions/index.js';

// Local webhook signature verification (no API round-trip required)
export * from './webhooks/verify.js';

// Typed decoding of webhook bodies
export { parseSessionWebhook, parseSubscriptionWebhook } from './webhooks/parse.js';

// Service types (reachable as `client.customers`, `client.products` …)
export type {
	AccountingRequests,
	ApiKeyRequests,
	ClaimRequests,
	CurrencyRequests,
	CustomerRequests,
	PaymentRequests,
	ProductRequests,
	RefundRequests,
	SubscriptionRequests,
	TransactionStatusRequests,
	UserRequests,
	WebhookRequests,
} from './requests/index.js';

// Export version
export { VERSION } from './version.js';
