# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-10-28

The SDK for **QBitFlow API v2**. A major release for every 2.x user: API v1, which 2.x calls, is
retired, and the services, ids, money types, errors and webhooks change. The
[migration guide](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/MIGRATION-v3.md) maps
every 2.1.0 method and type to its replacement, with before/after code. This entry lists the
changes since 2.1.0.

### Added

-   **Checkout sessions** (`client.checkoutSessions`): `createPayment` and `createSubscription`
    (an inline product, `productUuid` or `productReference`; `expiresInMinutes`, `metadata`, and
    the `{{UUID}}` / `{{TRANSACTION_TYPE}}` redirect placeholders, also as `Placeholders`), `get`
    (four statuses: `created`, `waitingConfirmation`, `completed`, `expired`; a failed attempt is
    `created` with `lastAttempt`), `expire`, and `waitForCompletion` for scripts and tests.
-   **Checkout fees**: `fees` on both creates, with up to 10 lines of your own (`FeeItem`:
    `label`, `description`, `amountUsd`) and `processingFee` (the customer pays QBitFlow's fee,
    grossed up so you keep the price and your lines). A subscription's fees are locked with its
    price. `Payment.priceUsd` and `fees`, `Subscription.fees`, `FeeLine`, `FeeLineType`.
-   **Your own `metadata`** (`Record<string, string>`) on products, customers, both checkout
    creates and subscriptions (`subscriptions.update`), copied onto payments and into webhooks;
    merged on updates (a key set to `''` deletes it).
-   **Marketplaces**: `invitations` (`create`, `list` / `iterate`, `revoke`; `sendEmail: false`
    to share the link yourself) and `members` (`list` / `iterate`, `get`, `update`, `remove`,
    `trust`, `listHeldFunds`, `getHeldFunds`, `getOwnHeldFunds`); `client.onBehalfOf(userUuid)`
    to act in a member's space; `MerchantNotReadyReason` for a `409 merchant_not_ready`.
-   `client.me()`: what the key is (role, space, mode), the recommended start-up check.
-   `transactions.list` / `iterate` (payments and bills in one feed), `failures.list` /
    `iterate` (failed payment attempts), filters on `payments.list` (customer, product, dates,
    `reference`, `refunded`, `includeMembers` / `userUuid`).
-   `subscriptions.list` / `iterate`, `update`, `listBills` / `iterateBills`, `getBill`;
    `Subscription.currentPeriodEnd` (grant access while now is before it), `actionRequired`,
    `priceUsd`, `cancellationReason`, `dunning`, `metadata`, `managementPageLink`, `allowance`.
-   `refunds.list` / `iterate` (filtered by `status`, `txUuid`, `held`, `includeMembers`,
    `userUuid`) and `refunds.get`. Refunds are read only: they are answered or sent from the
    dashboard.
-   `wallets` (`list` with balances, `listForMember`, `listAcceptedCurrencies`),
    `accounting.exportJson` / `exportCsv` and `exportJsonRange` / `exportCsvRange` (any range, in
    windows of at most 92 days), `currencies.list` / `get`.
-   **Webhooks**: `webhooks.endpoints` (`list` / `iterate`, `create` with the secret shown once,
    `get`, `update`, `delete`) and `webhooks.events` (the event log: `list` / `iterate`, `get`
    with its deliveries). Verification without a client: `import { webhooks } from 'qbitflow'`
    with `verify`, `constructEvent`, `parseEvent`, `sign` (to test handlers), the type guards
    `isEventType`, `isUnknownEvent`, `isSubscriptionSession`, `eventData`, and the header
    constants `SIGNATURE_HEADER`, `EVENT_ID_HEADER`, `EVENT_TYPE_HEADER`.
-   **A webhook router**, `webhooks.router(secret)`: typed handlers per event type (`on`,
    `onUnknown`, `onAny`), `handle(rawBody, header)` returning the HTTP answer, and adapters for
    Web `Request`/`Response` (`fetchHandler`: Next.js, Hono, Bun, Deno, Cloudflare Workers) and
    `node:http` / Express (`nodeHandler`).
-   **Typed events**: the `Event` union of 15 types (`PaymentCompletedEvent`,
    `SubscriptionBilledEvent`, `RefundApprovedEvent`, `MemberJoinedEvent`,
    `CheckoutExpiredEvent`, …) and `UnknownEvent` for types newer than the SDK.
-   **Async iterators** next to every paginated list (`for await`).
-   **Request options** on every method: `onBehalfOf`, `idempotencyKey`, `requestId`
    (`X-Request-Id`) and `signal` (an `AbortSignal` cancelling the call, its retries and waits).
-   An `Idempotency-Key` on each of the 6 creates, generated per call and reused by its retries.
-   **Client-side validation** of every input before sending (names, texts, references, emails,
    phones, URLs, USD amounts, percents, metadata, durations, ids, dates, cursors, enum filters):
    a `ValidationError` naming each failing field, and nothing is sent.
-   Helpers: `hasAccess(subscription, at?)`, `formatAmount` / `parseAmount` (exact conversions
    between token units and on-chain integers), `QBitFlow.fromEnv()`, `isRetryable(err)`.
-   An injectable `fetch` option, the `VERSION`, `DEFAULT_BASE_URL`, `DEFAULT_TIMEOUT` and
    `DEFAULT_MAX_RETRIES` constants, and TSDoc on every export, shipped in the type declarations.

### Changed

-   **Breaking: Node.js 20 or later, and no runtime dependencies.** `axios` and `ws` are dropped:
    requests use the global `fetch`. The package ships ES module and CommonJS builds, each with
    its own type declarations, and its TypeScript sources.
-   **Breaking: API v2.** The default base URL is `https://api.qbitflow.app/v2`. The SDK calls
    53 public routes in 14 services.
-   **Breaking: the client.** `new QBitFlow(apiKey, options?)` or `new QBitFlow({ apiKey, …
    })`; `timeout` bounds each attempt; `maxRetries: 0` now disables retries (it meant the
    default). The key and every option are checked at construction (a `ValidationError`).
-   **Breaking: renamed services and methods.** `oneTimePayments` → `payments` and
    `checkoutSessions`; `transactionStatus.get` → `checkoutSessions.get`; `users` →
    `invitations` and `members`; `claims` → `members.trust` and the held-funds reads;
    `getAll` → `list` (with filters) and `iterate`; `getPaymentHistory` → `listBills`;
    `forceCancel` → `cancel(uuid, { immediate? })` (returns `{ subscription, pending }`);
    `executeTestBilling` → `testBill`; `accounting.export` → `exportJson` / `exportCsv`;
    `currencies.getAllAvailable` / `getAllMain` → `currencies.list({ test?, main? })`;
    `refunds.getAll` / `getAllInactive` → `refunds.list` with `status`.
-   **Breaking: ids are strings.** Products and people are named by UUIDs (`productId` →
    `productUuid`, `userId` → `userUuid`); `onBehalfOf` takes a member's user UUID; acronyms are
    words (`customerUuid`, `amountUsd`); transactions use prefixed ids (`pay@…`, `sub@…`,
    `sub-hist@…`, `refund@…`). Currencies keep numeric ids.
-   **Breaking: money is a decimal string, never a number**, in requests and responses
    (`priceUsd: '4.99'`), and fee rates are percents (`feePercent: '1.5'`, was `feeBps: 150`).
    `Payment.amount` and `Bill.amount` are token amounts (`'10'` for 10 USDC), next to
    `amountMinUnits` and `amountUsd`.
-   **Breaking: models renamed and reshaped**, among them `LinkResponse` →
    `CreatedCheckoutSession`, `TransactionStatus` → `CheckoutSessionStatus`,
    `SubscriptionHistory` → `Bill`, `RefundEntry` → `Refund`, `User` → `Member`, `CursorData` →
    `Page`, `QBitFlowConfig` → `ClientConfig`, `PaymentMetadata` → `Settlement`; `name` →
    `firstName` on customers and members; `Subscription.subscriptionStatus` → `status`, its dates
    → `lastBilledAt`, `nextBillingAt`, `cancellableAt`, its `frequency` a `Duration`;
    `AccountingEvent` with decimal-string amounts and their `…MinUnits` twins. Every timestamp is
    an ISO string as sent; optional fields are `field?: T` (the API never sends `null`).
-   **Breaking: enums** are string unions with a `const` object of the known values (PascalCase
    members, lowerCamelCase values: `SubscriptionStatus.PastDue === 'pastDue'`), replacing the
    TypeScript `enum`s. `RefundStatus.REFUSED` → `RefundStatus.Rejected`; subscription statuses
    `low_on_funds` and `pending` became `actionRequired` values.
-   **Breaking: errors.** One class per condition, each extending `ApiError` (`status`, `code`,
    `rawMessage`, `details`, `requestId`, `fieldErrors`, `rawBody`): `ValidationError`,
    `BadRequestError`, `AuthenticationError`, `PermissionDeniedError` (`forbidden`, or
    `policy_disabled` with `details.policy` and, for a request field, `details.field`),
    `NotFoundError`, `ConflictError`, `GoneError`, `IdempotencyError`, `RateLimitError`,
    `ServerError`, `NetworkError`, `WebhookSignatureError`, replacing the `…Exception` classes.
    The message reads `<message> (status …, code …, request …)`.
-   **Breaking: webhooks** use API v2's scheme: the `QBitFlow-Signature: t=…,v1=…` header, an
    HMAC-SHA256 over the raw body (no canonical JSON), both secrets valid during a rotation, and
    typed events (`payment.completed`, `subscription.billed` with `{ bill, subscription }`,
    `refund.approved`, `checkout.expired`, …). `client.webhooks.verify` (a boolean) →
    `client.webhooks.verifyRemote` (throws on a mismatch).
-   **Breaking: pagination.** Lists return `Page<T>` (`items`, `hasMore` as a property,
    `nextCursor` only when `hasMore`); `products.list` and `refunds.list` are paginated. Short
    lists (`currencies.list`, `wallets.*`, `members.listHeldFunds`, `accounting.exportJson`)
    return arrays.
-   **Breaking: lookups by reference** (`products`, `customers`, `payments`, `subscriptions`
    `getByReference`) run the list's `?reference=` filter and throw a `NotFoundError` when no item
    has exactly that reference.
-   **Breaking: deletes and revokes resolve to `void`** (they resolved to `{ message }`).
-   **Retries are safe**: only reads and the 6 creates are retried (2.x retried every method,
    POSTs included), on network errors, timeouts, 5xx, 429 (after `Retry-After`, at most 60 s)
    and `409 idempotency_key_in_use`, with a 1 s · 2ⁿ back-off.
-   Responses are decoded against their type at runtime: a field the API leaves out gets its zero
    value; a value of the wrong JSON type is a `ServerError`; unknown enum values are kept.
-   Update params send an explicit `''` for the clearable fields (`lastName`, `phoneNumber` and
    `address` of a customer, a product's or webhook endpoint's `description`).
-   A member's own key may send a checkout's `successUrl` / `cancelUrl` while its organization's
    `members.checkoutRedirects` policy allows it (`403 policy_disabled` otherwise).

### Removed

-   `users`, `claims`, `apiKeys` (API keys are managed in the dashboard), `transactionStatus` and
    its WebSocket stream, `PayAsYouGoRequests`, `oneTimePayments.getSession`,
    `subscriptions.getSession`, `oneTimePayments.getCustomerForTransaction`,
    `refunds.getByTransaction` (use `refunds.list({ txUuid })`), `customers.getByEmail` (use
    `customers.list({ email })`), `users.getByEmail`, `claims.triggerTestClaimFunds`,
    `getApiKey()` and `getBaseUrl()`.
-   The v1 webhook verifier: `verifyWebhookSignature`, `computeWebhookSignature`,
    `canonicalJson`, `extractWebhookHeaders`, `WebhookHeaders`, `VerifyWebhookOptions`,
    `DEFAULT_MAX_TIMESTAMP_AGE_SECONDS`, `TEST_WEBHOOK_ID`, the `HEADER_*` constants and the
    `client.webhooks` header getters; the v1 payloads `SessionWebhookResponse` and
    `SubscriptionStatusTransitionWebhook`.
-   `OneTimePaymentSession`, `SubscriptionSession`, `PaygSubscriptionSession`, `SessionCheckout`
    (a checkout's data now comes with `checkout.expired`, without the hosted page's own fields),
    `StatusLinkResponse`, `StatusResponse`, `StatusResponseError`, `SuccessResponse`,
    `ErrorResponse`, `Organization`, `ApiKey`, `ClaimFunds`, `TransactionShortType`,
    `CursorDataResponse`, `getCursorData`, `WebSocketException`.
-   `RefundStatus.FAILED` (the API never sends it) and the `TransactionType` members other than
    `Payment` and `CreateSubscription`.

### Fixed

-   Field validation errors are read from the API's `details.errors` (2.x read a top-level
    `errors` list and lost them): `fieldErrors` names each failing input, dotted when nested
    (`frequency.unit`).
-   Path segments and query values are escaped: an id containing `/`, `?`, `#`, `%` or `&` no
    longer changes the request, and a segment that is exactly `.` or `..` is refused.
-   A reference that is exactly `.` or `..` is refused before sending, everywhere references are
    checked (creates, `productReference`, `customerReference`, the `reference` filters,
    `getByReference`): such a reference can't be named in a URL.
-   Lengths are counted in characters (code points), as the API does.
-   A 2xx with an empty or non-JSON body where a result is expected is a `ServerError`, not an
    empty result.

### Security

-   The API key is held in a private field: it never shows in `console.log`, `util.inspect` or
    `JSON.stringify` of a client, and is never quoted in an error message.
-   An API key with a space, a control or a non-ASCII character, and a `baseUrl` with
    credentials, a query or a fragment, are refused at construction, without echoing them.
-   Redirects are never followed (a 3xx is a `ServerError`), so the `X-API-Key` header is never
    sent to another host; 2.x followed them through `axios`.
-   `timeout` bounds each attempt through the last byte of the response body.
-   Webhook signatures are compared in constant time against every `v1` signature, with a
    timestamp tolerance (300 seconds by default) that can no longer be skipped; the router's
    adapters read at most 1 MiB.
-   Decoding untrusted JSON never touches a prototype: a `__proto__` key in `metadata` stays a
    plain own entry.

## [2.1.0] - 2026-09-21

Aligns the SDK with the API documentation of the time. Partial updates are now genuinely partial,
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

- The Express example (`examples/server.ts`) now uses `extractWebhookHeaders` and
  `verifyWebhookSignature`, verifying locally when `QBITFLOW_WEBHOOK_SECRET` is set and falling back
  to the API otherwise. It also short-circuits the dashboard's connectivity-test webhook.

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
- **`Subscription.allowance` is now a `string`** (decimal) instead of `number`, to preserve
  precision.
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

- **Act for user**: `Requests.onBehalfOf(userID: string)` temporarily act as a different user for
  the duration of a request. This is useful for admin-level operations that need to be performed on
  behalf of another user.
- **`users.getByEmail(email)`** — retrieve a user by their email address 

## [1.3.0] - 2026-08-17

### Added

- **Reference-based lookups** — resolve resources by the reference you assigned instead of storing
  QBitFlow's internal UUIDs:
  - `oneTimePayments.getByReference(reference)` — `GET
    /transaction/payment/reference/:paymentReference`
  - `subscriptions.getByReference(reference)` — `GET
    /transaction/subscription/reference/subscription/:subscriptionReference`
  - `customers.getByReference(reference)` — `GET /customer/reference/:reference`
- **Your own references on session creation** — `CreatePaymentSessionDto` and
  `CreateSubscriptionSessionDto` now accept:
  - `reference` — your own transaction reference (e.g. order/invoice ID), echoed back on the
    resulting object and in webhooks
  - `productReference` — select a product by your own reference (alternative to `productId`)
  - `customerReference` — select an existing customer by your own reference (alternative to
    `customerUUID`); a new customer is created during checkout if none matches

### Changed

- **`Payment.reference`** — added; the reference you set when creating the session
- **`Subscription.reference`** — added; the reference you set when creating the session
- **`OneTimePaymentSession`** (and its subtypes) — added `reference`, `productReference`, and
  `customerReference`, so session responses and transaction webhook payloads expose the references
  you provided
- **`SubscriptionStatusTransitionWebhook.subscriptionReference`** — added; the subscription's
  reference is now included on status-transition webhooks

## [1.2.1] - 2026-07-18

- removed `webhookUrl` from `CreatePaymentSessionDto` and `CreateSubscriptionSessionDto`. Webhook
  URLs are now set at the settings level in the QBitFlow dashboard, and cannot be overridden per
  session. This change simplifies session creation and ensures consistent webhook handling across
  all transactions.
- Added webhooks for subscription status transitions. The new webhook payload includes
  `subscriptionUUID`, `previousStatus`, `currentStatus`, and `updatedAt` fields, allowing clients to
  track subscription lifecycle events more effectively.
- Also added a test webhook ID for webhook endpoint reachability checks from the frontend "Test
  webhook" action. This test sends a fake payload to the configured URL, which some SDKs may not
  parse like a real webhook. If the incoming webhook ID matches `TEST_WEBHOOK_ID`, handlers should
  return HTTP `200` immediately and skip normal payload processing.

## [1.2.0] - 2026-05-03

### Added

- **Refunds module** (`client.refunds`) — query active and inactive refund entries, and look up the
  refund for any transaction UUID (public endpoint)
- **Accounting export** (`client.accounting.export`) — export transaction history as
  `AccountingEvent[]` (JSON) or raw CSV for any date range
- **Claims module** (`client.claims`) — manage user account claims: `getRequestByUser`,
  `createRequest`, `getFunds`, `triggerTestClaimFunds`
- **`oneTimePayments.getCustomerForTransaction(transactionUUID)`** — retrieve the customer
  associated with a completed transaction
- **Typed session response interfaces**: `OneTimePaymentSession`, `SubscriptionSession`,
  `PaygSubscriptionSession` — replace the former generic `Session` type with purpose-specific shapes
  matching the API response for each checkout flow
- **`SessionCheckout`** union type (`OneTimePaymentSession | SubscriptionSession |
  PaygSubscriptionSession`) — use when the session type is not known at call time (e.g. inside a
  webhook handler)
- New types: `RefundEntry`, `RefundStatus`, `AccountingEvent`, `ClaimRequest`, `Organization`,
  `ClaimFunds`, `PaymentMetadata`, `CreatePaymentSessionDto`, `CreateSubscriptionSessionDto`

### Changed

- **Session checkout endpoints split** — `oneTimePayments.createSession()` now posts to
  `/transaction/session-checkout/new/payment`; `subscriptions.createSession()` posts to
  `/transaction/session-checkout/new/subscription` (previously both used the generic
  `/transaction/session-checkout/` endpoint)
- **`subscriptions.createSession()` signature** — subscription options (`frequency`, `trialPeriod`,
  `minPeriods`) are now top-level fields instead of nested under `options` (old `CreateSessionDto`
  replaced by `CreateSubscriptionSessionDto`)
- **`oneTimePayments.createSession()` signature** — now typed as `CreatePaymentSessionDto` (same
  fields as before, but `options` field removed)
- **`oneTimePayments.getSession()` return type** — now returns `Promise<OneTimePaymentSession>`
  instead of the generic `Session`
- **`subscriptions.getSession()` return type** — now returns `Promise<SubscriptionSession>` instead
  of the generic `Session`; note that `frequency` and `trialPeriod` on this type are raw seconds
  (`number`), not `Duration` objects
- **`SessionWebhookResponse.session`** — now typed as `SessionCheckout` (the union of all three
  session types) instead of the removed `Session`
- **`customers.update()`** — UUID is now passed in the URL path (`PUT /customer/:uuid`) rather than
  in the request body
- **`Subscription.subscriptionStatus`** — field was previously typed as `status` but the API returns
  `subscriptionStatus`; fixed to match the actual JSON key
- **`Payment` and `CombinedPayment`** — added `amountMinUnits: string` and `metadata?:
  PaymentMetadata` fields
- **`SubscriptionHistory`** — added `amountMinUnits: string` and `metadata?: PaymentMetadata` fields
- **`CombinedPayment`** — restructured to a standalone interface (no longer extends `Payment`); adds
  `test: boolean` and tightens `productId` to `number | null`
- **`LinkResponse`** — removed `expiresAt` field (not returned by the API)
- **`SubscriptionOptions`** (session response type) — removed `subscriptionType` and `freeCredits`
  fields

### Deprecated / Disabled

- **`client.payAsYouGo`** — Pay-as-you-go subscriptions are temporarily disabled pending new
  infrastructure. The property and `PayAsYouGoRequests` class are commented out and will be
  re-enabled in a future release.

### Removed

- `Session` generic type — replaced by `OneTimePaymentSession`, `SubscriptionSession`,
  `PaygSubscriptionSession`, and the `SessionCheckout` union
- `CreateSessionDto` — replaced by `CreatePaymentSessionDto` and `CreateSubscriptionSessionDto`
- `CreateSubscriptionOptions` — options are now flat fields on `CreateSubscriptionSessionDto`
- `SubscriptionType` type alias — no longer needed with PAYG disabled

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-08

### Added

-   HMAC signature verification for webhook requests
-   New `verify` method in `WebhookRequests` class
-   Updated documentation with webhook verification examples

### Security

-   Improved HMAC signature verification process
-   Enhanced input validation for webhook requests

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
