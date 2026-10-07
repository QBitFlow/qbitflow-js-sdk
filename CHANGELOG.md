# Changelog

All notable changes to this project will be documented in this file.

## [2.5.0] - 2026-09-23

Aligns the SDK with docs revision `5e7d5a5` and with the other three QBitFlow SDKs (Go,
Python, PHP), which now share one response-decoding policy, one retry policy, one error
taxonomy, one client-side validation rule set and one canonical-JSON implementation.

**The headline change: responses now match their types at runtime.** Until 2.1.0 every
response was `JSON.parse` output cast to an interface, so fields the API legitimately leaves out
were `undefined` behind a type that promised a value, and a `null` list crashed `.forEach`.
Every response — and every webhook body decoded with the new `parse*Webhook` helpers — is now
decoded against the server's type. Read **Changed (breaking)** before upgrading.

> **⚠️ Breaking changes in a minor release.** They are listed under **Removed** and
> **Changed (breaking)** below. Semver-aware resolvers treat `2.5.0` as a safe upgrade
> from any `2.x`, so `^2` / `~2.1` constraints will pick it up automatically — review
> before updating, or pin.

> **Node baseline:** Node 18 or later (`engines.node >= 18`).

### Changed (breaking)

-   **Response decoding.** A field without `| null` is always present: when the API leaves an
    optional value out (or sends `null`), you get its zero value — `0`, `''`, `false`, `[]`, a
    zero-valued nested object, or Go's zero time `0001-01-01T00:00:00Z` for a timestamp —
    exactly as the Go server reads it. A field typed `T | null` (a pointer on the server) is
    always present as its value or `null`. A field of the wrong JSON type is a response-shape
    failure: a `ServerException` naming the field path and carrying the HTTP status. Unknown
    extra fields are kept; unknown enum values stay raw strings. Concretely, compared with
    2.1.0:
    -   **Now always present (required):** `Payment` / `SubscriptionHistory`
        `organizationId`, `userId`, `metadata` and `productId`; `Customer` `organizationId`,
        `userId`, `phoneNumber`, `address`, `reference`; `Product.reference`;
        `ApiKey.userId`; `RefundEntry` `organizationId`, `userId`, `merchantMessage` and
        `txHash` (plain strings, `''` until set); `TransactionStatus.txHash` / `message`
        (`''` until set); `OrganizationFee` / `ReferralFee` ids and addresses;
        `TxMetadata.mainCurrencyPriceUSD`, `TxAmountsUSD.organization` / `referral` (`0` when
        none); every session field (`reference`, `productId`, `productName`, `price`, `successUrl`,
        `organizationId`, `feeBps`, `userId`, `userName`, `customerReference`, `trialPeriod`,
        `minPeriods`, `upgradingFromTrial` …); `Subscription.lastBillingDate` (Go's zero time
        before the first billing); `SessionWebhookResponse.managementPageLink` and the
        subscription webhook's `subscriptionReference` (`''` when none).
    -   **Now nullable (`T | null`, always present):** `Payment.reference`,
        `Payment.customerUUID`, `Subscription.reference` / `customerUUID` /
        `minimumCancellationDate`, `SubscriptionHistory.customerUUID`, session `customerUUID`,
        `CombinedPayment` `productId` / `subscriptionUUID` / `metadata`, `User.claimedAt`,
        `ApiKey.expiresAt`, `Currency.mainCurrencyId` / `mainCurrency`,
        `PaymentMetadata.organizationFee` / `referralFee`,
        `TransactionStatus.settlementDetails`, `SessionWebhookResponse.status`,
        `RefundEntry.respondedAt` / `metadata`.
    -   **`currency` is a required `Currency`** on `Payment`, `CombinedPayment`, `Subscription`
        and `SubscriptionHistory` — the full currency object (`payment.currency.symbol`),
        alongside `currencyId`.
    -   **Lists are never null:** top-level list responses, `CursorData.items` and
        `SessionCheckout.availableCurrencies` turn a `null` from the API into `[]`.
    -   `CombinedPayment` has no `organizationId` / `userId` (the API never sends them).
    -   An empty 2xx body where JSON is expected (other than a `204`), or a non-JSON 2xx, is
        a `ServerException` (with the body shortened to 200 characters in the message); a
        `204` decodes to the zero value.
-   **Seven fields are `string`, not `Date`**: `User.createdAt`, `User.updatedAt`,
    `User.claimedAt`, `Customer.createdAt`, `Product.createdAt`, `ApiKey.createdAt`,
    `ApiKey.expiresAt`. They were always RFC3339 strings at runtime — `user.createdAt.getTime()`
    type-checked and then threw.
-   **Enum-typed response fields are `<Enum> | (string & {})`** (`subscriptionStatus`,
    `status`, `role`, `txType`, `source`, `type` …): the members still autocomplete, and a value
    this SDK does not know yet is passed through as its raw string — treat an unknown status as
    "not active". Methods that take an enum also accept its string value
    (`transactionStatus.get(uuid, 'payment')`, `role: 'user'`).
-   **`oneTimePayments.getSession()` / `subscriptions.getSession()` check the session kind.**
    Reading a subscription session through the payment service (or the other way round)
    throws a `ValidationException` naming the right service, instead of returning a
    subscription typed as a payment.
-   **Subscription webhooks are a discriminated union** with a raw-string arm:
    `SubscriptionWebhook = SubscriptionStatusTransitionWebhook | SubscriptionBillingWebhook |
    UnknownSubscriptionWebhook`, each carrying `subscriptionUUID`, `subscriptionReference`, a
    `type` and the payload in `data`. Narrow with `isSubscriptionStatusTransitionWebhook()` /
    `isSubscriptionBillingWebhook()`; an unknown `type` keeps its raw string and raw `data`. The
    2.1.0 flat interface decoded a real delivery into `undefined` statuses.
-   **Error classes take an options object**: `new ValidationException(message, { fields,
    statusCode })`. Every error exposes `fields: FieldError[]` and `statusCode?: number`;
    `RateLimitException` adds `retryAfter?: number` (seconds, from `Retry-After`, delta-seconds
    or HTTP-date).
-   **Status → exception mapping**: `400`/`422` → `ValidationException`; `409` → new
    `ConflictException` (e.g. `executeTestBilling()` on a subscription not yet due); any other
    unmapped `4xx` → the base `QBitFlowError` with `statusCode` (previously
    `ValidationException`); `3xx` → `ServerException` (redirects are never followed, so the API
    key is never forwarded to another host).
-   **Retries are GET-only**, on transport failures and 5xx, with exponential back-off (1 s,
    2 s, 4 s). POST, PUT and DELETE are sent exactly once, so a checkout session or a customer
    is never created twice because a proxy timed out after the server had processed the
    request. The action GETs — `forceCancel()`, `executeTestBilling()` and
    `triggerTestClaimFunds()` — are never retried, nor is a request that could not be sent at
    all (an invalid URL, an invalid option). `maxRetries: 0` really disables retries (the
    constructor used `||`, so `0` silently became `3`; same for `timeout`).
-   **The constructor rejects a blank API key and a base URL that is not an absolute
    `http(s)://` URL.** Both used to fail later, on the first request.
-   **`users.getById(userId: number)`** — it was the only identifier typed as a string, and
    was interpolated unescaped.
-   **`CreateUserDto.role` is `AssignableUserRole`** (`UserRole.ADMIN | UserRole.USER`, or
    `'admin' | 'user'`) rather than the full `UserRole`: the API binds the field
    `oneof=admin user`, so `OWNER` or `HANDLE` was a guaranteed `400`.
-   **Client-side validation mirrors the API on every write**, with the rule set all four SDKs
    share: `alphanumspace` names 2–100 (letters, decimal digits — not `²` or `Ⅻ` — spaces and
    `- _ ' .`; a whitespace-only name is accepted, as the server does), e-mail, `role`,
    `organizationFeeBps` an integer 0–5000; `producttext` 2–100 / 2–500 (blank after Unicode
    whitespace trimming, markup and control characters rejected); a finite `price > 0` on
    products and on inline session products (the server rejects a price of 0); a bare-UUID
    `customerUUID`; for subscriptions a required `frequency` (integer 1–4294967295, known
    unit), `trialPeriod` and `minPeriods` 0–4294967295; accounting dates that are real
    `YYYY-MM-DD` calendar dates with `from <= to` (the window width is left to the API). Every
    identifier argument is guarded (`customers.update('')` used to hit the `/customer/`
    collection route). Empty optional strings (and `minPeriods: 0`) are left out of request
    bodies, and a body JSON cannot represent (`NaN`, `Infinity`, a BigInt) is rejected with a
    `ValidationException` instead of being sent as `null`.
-   **`onBehalfOf()`**: `0` means "organization level" (header omitted); a negative,
    non-integer or unsafe id throws `ValidationException`.
-   **`accounting.export()` is overloaded**: `'json'` returns `Promise<AccountingEvent[]>`,
    `'csv'` returns `Promise<string>` — the casts are no longer needed.
-   **Package layout**: the `exports` map gives each condition its own declarations
    (`import` → `dist/esm/index.d.ts`, `require` → `dist/cjs/index.d.ts`) and adds a
    `./package.json` subpath; the separate `dist/types` copy is gone. Deep imports into `dist/`
    were never part of the `exports` map.

### Removed

-   **WebSocket status stream removed** — `/transaction/status/ws` is an internal endpoint for
    the QBitFlow checkout page (it rejects non-frontend origins). Use webhooks, or poll
    `transactionStatus.get()`. This removes `transactionStatus.connectAndHandleMessages()`, the
    `StatusResponse` / `StatusResponseError` frame types, `WebSocketException`, and the `ws`
    dependency.
-   **Pay-as-you-go** — `PayAsYouGoRequests`, `PaygSubscriptionSession` (and its arm of the
    `SessionCheckout` union), and `PayAsYouGoSubscription`. The API has no PAYG routes, so none
    of it could function. The PAYG members of `TransactionType` and `TransactionShortType` are
    kept — a transaction response can still carry them.
-   **`StatusRequests`** — a second, broken transaction-status class that sent
    `transactionUUID`/`transactionType` where the API requires `txUUID`/`txType`. It was
    exported but never wired to the client. Use `client.transactionStatus`.
-   **`StatusLinkResponse`** — `executeTestBilling()` was typed to return
    `{ message, statusLink }`, but the route returns `{ message }`. It returns `SuccessResponse`.
-   The unused `convertKeysToSnakeCase` / `convertKeysToCamelCase` / `validateRequiredFields`
    helpers (internal module, never exported from the package).

### Added

-   **`client.onBehalfOf(userId)`** — a client whose every service sends `On-Behalf-Of`,
    sharing the transport and configuration (the per-service `onBehalfOf()` remains).
-   **`parseSessionWebhook(body)` / `parseSubscriptionWebhook(body)`** — decode a webhook body
    (string, Buffer, Uint8Array, ArrayBuffer or parsed JSON) with the same policy as API
    responses; `isPaymentSession()`, `isSubscriptionStatusTransitionWebhook()`,
    `isSubscriptionBillingWebhook()` type guards.
-   **`FieldError` and `error.fields`** — every field failure the API reported, with its field
    name, on every error type (previously only the first failure surfaced, as prose), and
    **`error.statusCode`**, **`ConflictException`**, **`RateLimitException.retryAfter`**.
-   **`UserRole.HANDLE` and `UserRole.OWNER`** — the enum was missing two of the four tiers
    (`handle < user < admin < owner`).
-   **`Currency.address`** — the token contract/mint address; `''` for main (native)
    currencies.
-   **`SubscriptionSession.upgradingFromTrial`** and **`isSubscriptionSession()`**.
-   **`getSession(uuid, closeToExpireError?)`** on `oneTimePayments` and `subscriptions`: pass
    `false` to read a session the API would otherwise refuse as close to expiry.
-   **`ClaimRequestResponse`** type for `claims.createRequest()` / `getRequestByUser()`.
-   The service classes (`PaymentRequests`, `CustomerRequests` …) are exported as types.
-   **`User-Agent: qbitflow-js/<version>`** on every request; **`baseUrl`** trailing slashes
    are stripped.
-   **Packaging**: `npm run smoke` packs the tarball and imports it from a Node ESM project, a
    CommonJS project and TypeScript `nodenext` / `bundler` projects, and checks that the ESM
    types reject a default import; `prepublishOnly` runs build, lint, type-check, the offline
    test suite and the smoke test — never the live suite. `CHANGELOG.md` ships in the package.

### Fixed

-   **The ESM build could not be imported.** Every relative import was written without an
    extension (`from './QBitFlow'`), which Node's ESM loader rejects with
    `ERR_MODULE_NOT_FOUND`; TypeScript projects using `moduleResolution: nodenext` lost every
    re-exported type. Every relative specifier now carries `.js`.
-   **ESM consumers got CommonJS-flavoured types** ("masquerading as CJS"): `import qb from
    'qbitflow'` type-checked and then crashed at runtime. Each `exports` condition now points at
    its own declarations.
-   **`claims.triggerTestClaimFunds()` could never have worked.** It sent the user id as a
    query parameter where the route takes a path segment (`/user/claim/funds/test-trigger/:userID`).
-   **`webhooks.verify()` reported outages as forged signatures.** A bare `catch` returned
    `false` for everything, so an unreachable API, a 5xx or an expired key was
    indistinguishable from a rejected signature. It now returns `false` only for an HTTP `400`
    (the API's "signature mismatch") and rethrows everything else as its own typed error. It
    accepts the raw body (string, Buffer, Uint8Array, ArrayBuffer) as well as parsed JSON —
    a Buffer used to be posted as `{"type":"Buffer","data":[…]}` and always "failed" — sends the
    payload exactly as received (`-0`, `{}` / `[]` preserved), and rejects invalid JSON and
    non-finite numbers with a `ValidationException` instead of an untyped `SyntaxError`.
-   **Local webhook verification is byte-identical to Go** for more inputs: object keys are
    sorted by UTF-8 byte order (not UTF-16 code units), a lone surrogate becomes U+FFFD, `-0`
    is kept, raw `Uint8Array` / `ArrayBuffer` bodies are read as bytes (they used to be
    canonicalized as `{"0":123,…}` / `{}`), and the timestamp is parsed like Go's
    `strconv.ParseInt` (`[+-]?[0-9]+`, int64 range, overflow-safe age) with a replay window
    `<= 0` meaning the default 300 s. A second set of Go-generated golden vectors pins all of
    it.
-   **The CSV export's error responses lost their details**: a `400` produced the raw JSON text
    as the message and no `fields`. The JSON error body is now parsed for both formats.
-   **Only the first validation failure was reported.** A 400 listing two bad fields surfaced
    one of them; both now appear in the message and in `fields`. Message precedence is
    `error` → joined `errors[]` → `message` → plain-text body (shortened) → HTTP status text.
-   **Identifier path segments were not escaped** at 11 call sites. A `sub@…` id or a
    reference such as `ORD/2026/17` changed the shape of the request. (References are escaped
    correctly, but the API currently cannot route a reference containing `/` — it answers
    `404`.)
-   **Session validation** allowed `productId: 0` and an inline `price` of 0, skipped
    `frequency`/`trialPeriod` value checks, and `producttext` did not reject the C1 control range
    (U+007F–U+009F) the server rejects.
-   Webhook header constants are defined once (`X-Webhook-Id`) and `TEST_WEBHOOK_ID` once.

### Documentation

-   README: a **Response Types** section (what is always present, what is nullable, zero
    values, shape errors), client-level `onBehalfOf`, the full retry list, the `/`-in-references
    caveat, webhook examples that verify the raw body first, then short-circuit the dashboard's
    test probe, then decode with the `parse*Webhook` helpers, examples that compile under
    `strict`, an error-handling table with `statusCode` / `fields` / `retryAfter`, and the Node
    baseline.
-   Examples read the API key (and optional base URL, product, customer) from the environment,
    use no placeholder customer UUIDs, look payments up by your own reference on the success
    page, and escape everything they render.
-   Tests are type-checked (`npm run typecheck`, with compile-time pinning of every response
    field's type), and `prettier --check` is part of `npm run lint`. The live suite reads
    `QBITFLOW_API_KEY` and `QBITFLOW_BASE_URL` from the environment — it never defaults to a
    URL, fails when the key is set without a base URL, and skips when neither is set.

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
