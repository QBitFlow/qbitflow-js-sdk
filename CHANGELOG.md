# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-09-21

Aligns the SDK with docs revision `c3c8831`. Partial updates are now genuinely partial,
and three latent bugs are fixed — one of which meant a field was never populated at all.

> **Note:** this release carries breaking changes (listed below) despite the minor version
> bump.


### Added — local webhook verification

- **Verify webhooks without a network call.** Local verification needs your webhook secret
  (available from the QBitFlow dashboard) but no round-trip, so it is faster and keeps
  working when the API is unreachable. The existing API-side `verify` is unchanged and
  still available for callers who would rather not hold the secret.

  It performs the same three checks the server does: the timestamp is within a replay
  window (5 minutes by default, configurable to match your deployment), the HMAC-SHA256 of
  `<timestamp>.<canonical-json>` matches, and the comparison is constant-time so a timing
  side channel cannot be used to guess the signature.

  The signature covers a **canonical** rendering — object keys sorted at every level, no
  insignificant whitespace — rather than the bytes as they arrived, because proxies and
  frameworks routinely re-serialize a body and reorder keys. Signing raw bytes would reject
  payloads that are in fact untouched.

  New exports: `verifyWebhookSignature`, `computeWebhookSignature`, `canonicalJson`,
  `extractWebhookHeaders`, `WebhookHeaders`, `VerifyWebhookOptions`,
  `DEFAULT_MAX_TIMESTAMP_AGE_SECONDS`, `TEST_WEBHOOK_ID` and the header-name constants.
  `extractWebhookHeaders` accepts a Node `IncomingHttpHeaders`, a Fetch `Headers`, or a
  plain object.

- **Header extraction helpers.** Reading the QBitFlow headers is framework-dependent, so
  the SDK accepts anything header-shaped and does a case-insensitive lookup, returning the
  signature, timestamp, transaction id, and whether this is the dashboard's connectivity
  test (which you can acknowledge immediately without processing).

### Fixed — validation parity with the API

- **An empty optional field now counts as "not provided"**, matching the API. Session
  checkout's `productName`, `description`, `successUrl` and `cancelUrl` are all
  `binding:"omitempty,..."` on the server, which skips validation for an empty value. The
  SDK previously rejected an explicit empty string, so the common
  `successUrl: <env var> || ""` pattern failed locally on a request the API would have
  accepted. Non-empty values are validated exactly as before.

### Changed — examples

- The Express example (`examples/server.ts`) now uses `extractWebhookHeaders` and `verifyWebhookSignature`, verifying locally when `QBITFLOW_WEBHOOK_SECRET` is set and falling back to the API otherwise. It also short-circuits the dashboard's connectivity-test webhook.

### Added — client-side request validation

- Session checkout now mirrors the API's `producttext` rule (markup characters rejected,
  2-100 for an inline product name and 2-500 for its description) and requires redirect
  URLs to be absolute `http(s)`. Invalid input fails immediately instead of after a
  round-trip, and a `javascript:` redirect target is refused outright — the API's own `uri`
  rule is more permissive than this.

### Fixed

- **`validateCreateSession` rejected a session identified only by `productReference`.** It
  checked `productId` but not `productReference`, so the documented reference-only flow
  failed client-side before reaching the API.

### ⚠️ Breaking changes

- **`UpdateProductDto` fields are now all optional.** Updates are partial: omitted fields
  keep their stored value. Previously `name`, `description` and `price` were all required,
  which made partial updates impossible.
- **`UpdateCustomerDto.reference` has been removed.** A customer reference is immutable and
  the API ignores it on update, so sending it silently did nothing.
- **`UpdateUserDto` fields are now all optional and `password` has been removed.** Changing
  a password is a JWT-only, self-service operation that cannot be performed with an API key.
  The API silently ignores a password sent with an API key and still returns `200`, so the
  field was actively misleading. Note that a non-admin caller sending `organizationFeeBps`
  is now rejected with `403`.
- **`User.updateAt` is now `User.updatedAt`.** The old name was a typo that never matched
  the API's `updatedAt` field, so it was permanently `undefined`. Anything reading
  `user.updateAt` must be updated.
- **`OneTimePaymentSession.txType` is now `TransactionType`** instead of
  `TransactionShortType`. A subscription session reports `createSubscription`, not
  `subscription`, so comparisons against the short enum never matched.

### Fixed

- **`onBehalfOf(0)` no longer sends an invalid header.** The `On-Behalf-Of` header is now
  omitted entirely for `0` (and any non-positive value), which is what "act at the
  organization level" means. Previously it sent `On-Behalf-Of: 0`, which the API rejects
  with `400`.
- `onBehalfOf`'s documentation referred to a non-existent `X-Act-For-User` header.

### Added

- **`Product.test`, `Product.organizationId`, `Product.userId`** — returned by the API but
  previously absent from the type.
- **`Customer.test`** — likewise returned by the API but previously untyped.
- Integration coverage for partial updates (customers and products) and for an empty update
  body being a no-op.

### Changed

- `CreateUserDto.organizationFeeBps` is now optional, matching the API (it defaults to 0).
- The integration suite honours **`QBITFLOW_BASE_URL`** in addition to `QBITFLOW_API_URL`.
- Removed a stray `password` field from the integration suite's user fixture; the API
  ignores passwords on create (a new user starts unclaimed).

## [2.0.0] - 2026-09-13

Major release aligning the SDK with the current QBitFlow API. The API base URL is unchanged
(`/v1`); only the SDK version bumps to `2.0.0`.

### ⚠️ Breaking changes

- **Typed payment metadata.** `PaymentMetadata` is now a structured interface
  (`feeBps`, `organizationFee`, `referralFee`, `txMetadata`, `txAmounts`) instead of
  `Record<string, unknown>`. `Payment.metadata`, `CombinedPayment.metadata`, and
  `SubscriptionHistory.metadata` are typed as `PaymentMetadata`; `RefundEntry.metadata`
  is now `TxMetadata`. Min-unit amounts are decimal strings.
- **`SessionCheckout.availableCurrencies` is now `number[]`** (currency IDs) instead of
  `Currency[]`. Resolve details via the new `currencies` service.
- **`Subscription.allowance` is now a `string`** (decimal) instead of `number`, to preserve precision.
- **`ApiKey.expiresAt` is now `Date | null`** (null/omitted when the key never expires).
- **Removed `apiKeys.create` / `apiKeys.delete`** (and `CreateApiKeyDto`, `CreatedApiKeyResponse`).
  API-key management is a JWT-only API operation and cannot be performed with an API key;
  manage keys from the dashboard. Read access (`getAll`, `getForUser`) is unchanged.
- **Removed `payAsYouGo.createSession`** — PAYG session creation is disabled on the API. Existing
  PAYG subscriptions can still be retrieved and managed (`get`, `getSession`, `getByReference`,
  `getPaymentHistory`, `forceCancel`, `executeTestBilling`).

### Added

- **`currencies` service** — `getAllAvailable(test?)` and `getAllMain(test?)`
  (public `/utils/all-*-currencies` endpoints) to resolve currency IDs.
- **Authenticated-only fields** now modeled where the API returns them under authentication:
  `organizationId`/`userId` on `Customer`, `Payment`, `CombinedPayment`, `Subscription`,
  `SubscriptionHistory`; `settlementDetails` on `TransactionStatus`; `userName`/`txType` on
  the session checkout types. The session checkout's `feeBps`, `organizationId`,
  `organizationFeeBps`, `userId`, `customerUUID`, and `customerReference` are now optional
  (omitted on the public checkout page).
- **`User.claimedAt`** — set once an invited user has claimed their account.
- **`UpdateCustomerDto.reference`** — update a customer's reference.
- Expanded enums: `TransactionType` (`transfer`, `tokenTransfer`, `refund`,
  `faucet`, `claimFunds`), new `TransactionShortType`, and `DurationUnit` `years`.

### Changed

- `AccountingEvent` aligned with the API: `type` is now one of `payment`,
  `subscriptionHistory`, `refund`, `organizationFee`, `referralFee`; `customerUuid`
  renamed to `customerUUID`; added `paymentReference`, `relatedPaymentReference`,
  `productReference`, and `customerReference`.

## [1.3.1] - 2026-08-25

### Added

- **Act for user**: `Requests.onBehalfOf(userID: string)` temporarily act as a different user for the duration of a request. This is useful for admin-level operations that need to be performed on behalf of another user. 
- **`users.getByEmail(email)`** — retrieve a user by their email address 

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
