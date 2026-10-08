# Migrating from 2.x to 3.0.0

3.0.0 is the JavaScript/TypeScript SDK for **QBitFlow API v2**. API v2 reorganises the platform
around spaces (an organization's, and one per member), invites people instead of provisioning
them, names every resource by a UUID and signs webhooks with a new scheme. The SDK follows: a new
`checkoutSessions` service, new names for most methods and types, typed errors, and no runtime
dependency.

API v1 keeps running next to v2, **against the same data**, for some weeks after v2 ships: your
2.x integration keeps working meanwhile, so you can move one part at a time. 2.x talks to `/v1`
only; 3.0.0 talks to `/v2` only.

This guide maps everything 2.1.0 exposed (the last 2.x release) to 3.0.0; the
[last section](#names-from-the-unreleased-250) covers the names of the unreleased 2.5.0. The
[README](README.md) documents 3.0.0 in full; [CHANGELOG.md](CHANGELOG.md) lists every change.

Blocks marked `// 2.x` show the old code; every other block is 3.0.0 and type-checks against it.

## Checklist

1. [Install, runtime and imports](#1-install-runtime-and-imports): Node.js 20, no `axios` or `ws`.
2. [Base URL and API keys](#2-base-url-and-api-keys): `/v2`; rotate pre-v2 keys.
3. [The client](#3-the-client): the same constructor, a validated key, `client.onBehalfOf(userUuid)`.
4. [Request options](#4-request-options) on every method: `onBehalfOf`, `idempotencyKey`, `requestId`, `signal`.
5. [Method map](#5-method-map): every 2.x method and its replacement.
6. [Ids are UUID strings](#6-ids-are-uuid-strings): products, members, `On-Behalf-Of`.
7. [Users and claims become invitations, members and the trust layer](#7-users-and-claims-become-invitations-members-and-the-trust-layer).
8. [Models](#8-models): renamed types and fields, fees as percents.
9. [Enums and statuses](#9-enums-and-statuses): `const` objects, lowerCamelCase values.
10. [Errors](#10-errors): one class per condition, `status`, `code`, field errors that work.
11. [Webhooks](#11-webhooks): `QBitFlow-Signature` over the raw body, typed events, v2 endpoints.
12. [Pagination](#12-pagination): params objects, `hasMore` a property, async iterators.
13. [Before and after](#13-before-and-after-six-common-tasks): six common tasks.

## 1. Install, runtime and imports

```bash
npm install qbitflow@^3
```

- **Node.js 20 or later** (2.1.0 declared Node 14). The package is server-side only.
- **No runtime dependencies.** `axios` is gone: requests use the global `fetch` (inject another
  with the `fetch` option). `ws` is gone with the WebSocket status stream.
- The package name and the entry points are unchanged: `import { QBitFlow } from 'qbitflow'`
  (ES modules, TypeScript) and `require('qbitflow')` (CommonJS). Each build ships its own types.
- Webhook helpers moved into a namespace: `import { webhooks } from 'qbitflow'`
  (`webhooks.verify`, `webhooks.constructEvent`, `webhooks.parseEvent`, …), usable without a client.

## 2. Base URL and API keys

- The default base URL is `https://api.qbitflow.app/v2`. If you set `baseUrl`, it must point at v2.
- API v2 issues keys shaped `sk_<uuid>_<test|live>_<secret>`. **Keys issued before** (`sk_<digits>_…`)
  **still authenticate**: rotate them in the dashboard when you move to v2. Treat a key as opaque.
- The constructor refuses a blank key, or one not starting with `sk_`, with a `ValidationError`
  (2.1.0 threw a plain `Error` for a missing key only, and sent any other value). It sends nothing:
  call `await client.me()` to check the key online, and assert its mode (`me.space?.test`) at
  start-up.
- A key belongs to one space and one mode. A removed member's keys answer 401.

## 3. The client

| 2.x | 3.0.0 |
|---|---|
| `new QBitFlow(apiKey)` | `new QBitFlow(apiKey)`, or `new QBitFlow(apiKey, options)` |
| `new QBitFlow({ apiKey, baseUrl, timeout, maxRetries })` (`QBitFlowConfig`) | the same (`ClientConfig`; the options alone are `ClientOptions`) |
| `timeout` (`0` meant the default) | `timeout`: each attempt, in ms (default 30000, must be positive); bound the whole call, retries included, with a `signal` |
| `maxRetries` (`0` meant the default: 3) | `maxRetries` (default 3); **`0` disables retries** |
| every method retried on 5xx and network errors, POSTs included | only reads and the 7 idempotent creates are retried ([README](README.md#retries-and-idempotency)) |
| — | `onBehalfOf` and `fetch` options |
| `client.<service>.onBehalfOf(userId: number)` | `client.onBehalfOf(userUuid: string)` (a client for every service), or the `{ onBehalfOf }` request option |
| `client.getApiKey()`, `client.getBaseUrl()` | removed: keep your own configuration; `await client.me()` describes the key |
| `client.oneTimePayments`, `client.transactionStatus` | `client.checkoutSessions`, `client.payments`, `client.failures` (§ 5) |
| `client.users`, `client.claims`, `client.apiKeys` | `client.members`, `client.invitations`; API keys are managed in the dashboard (§ 7) |
| — | `client.wallets`, `client.webhooks.endpoints`, `client.webhooks.events`, `client.me()` |

Reads and creates are retried automatically: drop any retry loop you wrapped around them, or set
`maxRetries: 0`. A client's configuration never changes after construction.

## 4. Request options

Every method takes optional request options as its last argument:

```ts
const payment = await client.payments.get('pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f', undefined, {
	onBehalfOf: '0192f1c2-7b3a-7c4d-9e5f-6a7b8c9d0e1f', // a member's space, this call only
	requestId: 'support-ticket-981', // X-Request-Id, echoed in errors
	signal: AbortSignal.timeout(15_000), // cancels the call, its retries and its waits
});
console.log(payment.amount);
```

`idempotencyKey` sets the `Idempotency-Key` of a create (see the README).

## 5. Method map

Params named `…Params` are TypeScript interfaces exported by the package; a params object that is
optional may be left out.

### Checkout sessions and status (2.x `oneTimePayments`, `subscriptions`, `transactionStatus`)

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `oneTimePayments.createSession(CreatePaymentSessionDto)` | `checkoutSessions.createPayment(CreatePaymentSessionParams)` | `productId` (number) → `productUuid` (string); `customerUUID` → `customerUuid`; new `expiresInMinutes` and `fees`; returns a `CheckoutSession` (`uuid`, `link`, `expiresAt`) |
| `subscriptions.createSession(CreateSubscriptionSessionDto)` | `checkoutSessions.createSubscription(CreateSubscriptionSessionParams)` | `frequency`, `trialPeriod` (`Duration`) and `minPeriods` are each optional over a subscription product's terms |
| `transactionStatus.get(uuid, transactionType)` | `checkoutSessions.getStatus(uuid)` | no type argument; four statuses (§ 9) |
| `transactionStatus.connectAndHandleMessages(uuid, type, handler)` | removed | the WebSocket is the checkout page's: use webhooks, or poll `getStatus` |
| `oneTimePayments.getSession(uuid)`, `subscriptions.getSession(uuid)` | removed | `getStatus` for the state; the session's data comes with `checkout.expired` |
| — | `checkoutSessions.expire(uuid)` | new: end an unpaid session |

### Payments (2.x `oneTimePayments`)

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `oneTimePayments.get(uuid)` | `payments.get(uuid, ReadParams?)` | `pay@…` or the bare UUID; `{ includeMembers: true }` reads a member's row |
| `oneTimePayments.getByReference(ref)` | `payments.getByReference(ref)` | |
| `oneTimePayments.getAll({ limit, cursor })` | `payments.list(PaymentListParams?)`, `payments.iterate` | filters: customer, product, dates, `refunded`, `includeMembers` / `userUuid` |
| `oneTimePayments.getAllCombined({ limit, cursor })` | `payments.listCombined(CombinedPaymentListParams?)`, `payments.iterateCombined` | + `source`, `subscriptionUuid` |
| `oneTimePayments.getCustomerForTransaction(txUuid)` | removed | `payment.customer` (a summary), or `customers.get(payment.customerUuid)` |
| — | `failures.list`, `failures.iterate` | new: the failed payment attempts |

### Subscriptions (and the 2.x pay-as-you-go remnants)

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `subscriptions.get(uuid)` | `subscriptions.get(uuid, ReadParams?)` | cancelled subscriptions are returned too: a 404 no longer means "cancelled" |
| `subscriptions.getByReference(ref)` | `subscriptions.getByReference(ref)` | |
| `subscriptions.getPaymentHistory(uuid)` | `subscriptions.listBills(uuid, BillListParams?)` / `iterateBills`, or `getPublicHistory(uuid)` | `listBills` pages every full bill; `getPublicHistory` is the public route (10 latest, merchant-only fields empty) |
| `subscriptions.forceCancel(uuid)` (a GET returning `{ message }`) | `subscriptions.cancel(uuid, CancelSubscriptionParams?)` | a POST now, never retried; returns `{ subscription, pending }` (`pending`: HTTP 202, still confirming on-chain); `{ immediate: false }` cancels at the end of the paid period |
| `subscriptions.executeTestBilling(uuid)` (a GET returning `{ message, statusLink }`) | `subscriptions.executeTestBilling(uuid)` | a POST; returns the bill's `BillingState`; `409 payment_not_due` before `nextBillingDate` |
| — | `subscriptions.list`, `iterate`, `getBill` | new |
| `PayAsYouGoRequests` (`getSession`, `get`, `getByReference`, `getPaymentHistory`, `forceCancel`, `executeTestBilling`, `increaseUnitsCurrentPeriod`; shipped but never wired to the client), `PaygSubscriptionSession` | removed | the API has no pay-as-you-go routes |

### Refunds

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `refunds.getAll()` | `refunds.list(RefundListParams?)` | the refunds awaiting an answer; from the organization's space the members' are included by default (`{ includeMembers: false }` leaves them out); `held` filter |
| `refunds.getAllInactive({ limit, cursor })` | `refunds.listInactive(RefundListParams?)`, `refunds.iterateInactive` | |
| `refunds.getByTransaction(txUuid)` | removed | `payment.refund` / `bill.refund` (a `RefundSummary`), or the lists |
| — | `refunds.initiate(InitiateRefundParams)` | new: a pending refund you sign in the dashboard |

### Customers and products

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `customers.create(CreateCustomerDto)` | `customers.create(CreateCustomerParams)` | `lastName` optional |
| `customers.get`, `getByEmail`, `getByReference` | same names | |
| `customers.update(uuid, UpdateCustomerDto)` | `customers.update(uuid, UpdateCustomerParams)` | a field left out is unchanged; `phoneNumber: ''` or `address: ''` now **clears** it |
| `customers.delete(uuid)` → `{ message }` | `customers.delete(uuid)` → `void` | |
| `customers.getAll({ limit, cursor })` | `customers.list(CustomerListParams?)`, `customers.iterate` | filters `email`, `verified` |
| `products.create(CreateProductDto)` | `products.create(CreateProductParams)` | `description` optional; `subscription` terms make a subscription product |
| `products.get(id: number)` | `products.get(uuid: string)` | |
| `products.getAll()` | `products.list(ProductListParams?)` | `includeHidden`, `subscription` |
| `products.getByReference(ref)` | `products.getByReference(ref)` | the reference is now percent-encoded |
| `products.update(id, UpdateProductDto)` | `products.update(uuid, UpdateProductParams)` | + `isActive`, `subscription`, `removeSubscription`; `description: ''` is sent |
| `products.delete(id)` → `{ message }` | `products.delete(uuid)` → `void` | |

### Users, claims and API keys (→ § 7)

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `users.create(CreateUserDto)` | `invitations.create(CreateInvitationParams)` | not a rename: the person exists once they accept (`member.joined`) |
| `users.getAll()` | `members.list(MemberListParams?)`, `members.iterate` | |
| `users.getById(id)` | `members.get(userUuid)` | |
| `users.getByEmail(email)` | removed | iterate `members` and match `member.email` |
| `users.update(id, UpdateUserDto)` | `members.update(userUuid, UpdateMemberParams)` | only the organization fee: names and emails are the person's own |
| `users.delete(id)` | `members.remove(userUuid)` | ends the membership (`409 held_funds_pending` while you hold their funds) |
| `users.get()` | `client.me()` | what the key is: its role, space and mode |
| `claims.createRequest(userId)`, `claims.getRequestByUser(userId)` | `invitations.create`, `invitations.list` / `iterate` | the invitation link replaces the claim link |
| `claims.getFunds()` | `members.listHeldFunds()`, `members.getHeldFunds(userUuid)`, `members.getOwnHeldFunds()` | |
| `claims.triggerTestClaimFunds(userId)` | removed | release held funds in the dashboard; `members.trust(userUuid)` pays new payments directly |
| `apiKeys.getAll()`, `apiKeys.getForUser(userId)` | removed | keys are managed in the dashboard; `client.me()` describes the current one |
| — | `invitations.revoke`, `members.trust` | new |

### Wallets, accounting, currencies

| 2.x | 3.0.0 | Notes |
|---|---|---|
| — | `wallets.list(WalletListParams?)`, `wallets.listForMember(userUuid)`, `wallets.listSupportedCurrencies(SupportedCurrenciesParams?)` | new |
| `accounting.export(from, to, 'json')` | `accounting.exportJson(from, to)` → `AccountingEvent[]` | dates `YYYY-MM-DD`; the API allows 95 days at most |
| `accounting.export(from, to, 'csv')` | `accounting.exportCsv(from, to)` → `string` | the same export as CSV text |
| `currencies.getAllAvailable(test)` | `currencies.listAvailable({ test })` | |
| `currencies.getAllMain(test)` | `currencies.listMain({ test })` | |
| — | `currencies.get(id)` | new |

### Webhooks (→ § 11)

| 2.x | 3.0.0 | Notes |
|---|---|---|
| `verifyWebhookSignature(secret, timestamp, signature, payload, options)` | `webhooks.verify(rawBody, signatureHeader, secret, options?)` (also `client.webhooks.verify`) | the arguments are reordered; returns nothing or throws a `WebhookSignatureError` (2.x threw a `ValidationException`) |
| — | `webhooks.constructEvent(rawBody, signatureHeader, secret, options?)`, `webhooks.parseEvent(rawBody)` | verify and parse into a typed `Event` |
| `client.webhooks.verify(payload, signature, timestamp)` → `Promise<boolean>` | `client.webhooks.verifyRemote(endpointUuid, rawBody, signatureHeader)` → `Promise<void>` | resolves when valid; a mismatch rejects with a `WebhookSignatureError` (reason `invalidSignature`), other failures with their own error instead of `false` |
| `computeWebhookSignature`, `canonicalJson` | removed | the signature covers the raw body |
| `extractWebhookHeaders(headers)`, `WebhookHeaders` | removed | pass `req.headers['qbitflow-signature']` to `webhooks.verify` (a string, a `string[]` or `undefined` is accepted); the dashboard's test is a `webhook.test` event |
| `HEADER_SIGNATURE`, `HEADER_TIMESTAMP`, `HEADER_WEBHOOK_ID`; `client.webhooks.signatureHeader`, `timestampHeader`, `webhookIdHeader` | `webhooks.SIGNATURE_HEADER`, `webhooks.EVENT_ID_HEADER`, `webhooks.EVENT_TYPE_HEADER`, `webhooks.WEBHOOK_VERSION_HEADER` | the timestamp is inside `QBitFlow-Signature` |
| `TEST_WEBHOOK_ID`, `client.webhooks.testWebhookId` | `EventType.WebhookTest` (`webhook.test`) | |
| `VerifyWebhookOptions { maxTimestampAgeSeconds, nowSeconds, skipTimestampCheck }`, `DEFAULT_MAX_TIMESTAMP_AGE_SECONDS` | `VerifyOptions { tolerance, now }`, `webhooks.DEFAULT_TOLERANCE` | `tolerance` in seconds; `now` a `Date` or a function returning one; the timestamp check can no longer be skipped |
| `SessionWebhookResponse`, `SubscriptionStatusTransitionWebhook` | `Event` (`PaymentCompletedEvent`, `SubscriptionStatusChangedEvent`, …) | § 11 |
| — | `client.webhooks.endpoints.*`, `client.webhooks.events.*` | new: endpoints and the event log |

### Errors and helpers (→ § 10)

| 2.x | 3.0.0 |
|---|---|
| `QBitFlowError` | `QBitFlowError` (the base), and `ApiError` (the base of every concrete class, with `status`, `code`, `details`, `requestId`, `fieldErrors`, `rawBody`) |
| `NotFoundException`, `UnauthorizedException`, `ForbiddenException`, `ValidationException`, `RateLimitException`, `ServerException`, `NetworkException` | `NotFoundError`, `AuthenticationError`, `PermissionDeniedError`, `ValidationError` / `BadRequestError`, `RateLimitError`, `ServerError`, `NetworkError` |
| `WebSocketException` | removed |
| `CursorData`, `CursorDataResponse`, `getCursorData` | `Page<T>` (§ 12) |
| `VERSION` (`'2.1.0'`) | `VERSION` (`'3.0.0'`), also sent in `User-Agent: qbitflow-js/3.0.0` |

## 6. Ids are UUID strings

Every id but a currency's is a UUID string now, and no resource names its organization:

- **Products:** `Product.id: number` → `Product.uuid: string`; `productId` → `productUuid` on
  payments, bills, subscriptions, sessions and the accounting export; checkouts take `productUuid`.
- **Members and `On-Behalf-Of`:** a member is named by their **user UUID** (`Member.userUuid`).
  `onBehalfOf(123)` becomes `client.onBehalfOf('0192f1c2-…')`; a number, or a string that is not a
  UUID, throws a `ValidationError`. `userId` → `userUuid` everywhere (absent on the organization's
  own rows).
- **`organizationId` is gone** from every model; `(await client.me()).space?.organizationUuid`
  names the organization.
- **Acronyms are words:** `customerUUID` → `customerUuid`, `subscriptionUUID` → `subscriptionUuid`,
  `mainCurrencyPriceUSD` → `mainCurrencyPriceUsd`, `TxAmountsUSD` → `TxAmountsUsd`.
- **Transactions** keep their prefixed ids (`pay@…`, `sub@…`, `sub-hist@…`, `refund@…`), as opaque
  strings. `txId` → `txUuid`, `transactionHash` → `txHash`.

**Map the numeric ids you stored** before v1 is turned off: list your products
(`client.products.list({ includeHidden: true })`, in each space you act in) and match them on
`reference`, which did not change, and your members (`client.members.iterate()`, in each mode) on
`email`; store the UUIDs next to your old ids. The SDK does not expose the API's temporary
`legacyId` field.

## 7. Users and claims become invitations, members and the trust layer

v1 provisioned sellers (`users.create`) and could sell for them at once, the seller claiming the
account and its funds later. **v2 creates no accounts: a seller sells only once they accepted an
invitation.**

1. `client.invitations.create({ email, trustLayer, organizationFeePercent, redirectUrl })` returns
   the invitation and its link (also emailed).
2. Wait for the `member.joined` webhook and store its `userUuid` (match `invitationUuid`).
3. Sell with `client.onBehalfOf(userUuid)`.

`trustLayer: true` (the v1 "claim" model) holds the seller's payments in your wallet until you
trust them: `members.getHeldFunds` shows what you owe, `members.trust` makes new payments go to
the seller directly, and the release of what is held is signed in the dashboard. Sellers v1
provisioned are already members; those who never claimed are members whose funds you hold
(`trustedAt === null`). The [README](README.md#marketplaces) walks the flow.

## 8. Models

Fee rates are **percents** now, everywhere: `feeBps: 150` → `feePercent: 1.5`,
`organizationFeeBps: 250` → `organizationFeePercent: 2.5`, `ReferralFee.feeBps` → `feePercent`.

Responses are **decoded against their type at runtime**: a required field the API leaves out gets
its zero value (`''`, `0`, `false`, `[]`), an optional one is `undefined`, a value of the wrong JSON
type is a `ServerError`. **Timestamps are ISO strings** exactly as sent (2.1.0 typed some as
`Date` although they were strings at runtime); decimal amounts stay strings.

| 2.x | 3.0.0 | What changed |
|---|---|---|
| `QBitFlowConfig` | `ClientConfig` / `ClientOptions` | + `onBehalfOf`, `fetch` |
| `LinkResponse` | `CheckoutSession` | + `expiresAt` |
| `StatusLinkResponse` | `BillingState` | `executeTestBilling` returns the bill's state |
| `TransactionStatus` | `CheckoutSessionStatus` | `status` is a `CheckoutSessionStatusValue`; + `uuid`, `lastAttempt`; `settlementDetails` removed |
| `OneTimePaymentSession`, `SubscriptionSession`, `PaygSubscriptionSession`, `SessionCheckout` | `PaymentSessionData`, `SubscriptionSessionData` | only in `checkout.expired`; `productId` → `productUuid`, `availableCurrencies` → `availableCurrencyIds`, `frequency` a `Duration` (was seconds); the fee and organization fields are gone |
| `CreatePaymentSessionDto` | `CreatePaymentSessionParams` | `productId` → `productUuid`; `customerUUID` → `customerUuid`; + `expiresInMinutes` |
| `CreateSubscriptionSessionDto` | `CreateSubscriptionSessionParams` | `frequency` optional (the product's by default) |
| `Payment` | `Payment` | `transactionHash` → `txHash`; `productId` → `productUuid`; `customerUUID` → `customerUuid` (optional); `organizationId` removed; `userId` → `userUuid`; `metadata` always present; `currency: Currency \| null`; + `chain`, `explorerUrl`, `customerReference`, `customer`, `refund`, `refundable`, `notRefundableReason`, `paidMinUnits`, `paidUsd`, `confirmedAt`, `note`, `checkoutOpenedAt`, `price`, `fees` (`amount` is now the price plus the checkout's fees) |
| `CombinedPayment` | `CombinedPayment` | `source` `'subscription_history'` → `'subscriptionHistory'`; `subscriptionUUID` → `subscriptionUuid`; the `Payment` renames; + `reference`, `subscriptionReference`, `refund`, `refundable` |
| `Subscription` | `Subscription` | `subscriptionStatus` → `status`; `stopped: boolean` → the status `stopped`; `frequency: number` (seconds) → `Duration`; `productId` → `productUuid`; `customerUUID` → `customerUuid`; `nextBillingDate` optional (absent once cancelled); + `currentPeriodEnd`, `actionRequired`, `priceUsd`, `maxAmountPerPeriod`, `cancelledAt`, `cancellationReason`, `customerReference`, `customer`, `dunning` |
| `SubscriptionHistory` | `Bill` | the `Payment` renames; `subscriptionUUID` → `subscriptionUuid`; + `periodStart`, `periodEnd` |
| `RefundEntry` | `Refund` | `txId` → `txUuid`; + `initiatedBy`, `refundPercent`, `paidMinUnits`, `paidUsd`, `amountUsd`, `currencyId`, `held`, `chain`, `explorerUrl`, `approval`, `customer` |
| `Customer` | `Customer` | `createdAt` a string; `lastName` optional; + `verified`, `userUuid`; `organizationId` removed |
| `CreateCustomerDto`, `UpdateCustomerDto` | `CreateCustomerParams`, `UpdateCustomerParams` | |
| `Product` | `Product` | `id: number` → `uuid: string`; `createdAt` a string; `reference` always present; + `subscription`, `paymentLink`, `userUuid` |
| `CreateProductDto`, `UpdateProductDto` | `CreateProductParams`, `UpdateProductParams` | + subscription terms, `isActive`, `removeSubscription` |
| `User` | `Member` (or `Me`) | `id` → `userUuid`; `organizationFeeBps` → `organizationFeePercent`; `claimedAt` → `trustedAt` (`string \| null`); + `joinedAt`, `acceptedCurrencyIds`, `spaceUuid`, `test` |
| `CreateUserDto`, `UpdateUserDto` | `CreateInvitationParams`, `UpdateMemberParams` | |
| `ClaimFunds` | `MemberHeldFundsSummary`, `HeldFunds` | |
| `AccountingEvent` | `AccountingEvent` | `paymentId` → `paymentUuid`; `relatedPaymentId` → `relatedPaymentUuid`; `productId: number` → `productUuid: string`; `customerUUID` → `customerUuid`; `type` and `chain` typed; the empty fields of a row are optional; + `userUuid`, the referral fee, member and customer names |
| `PaymentMetadata` | `PaymentMetadata` | `feeBps` → `feePercent`; `txAmounts: TxAmountsFull` → `TxAmounts` (`TxAmountsUSD` → `TxAmountsUsd`); + network fees |
| `OrganizationFee { organizationId, organization, feeBps }` | `OrganizationFee { organization, feePercent }` | |
| `ReferralFee { referralId, referrer, feeBps, deadline }` | `ReferralFee { referrer, feePercent, deadline }` | |
| `Currency` | `Currency` | + `address`; `mainCurrency: Currency \| null` |
| `Duration { value, unit }` | `Duration { value, unit? }` | `unit` required when `value > 0`; `value: 0` means none |
| `ApiKey`, `Organization`, `StatusResponse`, `StatusResponseError`, `SuccessResponse`, `ErrorResponse`, `ClaimRequestResponse` | removed | |

Each service's class is exported as a type: `CheckoutSessionsService`, `PaymentsService`, … (2.x
`PaymentRequests`, …).

## 9. Enums and statuses

2.x enums were TypeScript `enum`s with UPPER_CASE members. 3.0.0 exports, for each enum, a string
union **and** a `const` object of the known values with PascalCase members; values follow the
API's lowerCamelCase, and a value the SDK does not know yet is kept as is. Plain strings work too:
`sub.status === 'pastDue'` and `sub.status === SubscriptionStatus.PastDue` are the same check.

**Subscription statuses**

| 2.x | 3.0.0 |
|---|---|
| `SubscriptionStatus.ACTIVE` (`active`) | `SubscriptionStatus.Active` |
| `SubscriptionStatus.PAST_DUE` (`past_due`) | `SubscriptionStatus.PastDue` (`pastDue`) |
| `SubscriptionStatus.TRIAL` (`trial`) | `SubscriptionStatus.Trial` |
| `SubscriptionStatus.TRIAL_EXPIRED` (`trial_expired`) | `SubscriptionStatus.TrialExpired` (`trialExpired`) |
| `SubscriptionStatus.CANCELLED` (`cancelled`) | `SubscriptionStatus.Cancelled` |
| `SubscriptionStatus.LOW_ON_FUNDS` (`low_on_funds`) | no status: `actionRequired === ActionRequired.TopUpAllowance` |
| `SubscriptionStatus.PENDING` (`pending`) | no status: `actionRequired === ActionRequired.RaiseMaximum` |
| `subscription.stopped === true` | `SubscriptionStatus.Stopped` (`stopped`): cancelled at `nextBillingDate` |
| — | `SubscriptionStatus.Paused` (`paused`): paused by the customer |

**Grant access while `now < currentPeriodEnd`**, whatever the status: a check like
`status === 'active'` cuts off paying customers (`stopped`, `paused`) and keeps serving `pastDue`
ones.

**Checkout statuses**: 2.x's seven `TransactionStatusValue`s become four
`CheckoutSessionStatusValue`s: `created`, `waitingConfirmation`, `completed`, `expired`. `pending`,
`failed` and `cancelled` are gone: **a failed attempt is `created` with `lastAttempt` set** (its
`code` says why). It is never final: the customer may still pay until the session expires, so never
cancel an order on it.

**Other values**

| 2.x | 3.0.0 |
|---|---|
| `TransactionType.ONE_TIME_PAYMENT` | `TransactionType.Payment` (`payment`) |
| `TransactionType.EXECUTE_SUBSCRIPTION_PAYMENT` | `TransactionType.ExecuteSubscription` |
| `TransactionType.CREATE_PAYG_SUBSCRIPTION`, `CANCEL_PAYG_SUBSCRIPTION` (`createPAYGSubscription`…) | `TransactionType.CreatePaygSubscription`, `CancelPaygSubscription` (`createPaygSubscription`…) |
| other `TransactionType.UPPER_CASE` members | the same value, PascalCase (`TransactionType.TokenTransfer`, `ClaimFunds`, …); + `ForceCancelSubscription`, `ReleaseHeldFunds` |
| `TransactionShortType` | removed |
| `TransactionStatusValue` | `CheckoutSessionStatusValue` (above) |
| `RefundStatus.REFUSED` (`refused`) | `RefundStatus.Rejected` (`rejected`, the value the API sends) |
| `RefundStatus.FAILED` | removed (`pending`, `approved`, `rejected` remain) |
| `UserRole.ADMIN`, `UserRole.USER` | `Role.Admin`, `Role.User` (+ `Role.Owner`, `Role.Handle`) |
| `CombinedPayment.source` `'subscription_history'` | `CombinedPaymentSource.SubscriptionHistory` (`subscriptionHistory`) |
| `AccountingEvent.type` (a string union) | `AccountingEventType` |
| `DurationUnit` (a string union) | `DurationUnit` (a union and `DurationUnit.Months`, …) |

## 10. Errors

2.x threw `QBitFlowError` subclasses named `…Exception`, with the API's message only (2.1.0) and
mapped every 4xx it did not know, 409 and 422 included, to a `ValidationException`. 3.0.0 throws
one class per condition, each extending `ApiError` (which extends `QBitFlowError`):

| Status | 2.x | 3.0.0 |
|---|---|---|
| 400 `validation_failed`, and client-side checks (`status` `undefined`) | `ValidationException` | `ValidationError` |
| other 400 | `ValidationException` | `BadRequestError` |
| 401 | `UnauthorizedException` | `AuthenticationError` |
| 403 | `ForbiddenException` | `PermissionDeniedError` |
| 404 | `NotFoundException` | `NotFoundError` |
| 409 | `ValidationException` | `ConflictError` |
| 410 | `ValidationException` | `GoneError` |
| 422 `idempotency_key_reused` | `ValidationException` | `IdempotencyError` |
| 429 | `RateLimitException` | `RateLimitError` (`retryAfter` in seconds, `limit`, `periodSeconds`) |
| other 4xx | `ValidationException` | `ApiError` |
| 5xx, unexpected 3xx, unusable 2xx | `ServerException` (redirects were followed) | `ServerError` (redirects are never followed) |
| no response | `NetworkException` (or a raw `axios` error) | `NetworkError` (`cause`) |
| bad webhook signature | `ValidationException` | `WebhookSignatureError` (`reason`) |

- **Every error carries the API's data:** `status`, `code` (branch on it, never on the message:
  `unique_violation`, `merchant_not_ready`, `tx_already_sent`, `policy_disabled`…), `details`,
  `requestId` (log it, and quote it to support), `fieldErrors`, `rawMessage` (the API's own
  message) and `rawBody`. `message` now reads `"<message> (status …, code …, request …)"`.
- **Field errors work now.** 2.x read a validation error's fields from the wrong key (a top-level
  `errors` list), so they came back empty. 3.0.0 reads `details.errors`: `fieldErrors` names each
  failing input by the name you sent, dotted when nested (`frequency.unit`).
- `instanceof` matches across the CommonJS and ES module builds; `err.name` is the class name.
- `isRetryable(err)` tells the transient failures (network, 5xx, 429, `idempotency_key_in_use`).

## 11. Webhooks

The webhook scheme is new; 2.x verification code does not carry over.

| | 2.x | 3.0.0 |
|---|---|---|
| Header | `X-Webhook-Signature-256: sha256=<hex>`, `X-Webhook-Timestamp`, `X-Webhook-Id` | `QBitFlow-Signature: t=<unix>,v1=<hex>[,v1=<hex>]`, `QBitFlow-Event-Id`, `QBitFlow-Event-Type` |
| Signed content | `timestamp.` + the body re-encoded as canonical JSON | `t.` + the **raw body**, exactly as received |
| Rotation | one secret | two `v1=` for 24 hours after a rotation; either secret verifies |
| Body | `SessionWebhookResponse` or `SubscriptionStatusTransitionWebhook` | the event envelope `{ id, type, version, createdAt, test, userUuid, data }` |
| Dashboard test | `X-Webhook-Id: test-webhook-id` | a `webhook.test` event |

- **Read the raw body and never re-serialize it** before verifying: with Express, mount
  `express.raw({ type: 'application/json' })` on the webhook route instead of `express.json()`;
  with `node:http`, collect the request's chunks into a `Buffer`.
- **Endpoints must be on payload version v2.** v1 webhook URLs were migrated as endpoints with
  `payloadVersion` `v1`, which still receive v1's bodies; 3.0.0 does not parse them
  (`webhooks.parseEvent` throws a `ValidationError`). Move each endpoint to v2 in the dashboard, or
  with `client.webhooks.endpoints.update(uuid, { payloadVersion: WebhookPayloadVersion.V2 })`, when
  your receiver runs 3.0.0. Moving keeps the endpoint's secret.
- **Event types** replace the two 2.x payloads: v1's transaction webhook becomes
  `payment.completed` / `subscription.created`, its subscription webhook `subscription.billed` /
  `subscription.statusChanged`, plus 11 new types (`checkout.expired`, `refund.*`,
  `member.joined`, …). `Event` is a discriminated union: a `switch` on `event.type` narrows
  `event.data`; a type the SDK does not know yet lands in `default` (`webhooks.isUnknownEvent`).
- Deliveries are at least once: deduplicate on `event.id`, and answer 2xx to the types you ignore.
- Endpoints are created per space with `client.webhooks.endpoints.create`, whose answer carries the
  `whsec_…` secret once.

## 12. Pagination

`getAll({ limit, cursor })` becomes `list({ limit, cursor, ...filters })`, returning a `Page<T>`
(`items`, `nextCursor`, `hasMore`). **`hasMore` is a boolean property now, not a method**: replace
`page.hasMore()` with `page.hasMore`. Pass `page.nextCursor` back as `cursor`, verbatim. Every
paginated list also has an async iterator that walks every page lazily:

```ts
for await (const s of client.subscriptions.iterate({ limit: 100 })) {
	console.log(s.uuid, s.status);
}
```

## 13. Before and after: six common tasks

### Create the client

```ts
// 2.x
const client = new QBitFlow({
	apiKey: process.env.QBITFLOW_API_KEY!,
	baseUrl: 'https://api.qbitflow.app/v1',
	timeout: 10000,
});
```

```ts
const client = new QBitFlow(process.env.QBITFLOW_API_KEY ?? '', {
	timeout: 10_000, // per attempt; the base URL defaults to .../v2
});
const me = await client.me(); // check the key at start-up
console.log(me.role, me.space?.test);
```

### Open a payment checkout and read its outcome

```ts
// 2.x
const session = await client.oneTimePayments.createSession({
	productId: 42,
	reference: 'order-1042',
	successUrl: 'https://shop.example.com/thanks',
});
const status = await client.transactionStatus.get(session.uuid, TransactionType.ONE_TIME_PAYMENT);
if (status.status === TransactionStatusValue.COMPLETED) {
	const payment = await client.oneTimePayments.get(session.uuid);
}
```

```ts
const session = await client.checkoutSessions.createPayment({
	productUuid: '0192f1c2-1111-7c4d-9e5f-6a7b8c9d0e1f',
	reference: 'order-1042',
	successUrl: 'https://shop.example.com/thanks?session={{UUID}}',
});
const status = await client.checkoutSessions.getStatus(session.uuid);
if (status.status === CheckoutSessionStatusValue.Completed) {
	const payment = await client.payments.get(session.uuid); // the payment has the session's id
	console.log(payment.txHash);
}
```

### List a seller's payments

```ts
// 2.x
let page = await client.oneTimePayments.onBehalfOf(123).getAll({ limit: 50 });
while (page.hasMore()) {
	page = await client.oneTimePayments.onBehalfOf(123).getAll({ limit: 50, cursor: page.nextCursor });
}
```

```ts
const seller = client.onBehalfOf('0192f1c2-7b3a-7c4d-9e5f-6a7b8c9d0e1f'); // Member.userUuid
for await (const p of seller.payments.iterate({ limit: 50 })) {
	console.log(p.uuid, p.amount);
}
```

### Cancel a subscription

```ts
// 2.x
const res = await client.subscriptions.forceCancel('sub@0192f1c2-3333-7c4d-9e5f-6a7b8c9d0e1f');
console.log(res.message);
```

```ts
const res = await client.subscriptions.cancel('sub@0192f1c2-3333-7c4d-9e5f-6a7b8c9d0e1f'); // immediate
console.log(res.subscription.status, res.pending); // pending: still confirming on-chain (HTTP 202)
```

### Receive a webhook

```ts
// 2.x
app.post('/webhook', express.json(), (req, res) => {
	const headers = extractWebhookHeaders(req.headers);
	try {
		verifyWebhookSignature(secret, headers.timestamp, headers.signature, req.body);
	} catch {
		return res.sendStatus(400);
	}
	const body = req.body as SessionWebhookResponse;
	if (body.status.status === TransactionStatusValue.COMPLETED) fulfil(body.session.reference);
	res.sendStatus(200);
});
```

```ts
import express from 'express';
import { webhooks } from 'qbitflow';

const app = express();
const secret = process.env.QBITFLOW_WEBHOOK_SECRET ?? '';

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
	let event;
	try {
		event = webhooks.constructEvent(req.body, req.headers['qbitflow-signature'], secret);
	} catch {
		res.sendStatus(400); // a bad signature, or an endpoint still on v1
		return;
	}
	// Deduplicate on event.id first.
	if (event.type === 'payment.completed') console.log('fulfil', event.data.reference);
	res.sendStatus(200); // to every type, the ignored ones too
});
```

### Handle an error

```ts
// 2.x
try {
	await client.products.get(42);
} catch (err) {
	if (err instanceof NotFoundException) console.log('not found:', err.message);
	else if (err instanceof ValidationException) console.log('invalid:', err.message); // no field details
	else if (err instanceof QBitFlowError) console.log('error', err.message);
}
```

```ts
try {
	await client.products.get('0192f1c2-1111-7c4d-9e5f-6a7b8c9d0e1f');
} catch (err) {
	if (err instanceof NotFoundError) {
		console.log('not found, request', err.requestId);
	} else if (err instanceof ValidationError) {
		for (const f of err.fieldErrors) console.log(f.field, f.message);
	} else if (err instanceof ApiError) {
		console.log('error', err.status, err.code);
	} else {
		throw err;
	}
}
```

## Names from the unreleased 2.5.0

2.5.0 was prepared but never published; its changes are part of 3.0.0. If you built against that
branch:

- `client.onBehalfOf(userId: number)` → `client.onBehalfOf(userUuid: string)`.
- `QBitFlowError.statusCode` → `ApiError.status`; `QBitFlowError.fields` → `ApiError.fieldErrors`
  (each `{ field, message }`, now filled from the API's `details.errors`);
  `RateLimitException.retryAfter` → `RateLimitError.retryAfter` (seconds);
  `ConflictException` → `ConflictError`; the other `…Exception` classes as in § 10.
- `accounting.export(from, to, format)` (overloaded) → `accounting.exportJson(from, to)` /
  `exportCsv(from, to)`.
- `parseSessionWebhook(body)`, `parseSubscriptionWebhook(body)`, `SubscriptionWebhook`,
  `SubscriptionWebhookType`, `SubscriptionBillingWebhook`, `UnknownSubscriptionWebhook`,
  `isSubscriptionStatusTransitionWebhook`, `isSubscriptionBillingWebhook` → `webhooks.parseEvent`
  / `webhooks.constructEvent` and the `Event` union (`subscription.statusChanged`,
  `subscription.billed`, …).
- `isSubscriptionSession(session)` / `isPaymentSession(session)` → `webhooks.isSubscriptionSession(data)`
  on a `checkout.expired` event's data.
- The service types `AccountingRequests`, `CustomerRequests`, `PaymentRequests`, … →
  `AccountingService`, `CustomersService`, `PaymentsService`, …
- `getApiKey()` / `getBaseUrl()` → removed; the Node 18 baseline → Node 20.
- `RefundStatus.REFUSED` → `RefundStatus.Rejected` (`rejected`, the value the API sends).
