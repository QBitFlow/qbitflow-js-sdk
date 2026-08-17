# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-08-17

### Added

- **Reference-based lookups** — resolve resources by the reference you assigned instead of storing QBitFlow's internal UUIDs:
  - `oneTimePayments.getByReference(reference)` — `GET /transaction/payment/reference/:paymentReference`
  - `subscriptions.getByReference(reference)` — `GET /transaction/subscription/reference/subscription/:subscriptionReference`
  - `customers.getByReference(reference)` — `GET /customer/reference/:reference`
- **Your own references on session creation** — `CreatePaymentSessionDto` and `CreateSubscriptionSessionDto` now accept:
  - `reference` — your own transaction reference (e.g. order/invoice ID), echoed back on the resulting object and in webhooks
  - `productReference` — select a product by your own reference (alternative to `productId`)
  - `customerReference` — select an existing customer by your own reference (alternative to `customerUUID`); a new customer is created during checkout if none matches

### Changed

- **`Payment.reference`** — added; the reference you set when creating the session
- **`Subscription.reference`** — added; the reference you set when creating the session
- **`OneTimePaymentSession`** (and its subtypes) — added `reference`, `productReference`, and `customerReference`, so session responses and transaction webhook payloads expose the references you provided
- **`SubscriptionStatusTransitionWebhook.subscriptionReference`** — added; the subscription's reference is now included on status-transition webhooks

## [1.2.1] - 2026-07-18

- removed `webhookUrl` from `CreatePaymentSessionDto` and `CreateSubscriptionSessionDto`. Webhook URLs are now set at the settings level in the QBitFlow dashboard, and cannot be overridden per session. This change simplifies session creation and ensures consistent webhook handling across all transactions.
- Added webhooks for subscription status transitions. The new webhook payload includes `subscriptionUUID`, `previousStatus`, `currentStatus`, and `updatedAt` fields, allowing clients to track subscription lifecycle events more effectively.
- Also added a test webhook ID for webhook endpoint reachability checks from the frontend "Test webhook" action. This test sends a fake payload to the configured URL, which some SDKs may not parse like a real webhook. If the incoming webhook ID matches `TEST_WEBHOOK_ID`, handlers should return HTTP `200` immediately and skip normal payload processing.

## [1.2.0] - 2026-05-03

### Added

- **Refunds module** (`client.refunds`) — query active and inactive refund entries, and look up the refund for any transaction UUID (public endpoint)
- **Accounting export** (`client.accounting.export`) — export transaction history as `AccountingEvent[]` (JSON) or raw CSV for any date range
- **Claims module** (`client.claims`) — manage user account claims: `getRequestByUser`, `createRequest`, `getFunds`, `triggerTestClaimFunds`
- **`oneTimePayments.getCustomerForTransaction(transactionUUID)`** — retrieve the customer associated with a completed transaction
- **Typed session response interfaces**: `OneTimePaymentSession`, `SubscriptionSession`, `PaygSubscriptionSession` — replace the former generic `Session` type with purpose-specific shapes matching the API response for each checkout flow
- **`SessionCheckout`** union type (`OneTimePaymentSession | SubscriptionSession | PaygSubscriptionSession`) — use when the session type is not known at call time (e.g. inside a webhook handler)
- New types: `RefundEntry`, `RefundStatus`, `AccountingEvent`, `ClaimRequest`, `Organization`, `ClaimFunds`, `PaymentMetadata`, `CreatePaymentSessionDto`, `CreateSubscriptionSessionDto`

### Changed

- **Session checkout endpoints split** — `oneTimePayments.createSession()` now posts to `/transaction/session-checkout/new/payment`; `subscriptions.createSession()` posts to `/transaction/session-checkout/new/subscription` (previously both used the generic `/transaction/session-checkout/` endpoint)
- **`subscriptions.createSession()` signature** — subscription options (`frequency`, `trialPeriod`, `minPeriods`) are now top-level fields instead of nested under `options` (old `CreateSessionDto` replaced by `CreateSubscriptionSessionDto`)
- **`oneTimePayments.createSession()` signature** — now typed as `CreatePaymentSessionDto` (same fields as before, but `options` field removed)
- **`oneTimePayments.getSession()` return type** — now returns `Promise<OneTimePaymentSession>` instead of the generic `Session`
- **`subscriptions.getSession()` return type** — now returns `Promise<SubscriptionSession>` instead of the generic `Session`; note that `frequency` and `trialPeriod` on this type are raw seconds (`number`), not `Duration` objects
- **`SessionWebhookResponse.session`** — now typed as `SessionCheckout` (the union of all three session types) instead of the removed `Session`
- **`customers.update()`** — UUID is now passed in the URL path (`PUT /customer/:uuid`) rather than in the request body
- **`Subscription.subscriptionStatus`** — field was previously typed as `status` but the API returns `subscriptionStatus`; fixed to match the actual JSON key
- **`Payment` and `CombinedPayment`** — added `amountMinUnits: string` and `metadata?: PaymentMetadata` fields
- **`SubscriptionHistory`** — added `amountMinUnits: string` and `metadata?: PaymentMetadata` fields
- **`CombinedPayment`** — restructured to a standalone interface (no longer extends `Payment`); adds `test: boolean` and tightens `productId` to `number | null`
- **`LinkResponse`** — removed `expiresAt` field (not returned by the API)
- **`SubscriptionOptions`** (session response type) — removed `subscriptionType` and `freeCredits` fields

### Deprecated / Disabled

- **`client.payAsYouGo`** — Pay-as-you-go subscriptions are temporarily disabled pending new infrastructure. The property and `PayAsYouGoRequests` class are commented out and will be re-enabled in a future release.

### Removed

- `Session` generic type — replaced by `OneTimePaymentSession`, `SubscriptionSession`, `PaygSubscriptionSession`, and the `SessionCheckout` union
- `CreateSessionDto` — replaced by `CreatePaymentSessionDto` and `CreateSubscriptionSessionDto`
- `CreateSubscriptionOptions` — options are now flat fields on `CreateSubscriptionSessionDto`
- `SubscriptionType` type alias — no longer needed with PAYG disabled

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-23

### Added

- Initial release of QBitFlow JavaScript/TypeScript SDK
- Complete TypeScript support with full type definitions
- One-time payment operations
    - Create payment sessions
    - Get payment details
    - List payments with pagination
    - Combined payment listing
- Subscription operations
    - Create subscription sessions with customizable frequency
    - Trial period support
    - Get subscription details
    - List subscriptions with pagination
    - Cancel subscriptions
- Pay-as-you-go subscription operations
    - Create PAYG sessions
    - Get PAYG details
    - List PAYG subscriptions
    - Cancel PAYG subscriptions
- Transaction status monitoring
    - Get current transaction status
    - Real-time WebSocket status updates with automatic reconnection
- Comprehensive error handling with custom error classes
- Automatic request retry logic with exponential backoff
- Support for both CommonJS and ES modules
- Webhook handling examples
- Complete test suite with Jest
- Detailed documentation and examples
- Express.js webhook server example
- Client usage examples

### Features

- Dual package support (CommonJS and ESM)
- Type-safe API with full IntelliSense support
- Request timeout and retry configuration
- Pagination support for list operations
- WebSocket support for real-time updates
- Comprehensive error handling and reporting

### Developer Experience

- Full TypeScript types exported
- JSDoc comments on all public methods
- Example code for common use cases
- Test coverage for core functionality
- Linting and formatting configuration
- Build scripts for distribution

## [Unreleased]

### Planned

- Additional webhook signature verification
- Rate limit handling improvements
- Caching layer for repeated requests
- GraphQL support
- Browser bundle optimization
- Additional currency support
- Webhook retry mechanism
- Dashboard integration helpers


## [1.1.0] - 2026-03-08

### Added

-   HMAC signature verification for webhook requests
-   New `verify` method in `WebhookRequests` class
-   Updated documentation with webhook verification examples

### Security

-   Improved HMAC signature verification process
-   Enhanced input validation for webhook requests


---

For more information, visit [GitHub Repository](https://github.com/qbitflow/qbitflow-js-sdk)
