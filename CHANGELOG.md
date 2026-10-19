# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-10-19

The SDK for **QBitFlow API v2**, aligned with the final API v2 contract (api-hub `docs/api` @
`fab875c`) and with the behaviour contract the Go, JavaScript, Python and PHP SDKs 3.0.0 share
(same services, methods, errors, retries, validation and webhook verification). A major release:
the services, the routes, the ids, the money types, the errors and the webhooks change.
[MIGRATION-v3.md](MIGRATION-v3.md) maps every 2.x method and type to its replacement.

This entry describes the changes since 2.1.0, the last published release (2.5.0 was prepared
but never published; its changes are part of 3.0.0).

### ⚠️ Breaking

-   **No runtime dependencies; Node.js 20 or later.** `axios` and `ws` are dropped: requests use
    the global `fetch`, or the one passed as the `fetch` option. The package ships CommonJS and ES
    module builds, each with its own type declarations, under the same `exports` map.
-   **API v2**: the default base URL is `https://api.qbitflow.app/v2`, with its REST routes (54
    implemented, 14 services): plural collections (`/products/:uuid`, `/customers`, `/payments`,
    `/subscriptions`, `/bills/:uuid`, `/refunds`, `/wallets`, `/currencies`,
    `/checkout-sessions/…`, `/payment-failures`, `/transactions`, `/held-funds`), updates as
    `PATCH`, actions as `POST /<resource>/:uuid/<verb>`, lookups by reference as list filters, and
    every `DELETE` answering `204` with no body. `/v1` is gone.
-   **The client.** `new QBitFlow(apiKey)`, `new QBitFlow(apiKey, options)` or
    `new QBitFlow({ apiKey, ...options })`; options `baseUrl`, `timeout` (ms, now per attempt),
    `maxRetries` (`0` now disables retries; it meant the default), `onBehalfOf`, `fetch`. The key
    must be non-blank and start with `sk_`, and every option is checked: a `ValidationError`
    otherwise, and nothing is sent. `getApiKey()` and `getBaseUrl()` are removed.
-   **Ids are UUID strings.** Products are named by `uuid` (was the numeric `id`), and
    `productId` is `productUuid` everywhere; people are named by their user UUID (`userId` →
    `userUuid`). `On-Behalf-Of` takes a member's user UUID: `client.onBehalfOf(userUuid)` returns
    a client for every service (the per-service `onBehalfOf(userId: number)` is gone), and throws
    a `ValidationError` at once for a value that is not a UUID; `''` means the organization level
    and the header is then omitted (never sent blank). `organizationId` is gone from every model.
    Acronyms are words in every name (`customerUuid`, `subscriptionUuid`, `amountUsd`). Currencies
    keep numeric ids. Transaction ids are prefixed (`pay@`, `sub@`, `sub-hist@`, `refund@`,
    `transfer@`, `release@`) and every route also takes the bare UUID.
-   **Money is a decimal string, never a number**, in requests and in responses: USD amounts
    (`priceUsd`, `amountUsd`, `paidUsd`, `totalUsd`, `attemptedUsd`), token amounts (`amount`,
    `paid`, `owed`, next to their `…MinUnits`) and fee rates in percent (`feePercent`,
    `organizationFeePercent`, `refundPercent`: `'1.5'` is 1.5 %). `CreateProductParams.price` →
    `priceUsd: string`, the session params' inline `price` → `priceUsd: string`, and
    `FeeItem.amountUsd`,
    `CreateInvitationParams.organizationFeePercent` and `UpdateMemberParams.organizationFeePercent`
    are strings (no number inputs: a float can't carry `'0.1'` exactly). No `number` is left for
    money in a model or a params type.
-   **Amounts are token amounts.** `Payment.amount`, `Bill.amount`, `Transaction.amount` and
    `HeldFundsReleased.amount` are now in the currency's units (`'10'` for 10 USDC), next to
    `amountMinUnits` and the new `amountUsd` (what `amount` used to be).
-   **Users and claims become invitations, members and held funds**: `users.*` →
    `invitations.*` and `members.*` (a person exists once they accept an invitation);
    `claims.*` → `members.trust` and the held-funds reads. `apiKeys.*` is removed (keys are
    managed in the dashboard; `client.me()` describes the current key).
-   **Checkout sessions have their own service.** `oneTimePayments.createSession` and
    `subscriptions.createSession` → `checkoutSessions.createPayment` / `createSubscription`,
    returning a `CreatedCheckoutSession` (`link`, `uuid`, `expiresAt`, always set).
    `transactionStatus.get(uuid, type)` → `checkoutSessions.get(uuid)`
    (`GET /checkout-sessions/:uuid`), with four statuses (`created`, `waitingConfirmation`,
    `completed`, `expired`) and `expiresAt` while open: a failed attempt is `created` with
    `lastAttempt` set, and is never final. `client.oneTimePayments` → `client.payments`.
-   **Subscriptions.** `status` (was `subscriptionStatus`) takes `trial`, `trialExpired`,
    `active`, `pastDue`, `paused`, `stopped`, `cancelled`; `low_on_funds` and `pending` became
    `actionRequired` values (`topUpAllowance`, `raiseMaximum`, `confirmTrial`), and the `stopped`
    boolean the `stopped` status. `frequency` is a `Duration` (was seconds); `lastBillingDate` →
    `lastBilledAt`, `nextBillingDate` → `nextBillingAt`, `minimumCancellationDate` →
    `cancellableAt` (all optional, absent when they don't apply); `allowance` is an `Allowance`
    object (`amount`, `amountMinUnits`, `amountUsd`, `remainingPeriods`, `maxPerPeriod`,
    `maxPerPeriodMinUnits`) that absorbs `maxAmountPerPeriod`; `from`, `productUuid` and
    `subscriptionHash` are absent when unknown; `managementPageLink` is on the subscription
    itself. `forceCancel` (a GET) → `cancel(uuid, { immediate? })` (`POST
    /subscriptions/:uuid/cancel`; `immediate: false` cancels at the end of the paid period;
    returns `{ subscription, pending }`, `pending` for an HTTP 202); `executeTestBilling` →
    `testBill(uuid)` (`POST /subscriptions/:uuid/test-bill`, returns a `TestBill`: `billUuid`
    `sub-hist@…`, `stage`, `outcome`, `attempts`, `nextAttemptAt`); `getPaymentHistory` →
    `listBills` / `iterateBills`; `get` returns cancelled subscriptions too.
-   **The settlement.** A payment's fee split (2.x `metadata`) → `settlement`, a `Settlement`
    (`feePercent`, `organizationFee`, `referralFee`, `split`, `transaction`) on payments, bills,
    transactions and held-funds lines; `TransferSettlement` on refunds and held funds releases.
    `PaymentMetadata`, `TxMetadata`, `BlockData`, `NetworkFees`, `TxAmounts`, `TxAmountsMinUnits`
    and `TxAmountsUsd` are replaced by `Settlement`, `Split` (each part a `TokenAmount`;
    `split.platform` no longer includes the referrer's share), `SettlementTransaction`
    (`blockNumber`, `blockTime`, `gasUsed`, `fee`, `l1Fee`, `nativePriceUsd`) and
    `TransferSettlement`. `OrganizationFee.organization` and `ReferralFee.referrer` → `address`.
-   **`metadata` is now your own data**: a `Record<string, string>` on `Product`, `Customer`,
    `Payment` (copied from its checkout, read-only), `Subscription`, `Transaction` and the
    `checkout.expired` session (`{}` without any).
-   **Models renamed and retyped**: `LinkResponse` → `CreatedCheckoutSession`,
    `TransactionStatus` → `CheckoutSessionStatus`, `SubscriptionHistory` → `Bill`, `RefundEntry` →
    `Refund` (`txId` → `txUuid`), `User` → `Member`, `UserRole` → `Role`, `CursorData` → `Page`,
    `QBitFlowConfig` → `ClientConfig`; `transactionHash` → `txHash`; the `…Dto` request types →
    `…Params`. `name` → `firstName` on `Customer`, `CustomerSummary`, `Member` and `MeMember` (and
    the customer params); a payment's and a bill's `name` / `description` → `productName` /
    `productDescription`; `Product.price` → `priceUsd`; `Me.onBehalfOf` → `onBehalfOfUserUuid`;
    `Member.acceptedCurrencyIds` → `acceptedCurrencies` (`Currency[]`); `Wallet.publicKey` →
    `address`; `TokenWallet.tokenId` / `token` → `currency`; `Balance` is the `currency` plus a
    `TokenAmount` (was a code, `balance` and `balanceUsd`); `HeldFunds.totalAmount` and
    `MemberHeldFunds.totalAmount` → `totalUsd`; `LedgerEntry.amount` → `amountUsd`,
    `LedgerEntry.metadata` → `settlement`, plus `owed`; `Invitation.trustLayer` → `holdFunds`
    (and on the params, now required); the invitation create's answer is a flat
    `CreatedInvitation` (the invitation's fields and `link`); `BillingState` → `TestBill`; the
    `currencyId` fields are gone (each model carries its `currency` object). Every timestamp is an
    ISO string as sent (2.1.0 typed some as `Date`). The API never sends `null`: optional fields
    are `field?: T`, absent without a value (no `T | null` is left).
-   **The currency object** gains `code` (`BASE:USDC`) and `chain`; `address` is absent on a
    native coin; the nested `mainCurrency` is gone (`mainCurrencyId` stays).
-   **Enums** are string unions with a `const` object of the known values (PascalCase members:
    `SubscriptionStatus.PastDue`), replacing the TypeScript `enum`s with UPPER_CASE members; values
    follow the API's lowerCamelCase (`pastDue`, `trialExpired`, `createPaygSubscription`).
    `LedgerEntryType` and `AccountingEventType` `subscriptionHistory` → `bill`.
    `RefundStatus.REFUSED` → `RefundStatus.Rejected` (`rejected`); `RefundStatus` keeps `Failed`
    (declared, never set). `TransactionShortType` and `WebhookPayloadVersion.V1` are removed: v2
    is the only payload.
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
    `{ id, type, version, createdAt, test, userUuid, data }`; a version other than `v2` is
    refused. `verifyWebhookSignature(secret, timestamp, signature, payload)` →
    `webhooks.verify(rawBody, signatureHeader, secret, { tolerance, now })`;
    `client.webhooks.verify(payload, signature, timestamp)` (a boolean) →
    `client.webhooks.verifyRemote(endpointUuid, rawBody, signatureHeader)` (throws on a mismatch).
-   **Webhook events renamed and reshaped**: `refund.completed` → `refund.approved`
    (`EventType.RefundApproved`, `RefundApprovedEvent`, `router.on('refund.approved', …)`),
    `refund.denied` → `refund.rejected` (`EventType.RefundRejected`, `RefundRejectedEvent`).
    `subscription.billed`'s data is nested: `SubscriptionBilled { bill, subscription }` (the
    flattened `subscriptionReference` / `subscriptionStatus` are `subscription.reference` /
    `.status`). `subscription.created`'s data is a plain `Subscription` (the `SubscriptionCreated`
    type is gone). `subscription.upcomingBill`'s `billingDate` → `billingAt` and its `amountUsd`
    is a string. `heldFunds.released`'s `txMetadata` → `settlement`. The `checkout.expired`
    session has `priceUsd`, `amountUsd` (was `price` / `amount` numbers), `availableCurrencies`
    (was `availableCurrencyIds`), `metadata`, and `upgradingFromTrial` as a boolean.
-   **Pagination**: `getAll…({ limit, cursor })` → `list(params)` returning a `Page<T>`
    `{ items, hasMore, nextCursor? }` (`hasMore` a boolean property, no longer a method;
    `nextCursor` opaque and present only when `hasMore`), with filters, and an async iterator twin
    that stops when `hasMore` is `false`. Bounded lists (`currencies.list`, `wallets.list`,
    `wallets.listForMember`, `wallets.listAcceptedCurrencies`, `members.listHeldFunds`,
    `accounting.exportJson`) return an array (and follow a `nextCursor` should one ever claim more,
    so an export is never cut short silently). Iterators also stop on a page that claims more
    without a new cursor, or with no items (a server fault).
-   **Lookups by reference are list filters.** `products`, `customers`, `payments` and
    `subscriptions` `getByReference(reference)` run the list's `?reference=` filter and return the
    item whose `reference` equals the one asked for (exactly), or throw a `NotFoundError` (status
    404, code `not_found`) when none does — never another resource. The reference is validated.
    `customers.getByEmail` is removed: an email may match several customers
    (`customers.list({ email })`).
-   **Deletes and revokes resolve to `void`** (they resolved to the API's `{ message }`):
    `invitations.revoke` no longer returns the invitation (`204`).
-   **Renamed methods** (inside 3.0.0's preparation, before the API v2 final contract):
    `checkoutSessions.getStatus` → `get`; `payments.listCombined` / `iterateCombined` →
    `transactions.list` / `iterate` (`CombinedPayment` → `Transaction`, `CombinedPaymentSource`
    → `TransactionKind` with `payment` / `bill`, the `source` filter → `type`);
    `subscriptions.executeTestBilling` → `testBill`; `refunds.initiate` is removed
    (`InitiateRefundParams` with it: refunds are read only, below); `refunds.list` (active) and
    `listInactive` / `iterateInactive` → one `refunds.list` / `iterate` with a `status` filter;
    `wallets.listSupportedCurrencies` → `listAcceptedCurrencies` (`SupportedCurrenciesParams` →
    `AcceptedCurrenciesParams`); `currencies.listAvailable` / `listMain` → `currencies.list` with
    `main`; `products.list` and `webhooks.endpoints.list` are paginated (`Page<T>`, with
    `iterate`); `CheckoutSession` → `CreatedCheckoutSession`; `InvitationCreated` →
    `CreatedInvitation`; `MemberHeldFundsSummary` → `MemberHeldFunds`;
    `subscriptions.getPublicHistory` is removed (`listBills` has every bill).

### Added

-   `client.me()`: what the key is (role, space, mode, the member acted for), the recommended
    start-up check; `client.onBehalfOf(userUuid)`: a client acting in a member's space, sharing
    the configuration. `MeSpace` has `role`, `trustedAt`, `createdAt` and `organizationFeePercent`.
-   `checkoutSessions`: `createPayment`, `createSubscription` (with `expiresInMinutes`,
    `metadata` and the `{{UUID}}` / `{{TRANSACTION_TYPE}}` redirect placeholders), `get`,
    `expire`.
-   **Checkout fees**: `createPayment` and `createSubscription` take `fees` (`CheckoutFees`): up
    to 10 lines of your own (`FeeItem`: `label`, `description`, `amountUsd` as a decimal string)
    and `processingFee`, the customer paying QBitFlow's fee (grossed up, so you keep the price and
    your lines; left out, the dashboard's `checkout.customerPaysProcessingFee` setting decides).
    The customer pays the price plus every line, then the network fee on top; test mode caps that
    amount, fees included, at `'5'`. A subscription's are locked with its price: every bill
    charges both. Checked client-side (10 lines, `label` 1 to 40 one-line characters,
    `description` at most 200, `amountUsd` above 0, at most 1,000,000, 2 decimals) with field
    errors on `fees.items[i].<field>`, after the terms'. `Payment.priceUsd` and `fees`,
    `Subscription.fees`, `Transaction.priceUsd` and `fees`, `FeeLine` and the open enum
    `FeeLineType` (`custom`, `processingFee`).
-   Merchant `metadata` (`Record<string, string>`) on `CreateProductParams` /
    `UpdateProductParams`, `CreateCustomerParams` / `UpdateCustomerParams`, both session creates,
    and `subscriptions.update` (`PATCH /subscriptions/:uuid`, `UpdateSubscriptionParams`): merged
    on the updates, a key set to `''` deleting it.
-   `transactions.list` / `iterate` (`GET /transactions`): the feed of payments and bills, each a
    `Transaction` with its `type`, filtered by `type`, `subscriptionUuid`, `refunded` and the
    shared filters.
-   `payments.list` with filters (customer, product, dates, `reference`, `refunded`,
    `includeMembers` / `userUuid`); `payments.get` with `{ includeMembers }`. `failures.list`:
    the failed payment attempts (`attempted`, `attemptedUsd`, `currency`).
-   `products.list` / `iterate` (paginated: `limit`, `cursor`, `includeHidden`, `subscription`,
    `reference`) and subscription products; `customers.list` / `iterate` (`email`, `reference`,
    `verified`).
-   `subscriptions.list` (status, reference and the shared filters), `update`, `listBills`,
    `getBill` (`GET /bills/:uuid`); `Subscription.currentPeriodEnd` (grant access while now is
    before it), `actionRequired`, `priceUsd`, `cancellationReason`, `dunning`, `metadata`,
    `managementPageLink`; `Allowance`.
-   `refunds.list` / `iterate` (`status` (repeatable), `txUuid`, `held`, `includeMembers`,
    `userUuid`), and `refunds.get` (`GET /refunds/:uuid`), read only: a customer's request is
    answered, and a merchant's own refund sent, from the dashboard (the merchant's is recorded only
    once its transfer confirmed, `approved`: `refund.approved` is its only event). A `Refund`
    carries `paid`, `amount`, its `currency` and, once approved, its `settlement`.
-   `members` (`list`, `get`, `update`, `remove`, `trust`, `listHeldFunds`, `getHeldFunds`,
    `getOwnHeldFunds`) and `invitations` (`create`, `list`, `revoke`) for marketplaces.
-   `wallets` (`list` with balances, `listForMember`, `listAcceptedCurrencies`),
    `accounting.exportJson` / `exportCsv`, `currencies.list` / `get`.
-   `TokenAmount` (`amount`, `amountMinUnits`, `amountUsd`), the shape of every token amount.
-   `webhooks.endpoints` (`list` / `iterate` paginated, `create` with the secret shown once, `get`,
    `update`, `delete`) and `webhooks.events` (the event log: `list`, `iterate`, `get` with its
    deliveries).
-   Webhook verification without a client: `import { webhooks } from 'qbitflow'` with `verify`,
    `constructEvent`, `parseEvent`, the type guards `isEventType`, `isUnknownEvent`,
    `isSubscriptionSession`, `eventData`, and the header constants `SIGNATURE_HEADER`,
    `EVENT_ID_HEADER`, `EVENT_TYPE_HEADER`, `WEBHOOK_VERSION_HEADER`. The body may be a string, a
    `Buffer` or a `Uint8Array`, the header Node's raw `string | string[] | undefined`. Every `v1=`
    signature is checked, so a secret rotation needs nothing on the receiver's side.
-   Typed events: `Event`, a union of one type per event (`PaymentCompletedEvent`,
    `SubscriptionBilledEvent`, `RefundApprovedEvent`, `MemberJoinedEvent`,
    `CheckoutExpiredEvent`… 15 types) and `UnknownEvent` for the others; `EventType` constants.
-   An async iterator next to every paginated list (`for await`): `iterate`, `iterateBills`.
-   Retries: reads and the 6 creates are retried on network errors, timeouts, 5xx, 429 (after
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
    is sent on failure): names, texts, references (also on the `reference` filters and
    `getByReference`), emails (also the customers' `email` filter), phones, URLs, USD amounts as
    strings (at most 2 decimals, above 0, at most 1,000,000), percents as strings (at most 2
    decimals and 16 characters; `organizationFeePercent` 0 to 50, required on
    `UpdateMemberParams`), metadata (at most 50 keys of 1 to 40 of
    `A-Z a-z 0-9 _ - . :`, values of at most 500 characters without control or bidirectional
    characters), durations, cursors (at most 200 characters), the refunds' `status` filter (at
    most 5 known statuses), the transactions' `type`, the `release@` transaction prefix, and a
    clearable `UpdateCustomerParams.lastName`.
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
        polls `checkoutSessions.get` until `completed` or `expired` (the last status seen at the
        timeout), for scripts, tests and back-office jobs.
    -   `hasAccess(subscription, at?)`: `currentPeriodEnd` set and `at < currentPeriodEnd`.
    -   `formatAmount(minUnits, decimals)` / `parseAmount(amount, decimals)`: exact conversions
        between min units and decimal strings (string arithmetic, never floats).
    -   `accounting.exportJsonRange` / `exportCsvRange`: exports over any range, split into
        windows of at most 92 days, both ends included (`[from, from + 91 d]`), and concatenated
        (the CSV header once).
    -   `QBitFlow.fromEnv(config?)`: a client from `QBITFLOW_API_KEY`, `QBITFLOW_BASE_URL` and
        `QBITFLOW_ON_BEHALF_OF`, explicit options overriding them.
    -   `Placeholders.UUID` / `Placeholders.TRANSACTION_TYPE`: the redirect placeholders.
-   Examples: `checkout.ts`, `subscriptions.ts`, `marketplace.ts`, `webhook-handler.ts` (built on
    the webhook router), `errors-and-retries.ts`; `MIGRATION-v3.md`; README "Integration
    recipes" (Next.js, Express, Hono and Workers, plain Node).
-   Website snippets `transactions-list`, `subscriptions-update` and `refunds-get` (new ids; none
    renamed). `refunds-create` is listed as unsupported (refunds are read only; the id stays in the
    website's catalog, marked retired).

### Changed

-   `AccountingEvent` follows the API's export: amounts in the currency's units as decimal
    strings, each with its `…MinUnits` twin (`grossAmountMinUnits`, `platformFeeMinUnits`,
    `referralFeeMinUnits`, `organizationFeeMinUnits`, `netAmountMinUnits`,
    `networkFeesMinUnits`); USD amounts and rates as decimal strings; `currency` (was
    `tokenSymbol`), `currencyPriceUsd`, and the network fees apart from the net
    (`networkFeesPaidBy`, the open enum `NetworkFeesPayer`: `payer`, `merchant`, `organization`;
    `networkFees`, `networkFeesCurrency`, `networkFeesCurrencyDecimals`,
    `networkFeesCurrencyPriceUsd`, `networkFeesUsd`). `paymentReference` /
    `relatedPaymentReference` → `reference` / `relatedReference`, `paymentUuid` /
    `relatedPaymentUuid` → `txUuid` / `relatedTxUuid`; a fee that doesn't apply is absent (was
    `'0'`). Its fields are in the CSV's column order; the always-empty `userName`,
    `userLastName`, `customerName` and `customerLastName` are gone. The export window is at most
    92 days, both ends included.
-   Responses are decoded against their type at runtime: a field the API leaves out gets its zero
    value (or `undefined` when optional); a value of the wrong JSON type is a `ServerError` (a
    JSON number where a decimal string is expected included). Unknown enum values are kept as is,
    decimal strings are never parsed, timestamps keep the offset the API sends. Every answer is a
    JSON object: a `null` body is a `ServerError`.
-   Redirects are never followed: a 3xx is a `ServerError` (axios replayed the request, API key
    included, against the redirect's target).
-   A 2xx with an empty or non-JSON body where a result is expected is a `ServerError`, not an
    empty result.
-   A request body JSON cannot represent (NaN, ±Infinity, a lone surrogate) is a
    `ValidationError`, and nothing is sent.
-   Update params send an explicit `''` for the clearable fields
    (`UpdateCustomerParams.lastName` / `phoneNumber` / `address`,
    `UpdateProductParams.description`, `UpdateWebhookEndpointParams.description`): `''` clears
    them, a field left out is unchanged.
-   The event log's cursor is opaque (was an event id); the subscriptions' `status` and the event
    log's `type` filters are sent as given (the API checks them).
-   `CustomerSummary.deleted` and `DeliveryAttempt.skipped` are booleans.
-   Error messages read `<message> (status <status>, code <code>, request <requestId>)`,
    followed by each field error; the SDK's own validation messages never echo the rejected
    values. `instanceof` matches across the CommonJS and ES module builds.

### Removed

-   `PayAsYouGoRequests` (the API has no pay-as-you-go routes), `users`, `claims`, `apiKeys`,
    `transactionStatus` (and its WebSocket stream `connectAndHandleMessages`),
    `oneTimePayments.getSession`, `subscriptions.getSession`,
    `oneTimePayments.getCustomerForTransaction` (read `payment.customerUuid`, then
    `customers.get`), `refunds.getByTransaction` (read `payment.refund` / `bill.refund`, or
    `refunds.list({ txUuid })`), `customers.getByEmail` (`customers.list({ email })`),
    `subscriptions.getPaymentHistory` and the public bill history (the customer's page;
    `listBills` has every bill).
-   The v1 webhook verifier: `canonicalJson`, `computeWebhookSignature`,
    `verifyWebhookSignature`, `extractWebhookHeaders`, `WebhookHeaders`, `VerifyWebhookOptions`
    (including `skipTimestampCheck`), `DEFAULT_MAX_TIMESTAMP_AGE_SECONDS`, `TEST_WEBHOOK_ID`, the
    `HEADER_*` constants and the `client.webhooks` header getters, and the v1 payloads
    `SessionWebhookResponse` and `SubscriptionStatusTransitionWebhook`.
-   `OneTimePaymentSession`, `SubscriptionSession`, `PaygSubscriptionSession`, `SessionCheckout`,
    `StatusLinkResponse`, `StatusResponse`, `StatusResponseError`, `SuccessResponse`,
    `ErrorResponse`, `Organization`, `ApiKey`, `ClaimFunds`, `TransactionShortType`,
    `CursorDataResponse`, `getCursorData`; `legacyId` is not modelled.

### Fixed

-   **Field validation errors were read from the wrong key** (a top-level `errors` list instead
    of the API's `details.errors`), so the fields of a 400 were lost. `fieldErrors` now names each
    failing input by the name sent, dotted when nested (`frequency.unit`).
-   User-supplied path segments and query values are escaped: an id containing `/`, `?`, `#`,
    `%` or `&` no longer changes the request, and a segment that is exactly `.` or `..` is
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
