# Upgrading the QBitFlow JavaScript/TypeScript SDK from 2.x to 3.0

## Who should read this

Read this guide if your code uses the npm package **`qbitflow` at version 2.x** (2.1.0 is the
last 2.x release). Version 3.0 is the SDK for **QBitFlow API v2**: it calls `https://api.qbitflow.app/v2`
only, and API v1, which 2.x calls, is retired. Upgrading is required to keep your integration
working, and it touches most calls, so plan it as one change.

Starting a new integration? You don't need this guide: read the
[README](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/README.md).

In the code below, blocks marked `// 2.x` show the old code; every other block is 3.0.

## What changed at a glance

- **Node.js 20 or later, no runtime dependencies.** `axios` and `ws` are gone: the SDK uses the
  global `fetch`.
- **New API, new names.** Checkouts have their own service (`checkoutSessions`), lists are
  `list` / `iterate`, and users and claims are replaced by **invitations** and **members**.
- **Every id is a string.** Products and members are named by UUIDs (`productUuid`, `userUuid`),
  transactions by prefixed ids (`pay@…`, `sub@…`). Only currencies keep numeric ids.
- **Money is a decimal string, never a number**, in requests and responses (`priceUsd: '4.99'`),
  and fee rates are percents (`feePercent: '1.5'`, was `feeBps: 150`).
- **Typed errors**: one class per condition (`NotFoundError`, `ConflictError`, …) carrying the
  API's `code`, `details`, `requestId` and field errors.
- **Safer retries**: only reads and the 6 creates are retried, and every create sends an
  `Idempotency-Key`, so a retry never charges or creates twice.
- **New webhooks**: a `QBitFlow-Signature` header over the raw body, and typed events
  (`payment.completed`, `subscription.billed`, …) with a ready-made router.
- **Pagination** returns `Page<T>` with a `hasMore` **property**, plus async iterators.

## Upgrade steps

1. **Upgrade Node.js** to version 20 or later.
2. **Install 3.0:**

   ```bash
   npm install qbitflow@^3
   ```

   Remove `axios` and `ws` from your own dependencies if you only had them for the SDK.
3. **Keep your imports.** The package name and entry points are unchanged; it ships ES module
   and CommonJS builds with their TypeScript types:

   ```ts
   import { QBitFlow, webhooks, NotFoundError } from 'qbitflow'; // ES modules, TypeScript
   ```

   ```js
   const { QBitFlow, webhooks, NotFoundError } = require('qbitflow'); // CommonJS
   ```

   The webhook helpers now live in the `webhooks` namespace (`webhooks.verify`,
   `webhooks.constructEvent`, `webhooks.router`).
4. **Create new API keys** in the QBitFlow dashboard. API v2 issues keys shaped
   `sk_<test|live>_<uuid>_<secret>`; keys in an earlier format are refused (`401`). Each key
   belongs to one mode, test or live.
5. **Point at v2.** If you set `baseUrl`, change it from `/v1` to `/v2` (or remove it: the default
   is `https://api.qbitflow.app/v2`).
6. **Update your calls** with the [breaking changes](#breaking-changes) and the
   [method map](#method-map) below. With TypeScript, the compiler lists every call to change.
7. **Store the new ids.** Map the numeric product and user ids you saved to UUIDs
   ([Ids](#ids-are-strings)).
8. **Rebuild your webhook receiver** for the v2 signature and events ([Webhooks](#webhooks)), and
   create its endpoint with `client.webhooks.endpoints.create` (or in the dashboard) to get its
   `whsec_…` secret.
9. **Test with a test-mode key**, then switch the key for live ([checklist](#final-checklist)).

## Breaking changes

| Area | 2.x | 3.0 |
|---|---|---|
| Runtime | Node.js 14+, `axios`, `ws` | Node.js 20+, no runtime dependencies |
| Base URL | `https://api.qbitflow.app/v1` | `https://api.qbitflow.app/v2` |
| Acting for a seller | `client.products.onBehalfOf(123)` (per service, numeric id) | `client.onBehalfOf(userUuid)` (one client for every service), or the `{ onBehalfOf }` request option |
| Checkouts | `oneTimePayments.createSession`, `subscriptions.createSession` | `checkoutSessions.createPayment`, `checkoutSessions.createSubscription` |
| Checkout status | `transactionStatus.get(uuid, type)` | `checkoutSessions.get(uuid)` |
| Payments | `client.oneTimePayments` | `client.payments` (and `client.transactions` for payments and bills together) |
| Sellers | `users.*`, `claims.*` | `invitations.*`, `members.*` |
| Ids | `productId: number`, `userId: number`, `customerUUID` | `productUuid: string`, `userUuid: string`, `customerUuid` |
| Money | `price: 4.99` (number), `feeBps: 150` | `priceUsd: '4.99'` (string), `feePercent: '1.5'` |
| Lists | `getAll({ limit, cursor })`, `page.hasMore()` | `list({ limit, cursor, ...filters })`, `page.hasMore`, `iterate()` |
| Deletes | resolved to `{ message }` | resolve to `void` |
| Errors | `…Exception` classes, no field details | `…Error` classes extending `ApiError`, with `code`, `details`, `requestId`, `fieldErrors` |
| Retries | every method, POSTs included; `maxRetries: 0` meant the default | reads and the 6 creates only; `maxRetries: 0` disables retries |
| Webhooks | `verifyWebhookSignature(secret, timestamp, signature, payload)` over canonical JSON | `webhooks.verify(rawBody, signatureHeader, secret)` over the raw body; typed events |
| Enums | TypeScript `enum`s, `UPPER_CASE` members and `snake_case` values | string unions with a `const` object, `PascalCase` members and `lowerCamelCase` values |
| Timestamps | some typed `Date` | ISO 8601 strings, exactly as sent |

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
	timeout: 10_000, // per attempt, in ms; the base URL defaults to .../v2
});
const me = await client.me(); // checks the key online: its role, space and mode
console.log(me.role, me.space?.test);
```

The constructor refuses a blank key, one not starting with `sk_`, or one with a space or a
control character (a `ValidationError` that never quotes the key), and sends nothing.
`QBitFlow.fromEnv()` builds a client from `QBITFLOW_API_KEY` (and `QBITFLOW_BASE_URL`,
`QBITFLOW_ON_BEHALF_OF` when set). `getApiKey()` and `getBaseUrl()` are removed.

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
	productUuid: '0192f1c2-1111-7c4d-9e5f-6a7b8c9d0e1f', // or productReference, or an inline product
	reference: 'order-1042',
	successUrl: `https://shop.example.com/thanks?session=${Placeholders.UUID}`,
});
const status = await client.checkoutSessions.get(session.uuid);
if (status.status === CheckoutSessionStatusValue.Completed) {
	const payment = await client.payments.get(session.uuid); // the payment has the session's id
	console.log(payment.txHash);
}
```

An inline product takes `productName`, `priceUsd` (a string) and an optional `description`.
Fulfil orders on the `payment.completed` webhook rather than by polling.

### Create a product

```ts
// 2.x
const product = await client.products.create({ name: 'T-shirt', description: 'Blue', price: 4.99 });
await client.products.update(product.id, { price: 5.99 });
```

```ts
const product = await client.products.create({
	name: 'T-shirt',
	description: 'Blue',
	priceUsd: '4.99', // a decimal string
	reference: 'tshirt-blue-m',
});
await client.products.update(product.uuid, { priceUsd: '5.99' });
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
	console.log(p.uuid, p.amountUsd, 'USD'); // a decimal string
}
```

### Invite a seller (was: create a user)

```ts
// 2.x
const user = await client.users.create({
	name: 'Ada',
	lastName: 'Lovelace',
	email: 'seller@example.com',
	role: UserRole.USER,
	organizationFeeBps: 1000, // 10 %
});
```

```ts
const invitation = await client.invitations.create({
	email: 'seller@example.com',
	holdFunds: true, // required: hold their payments until you trust them
	organizationFeePercent: '10', // your commission, a percent string
});
console.log(invitation.link); // also emailed; they are a member once they accept (member.joined)
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
// { immediate: false } stops it now and cancels it at the end of the period paid for.
```

### Export the accounting

```ts
// 2.x
const rows = await client.accounting.export('2026-01-01', '2026-03-31', 'json');
```

```ts
const rows = await client.accounting.exportJson('2026-01-01', '2026-03-31'); // at most 92 days
const csv = await client.accounting.exportCsv('2026-01-01', '2026-03-31');
const year = await client.accounting.exportJsonRange('2026-01-01', '2026-12-31'); // any range
console.log(rows.length, csv.length, year.length);
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

const router = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET ?? '')
	.on('payment.completed', (payment, event) => {
		console.log('fulfil', payment.reference, 'once for', event.id); // deduplicate on event.id
	});

const app = express();
// Verifies, parses and answers 200 / 400 / 500. It needs the raw body: never express.json() here.
app.post('/webhook', express.raw({ type: 'application/json' }), router.nodeHandler());
```

### Handle an error

```ts
// 2.x
try {
	await client.products.get(42);
} catch (err) {
	if (err instanceof NotFoundException) console.log('not found:', err.message);
	else if (err instanceof ValidationException) console.log('invalid:', err.message);
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
		console.log('error', err.status, err.code); // branch on code, never on the message
	} else {
		throw err;
	}
}
```

## Method map

Every 2.1.0 method and its replacement. Params named `…Params` are interfaces exported by the
package. Every 3.0 method also takes [request options](#request-options) as its last argument.

### Checkout sessions (2.x `oneTimePayments`, `subscriptions`, `transactionStatus`)

| 2.x | 3.0 | Notes |
|---|---|---|
| `oneTimePayments.createSession(dto)` | `checkoutSessions.createPayment(params)` | `productId` → `productUuid` (or `productReference`); `customerUUID` → `customerUuid`; `price` → `priceUsd` (a string); returns `{ link, uuid, expiresAt }`; new `expiresInMinutes`, `metadata`, `fees` |
| `subscriptions.createSession(dto)` | `checkoutSessions.createSubscription(params)` | the same, plus `frequency`, `trialPeriod` (each a `Duration`) and `minPeriods`, each optional over a subscription product's terms |
| `transactionStatus.get(uuid, type)` | `checkoutSessions.get(uuid)` | no type argument; four statuses ([Enums](#enums)) |
| `transactionStatus.connectAndHandleMessages(…)` | removed | use webhooks, or `checkoutSessions.waitForCompletion(uuid)` in scripts |
| `oneTimePayments.getSession(uuid)`, `subscriptions.getSession(uuid)` | removed | `checkoutSessions.get` for the state; the session's data comes with the `checkout.expired` webhook |
| — | `checkoutSessions.expire(uuid)` | new: end an unpaid session |

### Payments

| 2.x | 3.0 | Notes |
|---|---|---|
| `oneTimePayments.get(uuid)` | `payments.get(uuid)` | `pay@…` or the bare UUID |
| `oneTimePayments.getByReference(ref)` | `payments.getByReference(ref)` | a `NotFoundError` when none |
| `oneTimePayments.getAll({ limit, cursor })` | `payments.list(params?)`, `payments.iterate(params?)` | filters: `customerUuid`, `productUuid`, `createdAfter` / `createdBefore`, `reference`, `refunded`, `includeMembers` / `userUuid` |
| `oneTimePayments.getAllCombined({ limit, cursor })` | `transactions.list(params?)`, `transactions.iterate(params?)` | payments and bills in one feed; `source` → `type` (`TransactionKind.Payment`, `TransactionKind.Bill`) |
| `oneTimePayments.getCustomerForTransaction(txUuid)` | removed | `payment.customer` (a summary), or `customers.get(payment.customerUuid)` |
| — | `failures.list`, `failures.iterate` | new: failed payment attempts |

### Subscriptions

| 2.x | 3.0 | Notes |
|---|---|---|
| `subscriptions.get(uuid)` | `subscriptions.get(uuid)` | returns cancelled subscriptions too: a 404 no longer means "cancelled" |
| `subscriptions.getByReference(ref)` | `subscriptions.getByReference(ref)` | a `NotFoundError` when none |
| `subscriptions.getPaymentHistory(uuid)` | `subscriptions.listBills(uuid)`, `subscriptions.iterateBills(uuid)` | every bill, page by page |
| `subscriptions.forceCancel(uuid)` | `subscriptions.cancel(uuid, { immediate? })` | returns `{ subscription, pending }`; never retried |
| `subscriptions.executeTestBilling(uuid)` | `subscriptions.testBill(uuid)` | test mode only; returns a `TestBill` (`billUuid`, `stage`, `outcome`) |
| — | `subscriptions.list`, `subscriptions.iterate`, `subscriptions.update` (metadata), `subscriptions.getBill` | new |

### Refunds

Refunds are read only in 3.0: a customer's request is answered, and your own refund is sent,
from the dashboard.

| 2.x | 3.0 | Notes |
|---|---|---|
| `refunds.getAll()` | `refunds.list({ status: [RefundStatus.Pending] })`, `refunds.iterate(…)` | paginated |
| `refunds.getAllInactive({ limit, cursor })` | `refunds.list({ status: [RefundStatus.Approved, RefundStatus.Rejected] })` | one list, filtered by `status` |
| `refunds.getByTransaction(txUuid)` | `refunds.list({ txUuid })` | or `payment.refund` / `bill.refund` |
| — | `refunds.get(refundUuid)` | new |

### Customers and products

| 2.x | 3.0 | Notes |
|---|---|---|
| `customers.create(dto)` | `customers.create(params)` | `name` → `firstName`; new `metadata` |
| `customers.get(uuid)` | `customers.get(uuid)` | |
| `customers.getByReference(ref)` | `customers.getByReference(ref)` | a `NotFoundError` when none |
| `customers.getByEmail(email)` | `customers.list({ email })` | several customers may share an email |
| `customers.update(uuid, dto)` | `customers.update(uuid, params)` | a field left out is unchanged; `''` clears `lastName`, `phoneNumber` or `address`; `metadata` is merged |
| `customers.delete(uuid)` | `customers.delete(uuid)` | resolves to `void` |
| `customers.getAll({ limit, cursor })` | `customers.list(params?)`, `customers.iterate(params?)` | filters `email`, `reference` |
| `products.create(dto)` | `products.create(params)` | `price` → `priceUsd` (a string); `subscription` terms make a subscription product; new `metadata` |
| `products.get(id: number)` | `products.get(uuid: string)` | |
| `products.getAll()` | `products.list(params?)`, `products.iterate(params?)` | paginated now; `includeHidden`, `subscription`, `reference` |
| `products.getByReference(ref)` | `products.getByReference(ref)` | hidden products included; a `NotFoundError` when none |
| `products.update(id, dto)` | `products.update(uuid, params)` | `priceUsd` a string; new `isActive`, `subscription`, `removeSubscription`, `metadata`; `description: ''` clears it |
| `products.delete(id)` | `products.delete(uuid)` | resolves to `void` |

### Users, claims and API keys

API v2 creates no accounts for your sellers: a seller is a **member** once they accept an
**invitation**.

| 2.x | 3.0 | Notes |
|---|---|---|
| `users.create(dto)` | `invitations.create(params)` | the person exists once they accept (the `member.joined` webhook carries their `userUuid`) |
| `users.getAll()` | `members.list()`, `members.iterate()` | |
| `users.getById(id)` | `members.get(userUuid)` | |
| `users.getByEmail(email)` | removed | iterate `members` and match `member.email` |
| `users.update(id, dto)` | `members.update(userUuid, { organizationFeePercent })` | only your commission: names and emails are the person's own |
| `users.delete(id)` | `members.remove(userUuid)` | a `ConflictError` `held_funds_pending` while you hold their funds |
| `users.get()` | `client.me()` | what the key is: its role, space and mode |
| `claims.createRequest(userId)`, `claims.getRequestByUser(userId)` | `invitations.create`, `invitations.list` / `iterate` | the invitation link replaces the claim link |
| `claims.getFunds()` | `members.listHeldFunds()`, `members.getHeldFunds(userUuid)`, `members.getOwnHeldFunds()` | |
| `claims.triggerTestClaimFunds(userId)` | removed | `members.trust(userUuid)` sends new payments to the seller directly; held funds are released from the dashboard |
| `apiKeys.getAll()`, `apiKeys.getForUser(userId)` | removed | keys are managed in the dashboard; `client.me()` describes the current one |
| — | `invitations.revoke(uuid)`, `members.trust(userUuid)` | new |

`holdFunds: true` (the 2.x claim model) holds a seller's payments in your wallet until you
trust them. Sellers created in 2.x are already members; those who never claimed are members whose
funds you hold (`trustedAt` absent).

### Wallets, accounting, currencies

| 2.x | 3.0 | Notes |
|---|---|---|
| — | `wallets.list({ withBalances? })`, `wallets.listForMember(userUuid)`, `wallets.listAcceptedCurrencies({ userUuid? })` | new; each returns an array |
| `accounting.export(from, to, 'json')` | `accounting.exportJson(from, to)` | at most 92 days, both included; `exportJsonRange` for any range |
| `accounting.export(from, to, 'csv')` | `accounting.exportCsv(from, to)` | CSV text; `exportCsvRange` for any range |
| `currencies.getAllAvailable(test)` | `currencies.list({ test })` | an array |
| `currencies.getAllMain(test)` | `currencies.list({ test, main: true })` | |
| — | `currencies.get(id)` | new |

### Webhooks

| 2.x | 3.0 | Notes |
|---|---|---|
| `verifyWebhookSignature(secret, timestamp, signature, payload, options)` | `webhooks.verify(rawBody, signatureHeader, secret, options?)` | the raw body, the whole `QBitFlow-Signature` header; throws a `WebhookSignatureError` |
| — | `webhooks.constructEvent(rawBody, signatureHeader, secret)`, `webhooks.parseEvent(rawBody)` | verify and parse into a typed `Event` |
| — | `webhooks.router(secret)`, `webhooks.sign(rawBody, secret)` | new: verify, dispatch and answer; sign test deliveries |
| `client.webhooks.verify(payload, signature, timestamp)` → `boolean` | `client.webhooks.verifyRemote(endpointUuid, rawBody, signatureHeader)` → `void` | a mismatch throws a `WebhookSignatureError` (reason `invalidSignature`) |
| `computeWebhookSignature`, `canonicalJson`, `extractWebhookHeaders`, `WebhookHeaders` | removed | the signature covers the raw body; pass `req.headers['qbitflow-signature']` as is |
| `HEADER_SIGNATURE`, `HEADER_TIMESTAMP`, `HEADER_WEBHOOK_ID`, and the `client.webhooks` header getters | `webhooks.SIGNATURE_HEADER`, `webhooks.EVENT_ID_HEADER`, `webhooks.EVENT_TYPE_HEADER` | the timestamp is inside `QBitFlow-Signature` |
| `TEST_WEBHOOK_ID`, `client.webhooks.testWebhookId` | the `webhook.test` event (`EventType.WebhookTest`) | |
| `VerifyWebhookOptions { maxTimestampAgeSeconds, nowSeconds, skipTimestampCheck }`, `DEFAULT_MAX_TIMESTAMP_AGE_SECONDS` | `VerifyOptions { tolerance, now }`, `webhooks.DEFAULT_TOLERANCE` | the timestamp check can no longer be skipped |
| `SessionWebhookResponse`, `SubscriptionStatusTransitionWebhook` | the `Event` union (`PaymentCompletedEvent`, …) | [Webhooks](#webhooks) |
| — | `client.webhooks.endpoints.*`, `client.webhooks.events.*` | new: manage endpoints, read the event log |

### Errors, pagination and constants

| 2.x | 3.0 |
|---|---|
| `QBitFlowError` | `QBitFlowError` (the base) and `ApiError` (the base of every concrete class) |
| `NotFoundException`, `UnauthorizedException`, `ForbiddenException`, `ValidationException`, `RateLimitException`, `ServerException`, `NetworkException` | `NotFoundError`, `AuthenticationError`, `PermissionDeniedError`, `ValidationError` (or `BadRequestError`, `ConflictError`, …: [Errors](#errors)), `RateLimitError`, `ServerError`, `NetworkError` |
| `WebSocketException` | removed |
| `CursorData`, `CursorDataResponse`, `getCursorData` | `Page<T>` |
| `QBitFlowConfig` | `ClientConfig` (the options alone: `ClientOptions`) |
| `VERSION` (`'2.1.0'`) | `VERSION` (`'3.0.0'`), also sent as `User-Agent: qbitflow-js/3.0.0` |
| `PaymentRequests`, `CustomerRequests`, … (service classes) | `PaymentsService`, `CustomersService`, … (exported as types) |

## Ids are strings

- **Products:** `Product.id: number` → `Product.uuid: string`; `productId` → `productUuid`
  everywhere.
- **Members:** a seller is named by their user UUID (`Member.userUuid`); `userId` → `userUuid`.
  `onBehalfOf(123)` becomes `client.onBehalfOf('0192f1c2-…')`; a value that is not a UUID throws
  a `ValidationError`.
- **Acronyms are words:** `customerUUID` → `customerUuid`, `subscriptionUUID` →
  `subscriptionUuid`, `priceUSD` → `priceUsd`.
- **`organizationId` is gone** from every model; `(await client.me()).space?.organizationUuid`
  names your organization.
- **Transactions** keep prefixed ids (`pay@…`, `sub@…`, `sub-hist@…` a bill, `refund@…`), passed
  back as opaque strings; every method also takes the bare UUID. `txId` → `txUuid`,
  `transactionHash` → `txHash`.

**Map the numeric ids you stored:** walk your products
(`client.products.iterate({ includeHidden: true })`) and match them on `reference`, which did not
change, and your members (`client.members.iterate()`) on `email`. Store the UUIDs next to your
old ids.

## Renamed and removed types

| 2.x | 3.0 | What changed |
|---|---|---|
| `LinkResponse` | `CreatedCheckoutSession` | `link`, `uuid`, `expiresAt` |
| `TransactionStatus` | `CheckoutSessionStatus` | `status` (four values), `txHash`, `message`, `lastAttempt`, `expiresAt` |
| `StatusLinkResponse` | `TestBill` | `billUuid`, `stage`, `outcome`, `attempts`, `nextAttemptAt` |
| `OneTimePaymentSession`, `SubscriptionSession`, `SessionCheckout` | `PaymentSessionData`, `SubscriptionSessionData` | only in the `checkout.expired` webhook; `priceUsd`, `fees`, `amountUsd`, `metadata`; `frequency` a `Duration` (was seconds). The hosted page's fields (`organizationName`, `userName`, the available currencies) are not part of it: read `wallets.listAcceptedCurrencies()` for the currencies |
| `CreatePaymentSessionDto`, `CreateSubscriptionSessionDto` | `CreatePaymentSessionParams`, `CreateSubscriptionSessionParams` | the renames above |
| `Payment` | `Payment` | `amount` is now the **token amount** (`'10'` for 10 USDC), its USD value `amountUsd`; `name` / `description` → `productName` / `productDescription`; `currencyId` → the `currency` object; the fee split (`metadata`) → `settlement`, and `metadata` is now your own data from the checkout |
| `CombinedPayment` | `Transaction` | `source` → `type` |
| `Subscription` | `Subscription` | `subscriptionStatus` → `status`; `stopped: boolean` → the `stopped` status; `frequency` (seconds) → a `Duration`; `lastBillingDate` / `nextBillingDate` / `minimumCancellationDate` → `lastBilledAt` / `nextBillingAt` / `cancellableAt`; `allowance` and `maxAmountPerPeriod` → `allowance: Allowance`; new `currentPeriodEnd`, `actionRequired`, `priceUsd`, `fees`, `metadata`, `managementPageLink` |
| `SubscriptionHistory` | `Bill` | the `Payment` renames |
| `RefundEntry` | `Refund` | `txId` → `txUuid`; amounts as strings; new `initiatedBy`, `refundPercent`, `paid`, `settlement` |
| `Customer` | `Customer` | `name` → `firstName`; new `metadata` |
| `Product` | `Product` | `id` → `uuid`; `price` → `priceUsd` (a string); new `subscription`, `paymentLink`, `metadata` |
| `User` | `Member` (or `Me`) | `id` → `userUuid`; `name` → `firstName`; `organizationFeeBps` → `organizationFeePercent` (a string); `claimedAt` → `trustedAt` |
| `CreateUserDto`, `UpdateUserDto` | `CreateInvitationParams`, `UpdateMemberParams` | `holdFunds` (required), `organizationFeePercent` (a string) |
| `ClaimFunds` | `MemberHeldFunds`, `HeldFunds`, `LedgerEntry` | `totalUsd`; each line's `owed`, `owedUsd` |
| `AccountingEvent` | `AccountingEvent` | `paymentId` → `txUuid`; `paymentReference` → `reference`; `tokenSymbol` → `currency`; every amount and rate a decimal string, amounts in the currency's units with a `…MinUnits` twin; a fee that doesn't apply is absent (was `'0'`); network fees are apart from `netAmount` |
| `PaymentMetadata` | `Settlement` | `feeBps` → `feePercent` (a string); `txAmounts` → `split`; the block and fees → `transaction` |
| `OrganizationFee`, `ReferralFee` | the same names | `{ address, feePercent }` |
| `Currency` | `Currency` | new `code` (`BASE:USDC`) and `chain`; `address` absent on a native coin; no nested `mainCurrency` |
| `CursorData<T>` | `Page<T>` | `items`, `hasMore` (a property), `nextCursor` (only when `hasMore`) |
| `ApiKey`, `Organization`, `StatusResponse`, `StatusResponseError`, `SuccessResponse`, `ErrorResponse`, `PaygSubscriptionSession` | removed | |

Responses are now **decoded against their type at runtime**: a field the API leaves out gets its
zero value (`''`, `0`, `false`, `[]`, `{}`) or is `undefined` when optional (the API never sends
`null`); a value of the wrong JSON type is a `ServerError`. Timestamps are ISO strings exactly as
sent (2.1.0 typed some as `Date` although they were strings at runtime).

### Enums

Each enum is now a string union **and** a `const` object of the known values, with PascalCase
members and the API's lowerCamelCase values. A value the SDK doesn't know yet is kept as is, so
give every `switch` a `default` branch. Plain strings work too:
`sub.status === 'pastDue'` and `sub.status === SubscriptionStatus.PastDue` are the same check.

| 2.x | 3.0 |
|---|---|
| `SubscriptionStatus.ACTIVE`, `TRIAL`, `CANCELLED` | `SubscriptionStatus.Active`, `Trial`, `Cancelled` |
| `SubscriptionStatus.PAST_DUE` (`past_due`), `TRIAL_EXPIRED` (`trial_expired`) | `SubscriptionStatus.PastDue` (`pastDue`), `TrialExpired` (`trialExpired`) |
| `SubscriptionStatus.LOW_ON_FUNDS`, `PENDING` | no status: `actionRequired` is `ActionRequired.TopUpAllowance` or `RaiseMaximum` |
| `subscription.stopped === true` | `SubscriptionStatus.Stopped`; new `SubscriptionStatus.Paused` |
| `TransactionStatusValue` (7 values) | `CheckoutSessionStatusValue`: `Created`, `WaitingConfirmation`, `Completed`, `Expired` (a failed attempt is `created` with `lastAttempt` set) |
| `TransactionType.ONE_TIME_PAYMENT`, `CREATE_SUBSCRIPTION` | `TransactionType.Payment`, `CreateSubscription` (the other members are removed) |
| `TransactionShortType` | removed |
| `RefundStatus.REFUSED` | `RefundStatus.Rejected` (`rejected`) |
| `RefundStatus.FAILED` | removed: the API never sends it (a failed approval leaves the refund `pending`) |
| `UserRole.ADMIN`, `UserRole.USER` | `Role.Admin`, `Role.User` |
| `CombinedPayment.source` `'subscription_history'` | `TransactionKind.Bill` (`bill`) |
| `AccountingEvent.type` `'subscription_history'` | `AccountingEventType.Bill` (`bill`) |

## New capabilities

- `client.me()` (what the key is) and `client.onBehalfOf(userUuid)` (act in a seller's space).
- Checkout **fees**: your own lines (tax, shipping) and QBitFlow's processing fee, on payments and
  subscriptions (`fees` on both creates).
- Your own **metadata** (`Record<string, string>`) on products, customers, checkouts and
  subscriptions, copied into payments and webhooks.
- Marketplaces: invitations, members, commissions, held funds and trust.
- Wallets, the transactions feed, failed payment attempts, refunds by id, subscription bills and
  metadata updates.
- Webhook endpoints and the event log through the API; a **webhook router** with adapters for
  Next.js, Express, Hono, Bun, Deno, Cloudflare Workers and plain Node.
- Helpers: `checkoutSessions.waitForCompletion`, `hasAccess(subscription)`, exact
  `formatAmount` / `parseAmount`, `accounting.exportJsonRange` / `exportCsvRange`,
  `QBitFlow.fromEnv()`, `Placeholders` for redirect URLs.
- Async iterators on every paginated list, an injectable `fetch`, an `AbortSignal` on every call,
  and client-side validation that names each failing field before anything is sent.

## Behaviour changes

### Request options

Every method takes optional request options as its last argument:

```ts
const payment = await client.payments.get('pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f', undefined, {
	onBehalfOf: '0192f1c2-7b3a-7c4d-9e5f-6a7b8c9d0e1f', // a seller's space, this call only
	requestId: 'support-ticket-981', // X-Request-Id, echoed in errors
	signal: AbortSignal.timeout(15_000), // cancels the call, its retries and its waits
});
console.log(payment.amountUsd);
```

`idempotencyKey` sets the `Idempotency-Key` of a create (below).

### Errors

2.x mapped every unknown 4xx (409 and 422 included) to `ValidationException`, and lost the field
errors of a 400. 3.0 throws one class per condition, each extending `ApiError`:

| Status | 2.x | 3.0 |
|---|---|---|
| 400 `validation_failed`, and inputs refused before sending (`status` `undefined`) | `ValidationException` | `ValidationError` (`fieldErrors`: each failing input by name) |
| other 400 | `ValidationException` | `BadRequestError` |
| 401 | `UnauthorizedException` | `AuthenticationError` |
| 403 | `ForbiddenException` | `PermissionDeniedError` (`forbidden`, or `policy_disabled` with `details.policy` for a seller's key) |
| 404 | `NotFoundException` | `NotFoundError` (also `getByReference` finding nothing) |
| 409 | `ValidationException` | `ConflictError` (`unique_violation`, `merchant_not_ready`, `tx_already_sent`, …) |
| 410 | `ValidationException` | `GoneError` |
| 422 | `ValidationException` | `IdempotencyError` |
| 429 | `RateLimitException` | `RateLimitError` (`retryAfter` in seconds) |
| 5xx, unexpected 3xx | `ServerException` | `ServerError` |
| no response | `NetworkException`, or a raw `axios` error | `NetworkError` (`cause`) |
| bad webhook signature | `ValidationException` | `WebhookSignatureError` (`reason`) |

Every `ApiError` carries `status`, `code` (branch on it, never on the message), `details`,
`requestId` (quote it to support), `fieldErrors`, `rawMessage` and `rawBody`. `isRetryable(err)`
tells the transient failures. `instanceof` works across the ES module and CommonJS builds.

### Retries and idempotency

- 2.x retried every method on 5xx and network errors, POSTs included, so a retried create could
  run twice. 3.0 retries **reads and the 6 creates only** (`checkoutSessions.createPayment` and
  `createSubscription`, `products.create`, `customers.create`, `invitations.create`,
  `webhooks.endpoints.create`), on network errors, timeouts, 5xx and 429, waiting 1 s, 2 s, 4 s
  (and `Retry-After` on a 429, up to 60 s).
- Each create sends an `Idempotency-Key`, the same on its retries: a retried create returns the
  first result. Pass your own key (``{ idempotencyKey: `checkout-${orderId}` }``) to also cover a
  job re-run after a crash.
- Updates, deletes, `cancel`, `expire`, `trust`, `remove`, `revoke` and `verifyRemote` are never
  retried.
- `maxRetries: 0` now **disables** retries (it meant the default in 2.x); `timeout` bounds each
  attempt, and a `signal` bounds the whole call. Drop any retry loop you wrapped around reads and
  creates.

### Pagination

`getAll({ limit, cursor })` becomes `list({ limit, cursor, ...filters })`, returning
`Page<T> = { items, hasMore, nextCursor? }`. **`hasMore` is a property now, not a method**:
replace `page.hasMore()` with `page.hasMore`. While `page.hasMore`, pass `page.nextCursor` back as
`cursor`, unchanged. Or let the iterator walk every page:

```ts
for await (const s of client.subscriptions.iterate({ limit: 100 })) {
	console.log(s.uuid, s.status);
}
```

`products.list` and `refunds.list` are paginated now (they returned arrays). The short lists
(`currencies.list`, `wallets.*`, `members.listHeldFunds`, `accounting.exportJson`) return arrays.

### Webhooks

The scheme is new: 2.x verification code does not carry over.

| | 2.x | 3.0 |
|---|---|---|
| Headers | `X-Webhook-Signature-256: sha256=<hex>`, `X-Webhook-Timestamp`, `X-Webhook-Id` | `QBitFlow-Signature: t=<unix>,v1=<hex>`, `QBitFlow-Event-Id`, `QBitFlow-Event-Type` |
| Signed content | the timestamp and the body re-encoded as canonical JSON | the timestamp and the **raw body**, exactly as received |
| Secret rotation | one secret | both secrets verify for 24 hours after a rotation |
| Body | `SessionWebhookResponse` or `SubscriptionStatusTransitionWebhook` | an event `{ id, type, createdAt, test, userUuid, data }` |
| Dashboard test | `X-Webhook-Id: test-webhook-id` | a `webhook.test` event |

- **Read the raw body and never re-serialize it** before verifying: with Express, use
  `express.raw({ type: 'application/json' })` on the webhook route, not `express.json()`.
- **Event types** replace the two 2.x payloads: the transaction webhook becomes
  `payment.completed` / `subscription.created`, the subscription webhook `subscription.billed` /
  `subscription.statusChanged`, and new types arrive (`checkout.expired`, `refund.requested`,
  `refund.approved`, `member.joined`, …). A `switch` on `event.type` narrows `event.data`.
- Deliveries are **at least once**: deduplicate on `event.id`, and answer 2xx fast, also to the
  types you ignore.
- A seller's events carry `event.userUuid`: pass it to `client.onBehalfOf` for follow-up reads.

### Test mode and live mode

A key belongs to one mode, and only sees that mode's data. Test mode runs on test networks, caps a
checkout at `'5'` USD, and bills subscriptions only when you call `subscriptions.testBill`. Live
mode needs `https` redirect and webhook URLs. Check the mode at start-up with
`(await client.me()).space?.test`.

### Subscriptions and access

**Grant access while `now < accessUntil`** (from 3.1.0; `currentPeriodEnd`, plus an hour for an
`active` subscription while its renewal is billed), whatever the status: a check like
`status === 'active'` cuts off customers who paid (`stopped`, `paused`) and keeps serving
`pastDue` ones. `hasAccess(subscription)` applies the rule.

### Checkouts

A failed payment attempt no longer ends a checkout: the session stays `created`, with
`lastAttempt` set, and the customer can try again until it expires. Never cancel an order on it:
fulfil on `payment.completed`, release the order on `checkout.expired`.

## Final checklist

- [ ] Node.js 20 or later; `qbitflow@^3` installed; `axios` / `ws` removed if unused.
- [ ] New API keys from the dashboard; `baseUrl` (if set) points at `/v2`.
- [ ] `client.me()` called at start-up, asserting the mode you expect.
- [ ] Every call migrated (`tsc` reports no error); `onBehalfOf` uses `client.onBehalfOf(userUuid)`.
- [ ] Stored numeric product and user ids mapped to UUIDs.
- [ ] Money read and written as decimal strings; fee rates as percents.
- [ ] `page.hasMore()` replaced with `page.hasMore`, or loops replaced with `iterate()`.
- [ ] Errors matched on the new classes and on `err.code`; your own retry loops around reads and
  creates removed.
- [ ] Webhook route reads the raw body and verifies with `webhooks.router` or
  `webhooks.constructEvent`; handlers deduplicate on `event.id`; endpoint and secret created for
  v2.
- [ ] Subscription access checks use `accessUntil` (`hasAccess`).
- [ ] Tested end to end with a test-mode key, then deployed with the live key.

Questions? Email [support@qbitflow.app](mailto:support@qbitflow.app). The
[README](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/README.md) documents 3.0 in full,
and the [CHANGELOG](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/CHANGELOG.md) lists
every change.
