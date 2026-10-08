# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-10-08

The SDK for **QBitFlow API v2**, aligned with the API docs `v2` @ `58460e9` and with the
behaviour contract the Go, JavaScript, Python and PHP SDKs 3.0.0 share (same services, methods,
errors, retries and webhook verification). A major release: the services, the ids, the errors and
the webhooks change. [MIGRATION-v3.md](MIGRATION-v3.md) maps every 2.x method and type to its
replacement.

This entry describes the changes since 2.1.0, the last published release (2.5.0 was prepared
but never published; its changes are part of 3.0.0).

### ⚠️ Breaking

-   **No runtime dependencies; Node.js 20 or later.** `axios` and `ws` are dropped: requests use
    the global `fetch`, or the one passed as the `fetch` option. The package ships CommonJS and ES
    module builds, each with its own type declarations, under the same `exports` map.
-   **API v2**: the default base URL is `https://api.qbitflow.app/v2`. API v1 runs next to it,
    against the same data, for a transition period.
-   **The client.** `new QBitFlow(apiKey)`, `new QBitFlow(apiKey, options)` or
    `new QBitFlow({ apiKey, ...options })`; options `baseUrl`, `timeout` (ms, now per attempt),
    `maxRetries` (`0` now disables retries; it meant the default), `onBehalfOf`, `fetch`. The key
    must be non-blank and start with `sk_`, and every option is checked: a `ValidationError`
    otherwise, and nothing is sent. `getApiKey()` and `getBaseUrl()` are removed.
-   **Ids are UUID strings.** Products are named by `uuid` (was the numeric `id`), and
    `productId` is `productUuid` everywhere; people are named by their user UUID (`userId` →
    `userUuid`). `On-Behalf-Of` takes a member's user UUID: `client.onBehalfOf(userUuid)` returns
    a client for every service (the per-service `onBehalfOf(userId: number)` is gone), and throws
    a `ValidationError` at once for a value that is not a UUID. `organizationId` is gone from every
    model. Acronyms are words in every name (`customerUuid`, `subscriptionUuid`, `TxAmountsUsd`).
-   **Users and claims become invitations, members and the trust layer**: `users.*` →
    `invitations.*` and `members.*` (a person exists once they accept an invitation);
    `claims.*` → `members.trust` and the held-funds reads. `apiKeys.*` is removed (keys are
    managed in the dashboard; `client.me()` describes the current key).
-   **Checkout sessions have their own service.** `oneTimePayments.createSession` and
    `subscriptions.createSession` → `checkoutSessions.createPayment` / `createSubscription`,
    returning a `CheckoutSession` (`uuid`, `link`, `expiresAt`). `transactionStatus.get(uuid, type)`
    → `checkoutSessions.getStatus(uuid)`, with four statuses (`created`, `waitingConfirmation`,
    `completed`, `expired`): a failed attempt is `created` with `lastAttempt` set, and is never
    final. `client.oneTimePayments` → `client.payments`.
-   **Subscriptions.** `status` (was `subscriptionStatus`) takes `trial`, `trialExpired`,
    `active`, `pastDue`, `paused`, `stopped`, `cancelled`; `low_on_funds` and `pending` became
    `actionRequired` values (`topUpAllowance`, `raiseMaximum`, `confirmTrial`), and the `stopped`
    boolean the `stopped` status. `frequency` is a `Duration` (was seconds), `nextBillingDate` is
    optional (absent once cancelled). `forceCancel` (a GET) → `cancel(uuid, { immediate? })` (a
    POST; `immediate: false` cancels at the end of the paid period; returns
    `{ subscription, pending }`, `pending` for an HTTP 202); `executeTestBilling` is a POST
    returning the bill's `BillingState`; `getPaymentHistory` → `listBills` / `iterateBills`, or
    `getPublicHistory`; `get` returns cancelled subscriptions too.
-   **Fee rates are percents**: `feeBps` → `feePercent`, `organizationFeeBps` →
    `organizationFeePercent` (`150` bps is `1.5`).
-   **Models renamed and retyped**: `LinkResponse` → `CheckoutSession`, `TransactionStatus` →
    `CheckoutSessionStatus`, `SubscriptionHistory` → `Bill`, `RefundEntry` → `Refund` (`txId` →
    `txUuid`), `User` → `Member`, `UserRole` → `Role`, `CursorData` → `Page` (`hasMore` is a
    boolean property, no longer a method), `TxAmountsFull` → `TxAmounts`, `QBitFlowConfig` →
    `ClientConfig`; `transactionHash` → `txHash`; the `…Dto` request types → `…Params`. Every
    timestamp is an ISO string as sent (2.1.0 typed some as `Date`).
-   **Enums** are string unions with a `const` object of the known values (PascalCase members:
    `SubscriptionStatus.PastDue`), replacing the TypeScript `enum`s with UPPER_CASE members; values
    follow the API's lowerCamelCase (`pastDue`, `trialExpired`, `subscriptionHistory`,
    `createPaygSubscription`); `RefundStatus.REFUSED` → `RefundStatus.Rejected` (`rejected`),
    `RefundStatus.FAILED` and `TransactionShortType` are removed.
-   **Errors.** `NotFoundException`, `UnauthorizedException`, `ForbiddenException`,
    `ValidationException`, `RateLimitException`, `ServerException`, `NetworkException` →
    `NotFoundError`, `AuthenticationError`, `PermissionDeniedError`, `ValidationError`,
    `RateLimitError`, `ServerError`, `NetworkError`, plus `BadRequestError` (other 400s),
    `ConflictError` (409), `GoneError` (410), `IdempotencyError` (422) and
    `WebhookSignatureError`, which 2.1.0 reported as validation errors. Each extends `ApiError`
    (`status`, `code`, `rawMessage`, `details`, `requestId`, `fieldErrors`, `rawBody`, `cause`),
    itself a `QBitFlowError`. `WebSocketException` is removed.
-   **Webhooks** use API v2's scheme: the `QBitFlow-Signature: t=…,v1=…` header, an HMAC-SHA256 of
    `t + "." + rawBody` over the raw body (no canonical JSON), and the event envelope
    `{ id, type, version, createdAt, test, userUuid, data }`. Endpoints must be on payload version
    v2: v1 bodies are not parsed. `verifyWebhookSignature(secret, timestamp, signature, payload)`
    → `webhooks.verify(rawBody, signatureHeader, secret, { tolerance, now })`;
    `client.webhooks.verify(payload, signature, timestamp)` (a boolean) →
    `client.webhooks.verifyRemote(endpointUuid, rawBody, signatureHeader)` (throws on a mismatch).
-   **Pagination**: `getAll…({ limit, cursor })` → `list(params)` returning a `Page<T>`, with
    filters, and an async iterator twin.

### Added

-   `client.me()`: what the key is (role, space, mode), the recommended start-up check;
    `client.onBehalfOf(userUuid)`: a client acting in a member's space, sharing the configuration.
-   `checkoutSessions`: `createPayment`, `createSubscription` (with `expiresInMinutes` and the
    `{{UUID}}` / `{{TRANSACTION_TYPE}}` redirect placeholders), `getStatus`, `expire`.
-   `payments.list` / `listCombined` with filters (customer, product, dates, `refunded`,
    `includeMembers` / `userUuid`, `source`, `subscriptionUuid`); `payments.get` with
    `{ includeMembers }`. `failures.list`: the failed payment attempts.
-   `subscriptions.list` (status, reference and the shared filters), `listBills`, `getBill`;
    `Subscription.currentPeriodEnd` (grant access while now is before it), `actionRequired`,
    `priceUsd`, `cancellationReason`, `dunning`.
-   `refunds.initiate`: a merchant's refund of a payment or a bill, signed in the dashboard;
    refund list filters (`includeMembers`, `userUuid`, `held`).
-   `members` (`list`, `get`, `update`, `remove`, `trust`, `listHeldFunds`, `getHeldFunds`,
    `getOwnHeldFunds`) and `invitations` (`create`, `list`, `revoke`) for marketplaces.
-   `wallets` (`list` with balances, `listForMember`, `listSupportedCurrencies`),
    `accounting.exportJson` / `exportCsv`, `currencies.get`, product filters and subscription
    products, customer filters.
-   `webhooks.endpoints` (`list`, `create` with the secret shown once, `get`, `update`, `delete`)
    and `webhooks.events` (the event log: `list`, `get` with its deliveries).
-   Webhook verification without a client: `import { webhooks } from 'qbitflow'` with `verify`,
    `constructEvent`, `parseEvent`, the type guards `isEventType`, `isUnknownEvent`,
    `isSubscriptionSession`, `eventData`, and the header constants `SIGNATURE_HEADER`,
    `EVENT_ID_HEADER`, `EVENT_TYPE_HEADER`, `WEBHOOK_VERSION_HEADER`. The body may be a string, a
    `Buffer` or a `Uint8Array`, the header Node's raw `string | string[] | undefined`. Every `v1=`
    signature is checked, so a secret rotation needs nothing on the receiver's side.
-   Typed events: `Event`, a union of one type per event (`PaymentCompletedEvent`,
    `SubscriptionBilledEvent`, `MemberJoinedEvent`, `CheckoutExpiredEvent`… 15 types) and
    `UnknownEvent` for the others; `EventType` constants.
-   An async iterator next to every paginated list (`for await`): `iterate`, `iterateCombined`,
    `iterateBills`, `iterateInactive`.
-   Retries: reads and the 7 creates are retried on network errors, timeouts, 5xx, 429 (after
    `Retry-After`, at most 60 s) and `409 idempotency_key_in_use`, 3 times by default with a
    1 s · 2ⁿ back-off; `maxRetries: 0` disables them; `isRetryable(err)`. Other writes are never
    retried (2.1.0 retried every method, POSTs included).
-   An `Idempotency-Key` on each create, generated per call and reused by its retries; the
    `idempotencyKey` request option for retries across processes.
-   Request options on every method: `onBehalfOf`, `idempotencyKey`, `requestId`
    (`X-Request-Id`, and the request id on every error) and `signal` (an `AbortSignal` cancelling
    the call, its retries and its waits).
-   An injectable `fetch` (proxies, tracing, tests, other runtimes).
-   Client-side validation mirroring the API v2 validators, run before every request (no request
    is sent on failure).
-   `User-Agent: qbitflow-js/3.0.0`, the `VERSION` constant, and `DEFAULT_BASE_URL`,
    `DEFAULT_TIMEOUT`, `DEFAULT_MAX_RETRIES`.
-   **Integration helpers**, the same in the four QBitFlow SDKs:
    -   `webhooks.router(secret, { tolerance?, now?, onError? })` (also
        `client.webhooks.router(secret)`): verifies, parses and dispatches deliveries to handlers
        registered with `on(type, (data, event) => …)` (typed per event type, async allowed),
        `onUnknown` and `onAny`; `await router.handle(rawBody, header)` returns
        `{ status, event, error }` (200 handled or ignored, 400 bad signature or not a v2 event,
        500 a handler threw: the remaining handlers are skipped; `onError` sees every 400 and
        500). Adapters:
        `router.fetchHandler()` (`Request` → `Response`: Next.js route handlers, Hono, Bun, Deno,
        Cloudflare Workers) and `router.nodeHandler()` (`node:http`, Express with `express.raw`;
        a `req.body` already parsed by `express.json()` is answered 500 with a message saying so).
        They answer 405 to anything but POST and 413 above 1 MiB, with a small JSON body.
    -   `webhooks.sign(rawBody, secret, timestamp?)`: the `QBitFlow-Signature` header QBitFlow
        would send, to test webhook handlers.
    -   `checkoutSessions.waitForCompletion(uuid, { timeout?, interval?, ...requestOptions })`:
        polls the status until `completed` or `expired` (the last status seen at the timeout),
        for scripts, tests and back-office jobs.
    -   `hasAccess(subscription, at?)`: `currentPeriodEnd` set and `at < currentPeriodEnd`.
    -   `formatAmount(minUnits, decimals)` / `parseAmount(amount, decimals)`: exact conversions
        between min units and decimal strings (string arithmetic, never floats).
    -   `accounting.exportJsonRange` / `exportCsvRange`: exports over any range, split into
        windows of at most 95 days and concatenated (the CSV header once).
    -   `QBitFlow.fromEnv(config?)`: a client from `QBITFLOW_API_KEY`, `QBITFLOW_BASE_URL` and
        `QBITFLOW_ON_BEHALF_OF`, explicit options overriding them.
    -   `Placeholders.UUID` / `Placeholders.TRANSACTION_TYPE`: the redirect placeholders.
-   Examples: `checkout.ts`, `subscriptions.ts`, `marketplace.ts`, `webhook-handler.ts` (built on
    the webhook router), `errors-and-retries.ts`; `MIGRATION-v3.md`; README "Integration
    recipes" (Next.js, Express, Hono and Workers, plain Node).

### Changed

-   Responses are decoded against their type at runtime: a field the API leaves out or sends as
    `null` gets its zero value (or `undefined` when optional); a value of the wrong JSON type is a
    `ServerError`. Unknown enum values are kept as is, decimal strings are never parsed,
    timestamps keep the offset the API sends.
-   Redirects are never followed: a 3xx is a `ServerError` (axios replayed the request, API key
    included, against the redirect's target).
-   A 2xx with an empty or non-JSON body where a result is expected is a `ServerError`, not an
    empty result.
-   A request body JSON cannot represent (NaN, ±Infinity, a lone surrogate) is a
    `ValidationError`, and nothing is sent.
-   Update params send an explicit `''` for the clearable fields
    (`UpdateCustomerParams.phoneNumber` / `address`, `UpdateProductParams.description`,
    `UpdateWebhookEndpointParams.description`): `''` clears them, a field left out is unchanged.
-   Error messages read `<message> (status <status>, code <code>, request <requestId>)`,
    followed by each field error; the SDK's own validation messages never echo the rejected
    values. `instanceof` matches across the CommonJS and ES module builds.
-   `delete` methods resolve to `void` (they resolved to the API's `{ message }`).

### Removed

-   `PayAsYouGoRequests` (the API has no pay-as-you-go routes), `users`, `claims`, `apiKeys`,
    `transactionStatus` (and its WebSocket stream `connectAndHandleMessages`),
    `oneTimePayments.getSession`, `subscriptions.getSession`,
    `oneTimePayments.getCustomerForTransaction` (read `payment.customerUuid`, then
    `customers.get`), `refunds.getByTransaction` (read `payment.refund` / `bill.refund`).
-   The v1 webhook verifier: `canonicalJson`, `computeWebhookSignature`,
    `verifyWebhookSignature`, `extractWebhookHeaders`, `WebhookHeaders`, `VerifyWebhookOptions`
    (including `skipTimestampCheck`), `DEFAULT_MAX_TIMESTAMP_AGE_SECONDS`, `TEST_WEBHOOK_ID`, the
    `HEADER_*` constants and the `client.webhooks` header getters, and the v1 payloads
    `SessionWebhookResponse` and `SubscriptionStatusTransitionWebhook`.
-   `OneTimePaymentSession`, `SubscriptionSession`, `PaygSubscriptionSession`, `SessionCheckout`,
    `StatusLinkResponse`, `StatusResponse`, `StatusResponseError`, `SuccessResponse`,
    `ErrorResponse`, `Organization`, `ApiKey`, `ClaimFunds`, `TransactionShortType`,
    `CursorDataResponse`, `getCursorData`.

### Fixed

-   **Field validation errors were read from the wrong key** (a top-level `errors` list instead
    of the API's `details.errors`), so the fields of a 400 were lost. `fieldErrors` now names each
    failing input by the name sent, dotted when nested (`frequency.unit`).
-   User-supplied path segments and query values are escaped: a reference containing `/`, `?`,
    `#`, `%` or `&` no longer changes the request, and a segment that is exactly `.` or `..` is
    refused (a `ValidationError`) instead of being normalised away.
-   Lengths are counted in characters (code points), as the API does.
-   The webhook timestamp check is overflow-safe: a timestamp beyond 64 bits is refused instead of
    losing precision.

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
