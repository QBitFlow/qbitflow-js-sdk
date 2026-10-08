/**
 * QBitFlow JavaScript/TypeScript SDK 3.0.0, for QBitFlow API v2.
 *
 * ```ts
 * import { QBitFlow, webhooks, NotFoundError } from 'qbitflow';
 * ```
 *
 * @packageDocumentation
 */

export {
	QBitFlow,
	type ClientConfig,
	type ClientOptions,
	DEFAULT_BASE_URL,
	DEFAULT_MAX_RETRIES,
	DEFAULT_TIMEOUT,
} from './client.js';
export type { FetchInit, FetchLike, FetchResponse, RequestOptions } from './transport.js';

export {
	ApiError,
	AuthenticationError,
	BadRequestError,
	ConflictError,
	type FieldError,
	GoneError,
	IdempotencyError,
	isRetryable,
	NetworkError,
	NotFoundError,
	PermissionDeniedError,
	QBitFlowError,
	RateLimitError,
	ServerError,
	ValidationError,
	WebhookSignatureError,
	WebhookSignatureReason,
} from './errors.js';

export * from './enums.js';

export type * from './models/common.js';
export type * from './models/payments.js';
export type * from './models/checkout.js';
export type * from './models/subscriptions.js';
export type * from './models/refunds.js';
export type * from './models/customers.js';
export type * from './models/products.js';
export type * from './models/members.js';
export type * from './models/wallets.js';
export type * from './models/accounting.js';
export type * from './models/events.js';
export type * from './models/webhooks.js';

export * as webhooks from './webhooksNamespace.js';
export type { RawBody, SignatureHeader, VerifyOptions } from './webhooks.js';
export type {
	WebhookEventHandler,
	WebhookHandler,
	WebhookResult,
	WebhookRouter,
	WebhookRouterOptions,
} from './webhookRouter.js';

export { formatAmount, hasAccess, parseAmount, Placeholders } from './helpers.js';

export type { ProductsService } from './services/products.js';
export type { CustomersService } from './services/customers.js';
export type { CheckoutSessionsService, WaitOptions } from './services/checkout.js';
export type { FailuresService, PaymentsService } from './services/payments.js';
export type { SubscriptionsService } from './services/subscriptions.js';
export type { RefundsService } from './services/refunds.js';
export type { InvitationsService, MembersService } from './services/members.js';
export type { AccountingService, CurrenciesService, WalletsService } from './services/misc.js';
export type {
	WebhookEndpointsService,
	WebhookEventsService,
	WebhooksService,
} from './services/webhooks.js';

export { VERSION } from './version.js';
