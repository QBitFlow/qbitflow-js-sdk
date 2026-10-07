# QBitFlow JavaScript/TypeScript SDK

[![npm version](https://img.shields.io/npm/v/qbitflow.svg)](https://www.npmjs.com/package/qbitflow)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](#installation)

Official JavaScript/TypeScript SDK for [QBitFlow](https://qbitflow.app) - a comprehensive cryptocurrency payment processing platform that enables seamless integration of crypto payments and recurring subscriptions into your applications.

## Features

- 🔐 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🚀 **Easy to Use**: Simple, intuitive API design
- 🔄 **Automatic Retries**: Built-in retry logic for failed requests
- 📦 **Dual Package**: Works with both CommonJS and ES modules
- 🧪 **Well Tested**: Comprehensive test coverage
- 📚 **Great Documentation**: Detailed docs with examples
- 🔌 **Webhook Support**: Handle payment and subscription-status notifications easily
- 💳 **One-Time Payments**: Accept cryptocurrency payments with ease
- 🔄 **Recurring Subscriptions**: Automated recurring billing in cryptocurrency
- 👥 **Customer Management**: Create and manage customer profiles
- 🛍️ **Product Management**: Organise your products and pricing
- 📈 **Transaction Tracking**: Webhook notifications and on-demand transaction status
- 💰 **Refunds**: Query and track refund entries
- 📊 **Accounting Export**: Export payment data as JSON or CSV
- 🔑 **Account Claims**: Manage user fund claim requests

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Response Types](#response-types)
- [Acting on Behalf of a User](#acting-on-behalf-of-a-user)
- [One-Time Payments](#one-time-payments)
- [Subscriptions](#subscriptions)
- [Transaction Status](#transaction-status)
- [Refunds](#refunds)
- [Accounting Export](#accounting-export)
- [Claims](#claims)
- [Customer Management](#customer-management)
- [Product Management](#product-management)
- [User Management](#user-management)
- [API Key Management](#api-key-management)
- [Currencies](#currencies)
- [Webhook Handling](#webhook-handling)
  - [Configuring Webhook URLs](#configuring-webhook-urls)
  - [Transaction Webhooks](#transaction-webhooks)
  - [Subscription Status Webhooks](#subscription-status-webhooks)
  - [Test Webhooks](#test-webhooks)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
- [License](#license)
- [Support](#support)
- [Changelog](#changelog)

## Installation

Requires **Node.js 18 or later**. The package ships CommonJS and ES-module builds plus type
declarations, and is verified before every release by importing the packed tarball from a
CommonJS project, a `"type": "module"` project and a TypeScript `moduleResolution: nodenext`
project.

```bash
npm install qbitflow
```

Or using yarn:

```bash
yarn add qbitflow
```

## Quick Start

### 1. Get Your API Key

Sign up at [QBitFlow](https://qbitflow.app) and obtain your API key from the dashboard.

### 2. Initialize the Client

```typescript
import { QBitFlow } from 'qbitflow';

const client = new QBitFlow(process.env.QBITFLOW_API_KEY!);
```

### 3. Create a One-Time Payment

```typescript
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	successUrl: 'https://yourapp.com/success',
	cancelUrl: 'https://yourapp.com/cancel',
});

console.log('Payment link:', payment.link); // Send this link to your customer
```

> **Webhook URLs are configured in the dashboard.** Set your **Transaction webhook**
> (and **Subscription status webhook**) URLs under settings in the [QBitFlow dashboard](https://qbitflow.app).
> They can no longer be set per session. See [Webhook Handling](#webhook-handling).

### 4. Create a Recurring Subscription

```typescript
const subscription = await client.subscriptions.createSession({
	productId: 1,
	frequency: { unit: 'months', value: 1 }, // Bill monthly
	trialPeriod: { unit: 'days', value: 7 }, // 7-day free trial (optional)
});

console.log('Subscription link:', subscription.link);
```

### 5. Check Transaction Status

```typescript
import { TransactionType, TransactionStatusValue } from 'qbitflow';

const status = await client.transactionStatus.get(payment.uuid, TransactionType.ONE_TIME_PAYMENT);

if (status.status === TransactionStatusValue.COMPLETED) {
	console.log('Payment completed! Transaction hash:', status.txHash);
} else if (status.status === TransactionStatusValue.FAILED) {
	console.log('Payment failed:', status.message);
}
```

## Configuration

| Option       | Type   | Default                       | Description                                                                 |
| ------------ | ------ | ----------------------------- | --------------------------------------------------------------------------- |
| `apiKey`     | string | (required)                    | Your QBitFlow API key (a blank key is rejected)                             |
| `baseUrl`    | string | `https://api.qbitflow.app/v1` | Absolute `http(s)://` API base URL (a trailing slash is removed; point it at a local server for testing) |
| `timeout`    | number | `30000`                       | Request timeout in milliseconds                                             |
| `maxRetries` | number | `3`                           | Retry budget for idempotent requests (see below); `0` disables retries        |

### Retry policy

Only **GET** requests are retried, and only when the failure is a **network error** (no
response) or a **5xx**. POST, PUT and DELETE are sent exactly once, so a checkout session or
a customer is never created twice because a proxy timed out after the server had already
processed the request. The GET routes that perform an action — `subscriptions.forceCancel()`,
`subscriptions.executeTestBilling()` and `claims.triggerTestClaimFunds()` — are never retried
either. `4xx`, `429`, `3xx` and requests that cannot be sent at all (a configuration error such
as an invalid URL) are never retried. Back-off is exponential: 1 s, 2 s, 4 s.

Redirects are **not followed**: a `3xx` surfaces as a `ServerException` (it means the base URL
is misconfigured), so your API key is never forwarded to whatever host a redirect names.

Every request carries `X-API-Key` and `User-Agent: qbitflow-js/<version>`.

## Response Types

Every response is decoded against the server's type before it reaches you, so each object
matches its TypeScript type at runtime, not just at compile time:

- A field without `| null` is **always present**. When the API leaves an optional value out,
  you get its zero value — `0`, `''`, `false`, `[]`, a zero-valued nested object — exactly as
  the Go server would read it. For example `payment.productId` is `0` for a payment that was
  not for a stored product, `session.reference` is `''` when you set none, and a list the API
  sends as `null` arrives as `[]`.
- A field typed `T | null` (a pointer on the server) is **always present** as its value or
  `null`: `payment.reference`, `payment.customerUUID`, `subscription.minimumCancellationDate`,
  `refund.respondedAt`, `user.claimedAt`, `apiKey.expiresAt`, `currency.mainCurrency` …
- Timestamps are RFC3339 strings. A non-nullable timestamp the API did not set is Go's zero
  time, `0001-01-01T00:00:00Z` (e.g. `subscription.lastBillingDate` before the first billing).
- A field of the **wrong JSON type** is a response-shape failure: a `ServerException` whose
  message names the field path (`items[2].currency.id`) and whose `statusCode` is the HTTP
  status. Unknown extra fields are kept; enum values the SDK does not know stay raw strings.
- Payments, combined payments, subscriptions and subscription billings carry the full
  `currency` object (`payment.currency.symbol`); `currencyId` is there too.

## Acting on Behalf of a User

If you hold an **organization (admin) API key**, you can perform any request as one of the users in your organization, without needing that user's own API key. This is useful for admin-level tooling, dashboards, and back-office automation where your server acts for a specific user (e.g. listing _their_ products, creating a payment session _for them_, or reading _their_ subscriptions).

`client.onBehalfOf(userId)` returns a client whose **every** service adds an `On-Behalf-Of`
header to each request, sharing this client's transport and configuration. Every service also
has its own `onBehalfOf(userId)`, which scopes just that service. The original client is left
untouched either way, so you can freely mix org-level and per-user calls.

```typescript
const userId = 123;

// A client acting as user 123 for everything
const asUser = client.onBehalfOf(userId);
const products = await asUser.products.getAll();
const userPayments = await asUser.oneTimePayments.getAll();

// Or scope a single service
const theirCustomers = await client.customers.onBehalfOf(userId).getAll();

// The base client is unaffected — this call still runs at the organization level
const allOrgProducts = await client.products.getAll();
```

> **Note:** `onBehalfOf` requires an organization-level admin/owner API key. The API refuses a
> user that is not in your organization with `404`.
> `onBehalfOf(0)` acts at the organization level (the header is omitted); a negative,
> non-integer or unsafe (> 2^53 − 1) id throws a `ValidationException`.

## One-Time Payments

### Create a Payment Session

Provide either a `productId` / `productReference` or inline product details (`productName` +
`description` + `price`, where the price must be greater than 0):

```typescript
// Using an existing product, pre-filling an existing customer by UUID
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	customerUUID: '01997c89-d0e9-7c9a-9886-fe7709919695', // a bare UUID; omit to collect at checkout
	successUrl: 'https://yourapp.com/success',
	cancelUrl: 'https://yourapp.com/cancel',
});

// Or with inline product details
const payment = await client.oneTimePayments.createSession({
	productName: 'Custom Product',
	description: 'Product description',
	price: 99.99, // USD, greater than 0
});

console.log(payment.uuid); // Session UUID
console.log(payment.link); // Payment link for customer
```

#### Using your own references

Instead of storing QBitFlow's internal UUIDs, you can pass your own identifiers when creating
a session. Set `reference` to your order/invoice ID, and use `productReference` /
`customerReference` to select an existing product or customer by your own reference:

```typescript
const payment = await client.oneTimePayments.createSession({
	reference: 'order-1234', // your own transaction reference
	productReference: 'PROD-PREMIUM', // use a product by your reference (instead of productId)
	customerReference: 'user-42', // use a customer by your reference (instead of customerUUID)
});
```

The `reference` is echoed back on the resulting `Payment` and in webhook payloads, and you can
look the payment up later with [`getByReference()`](#get-payment-by-reference). If no customer
matches `customerReference`, one is created during checkout. Empty optional strings count as
"not provided" and are left out of the request.

### Get Payment Session

```typescript
const session = await client.oneTimePayments.getSession(payment.uuid);
console.log(session.productName, session.price);

// By default the API answers with an error when the session is close to expiry. Pass
// `false` to always get the session data:
const anyway = await client.oneTimePayments.getSession(payment.uuid, false);
```

`oneTimePayments.getSession()` only returns one-time payment sessions: a subscription session
throws a `ValidationException` telling you to use `subscriptions.getSession()` (and the other
way round).

### Get Completed Payment

```typescript
const payment = await client.oneTimePayments.get('pay@01997c89-d0e9-7c9a-9886-fe7709919695');
console.log(payment.transactionHash, payment.amount);
console.log(payment.currency.symbol, payment.currency.decimals); // the full currency object

// Structured, typed metadata (fee breakdown, on-chain details, per-party amounts) is always
// present on a payment:
console.log(payment.metadata.feeBps);
console.log(payment.metadata.txMetadata.blockData.number);
console.log(payment.metadata.txAmounts.usd.merchant);
console.log(payment.metadata.organizationFee?.feeBps ?? 0); // null when there is none

// Nullable values are always present, as a value or null:
console.log(payment.reference ?? '(no reference)', payment.customerUUID ?? '(no customer)');
```

`CombinedPayment.metadata` is `PaymentMetadata | null`, `RefundEntry.metadata` is
`TxMetadata | null`. Min-unit amounts are decimal strings.

### Get Payment by Reference

Look a payment up by the `reference` you assigned when creating the session — no need to store
QBitFlow's UUID:

```typescript
const payment = await client.oneTimePayments.getByReference('order-1234');
console.log(payment.uuid, payment.amount);
```

> References are escaped correctly in the URL, but the API currently cannot route a reference
> containing `/` (it answers `404`) — avoid `/` in the references you assign. The same applies
> to product, customer and subscription references.

### List All Payments

```typescript
const result = await client.oneTimePayments.getAll({ limit: 10 });

console.log(result.items); // Array of payments
console.log(result.hasMore()); // Whether there are more pages

if (result.hasMore()) {
	const nextPage = await client.oneTimePayments.getAll({
		limit: 10,
		cursor: result.nextCursor,
	});
}
```

### List Combined Payments

Get all payments (one-time and subscription billings) in a single feed:

```typescript
const result = await client.oneTimePayments.getAllCombined({ limit: 20 });
result.items.forEach((payment) => {
	console.log(payment.source); // "payment" or "subscription_history"
	console.log(payment.amount, payment.amountMinUnits);
});
```

### Get Customer for a Transaction

```typescript
const customer = await client.oneTimePayments.getCustomerForTransaction(payment.uuid);
console.log(customer.email);
```

## Subscriptions

### Create a Subscription


```typescript
const subscription = await client.subscriptions.createSession({
	productId: 1,
	frequency: { unit: 'months', value: 1 }, // Bill monthly — required, value 1..4294967295
	trialPeriod: { unit: 'days', value: 7 }, // 7-day trial (optional; 0 = no trial)
	minPeriods: 3, // Minimum commitment periods (optional; 0 = none)
});

console.log(subscription.link);
```

Like one-time payments, subscription sessions accept your own `reference`, `productReference`,
and `customerReference` instead of QBitFlow's internal IDs:

```typescript
const subscription = await client.subscriptions.createSession({
	reference: 'sub-1234', // your own subscription reference
	productReference: 'PLAN-PRO', // select a product by your reference
	customerReference: 'user-42', // select a customer by your reference
	frequency: { unit: 'months', value: 1 },
});
```

> **Track lifecycle changes with webhooks, not polling.** Previously you had to run a
> cron job that periodically fetched each subscription with `subscriptions.get()` to detect
> status changes and act on them. Now you can set a **Subscription status webhook** URL in
> the dashboard settings and QBitFlow will notify you on every status transition
> (`active` → `past_due`, `trial` → `active`, etc.), eliminating the need for a cron job.
> See [Subscription Status Webhooks](#subscription-status-webhooks).

### Frequency Units

Available units for `frequency` and `trialPeriod`:

`seconds` · `minutes` · `hours` · `days` · `weeks` · `months` · `years`

### Get Subscription Session

```typescript
const session = await client.subscriptions.getSession(subscription.uuid);
// Returns SubscriptionSession — frequency and trialPeriod are in raw seconds (trialPeriod 0 = none)
console.log(session.frequency, session.trialPeriod);

// Pass `false` to skip the API's close-to-expiry error (default: true)
const anyway = await client.subscriptions.getSession(subscription.uuid, false);
```

### Get Subscription

```typescript
const sub = await client.subscriptions.get('sub@01997c89-d0e9-7c9a-9886-fe7709919695');
console.log(sub.subscriptionStatus, sub.nextBillingDate, sub.currency.symbol);
// lastBillingDate is Go's zero time (0001-01-01T00:00:00Z) until the first billing;
// minimumCancellationDate is null unless minPeriods was set.
```

### Get Subscription by Reference

Look a subscription up by the `reference` you assigned when creating the session:

```typescript
const sub = await client.subscriptions.getByReference('sub-1234');
console.log(sub.uuid, sub.subscriptionStatus);
```

### Get Subscription Payment History

```typescript
const history = await client.subscriptions.getPaymentHistory(sub.uuid); // [] for an unknown id
history.forEach((record) => {
	console.log(record.uuid, record.amount, record.currency.symbol, record.createdAt);
});
```

### Force-Cancel a Subscription

Bypasses the normal subscriber-signed cancellation flow (admin use only):

```typescript
const result = await client.subscriptions.forceCancel(sub.uuid);
console.log(result.message);
```

### Execute Test Billing Cycle

**Test mode only** — manually trigger a billing cycle to validate your webhook handling.
The API enforces the schedule: a subscription that is not yet due answers `409`, which the
SDK throws as `ConflictException`.

```typescript
import { ConflictException } from 'qbitflow';

try {
	const result = await client.subscriptions.executeTestBilling(sub.uuid);
	console.log(result.message);
} catch (error) {
	if (error instanceof ConflictException) {
		console.log('Not due for billing yet');
	} else {
		throw error;
	}
}
```

## Transaction Status

### Check Status

```typescript
import { TransactionType } from 'qbitflow';

const status = await client.transactionStatus.get(payment.uuid, TransactionType.ONE_TIME_PAYMENT);

console.log(status.status); // "created", "pending", "completed", etc.
console.log(status.txHash); // On-chain transaction hash ('' until broadcast)
console.log(status.settlementDetails?.txAmounts.usd.merchant); // null until settled
```

### Transaction Types

```typescript
enum TransactionType {
	ONE_TIME_PAYMENT = 'payment',
	TRANSFER = 'transfer',
	TOKEN_TRANSFER = 'tokenTransfer',
	CREATE_SUBSCRIPTION = 'createSubscription',
	CANCEL_SUBSCRIPTION = 'cancelSubscription',
	EXECUTE_SUBSCRIPTION_PAYMENT = 'executeSubscription',
	CREATE_PAYG_SUBSCRIPTION = 'createPAYGSubscription',
	CANCEL_PAYG_SUBSCRIPTION = 'cancelPAYGSubscription',
	INCREASE_ALLOWANCE = 'increaseAllowance',
	UPDATE_MAX_AMOUNT = 'updateMaxAmount',
	REFUND = 'refund',
	FAUCET = 'faucet',
	CLAIM_FUNDS = 'claimFunds',
}
```

### Following a transaction

To know when a transaction completes, use **webhooks** (recommended — QBitFlow notifies your
server when a checkout completes and on every subscription status change; see
[Webhook Handling](#webhook-handling)) or **poll `transactionStatus.get()`**. A transaction
that has not been processed yet answers `404` (`NotFoundException`).

### Unknown enum values

Enum-typed response fields (`subscriptionStatus`, `status`, `role`, `txType`, `source`, …) are
typed `<Enum> | (string & {})`: the enum members still autocomplete, and a value this SDK does
not know yet is passed through as its raw string — never coerced to a default — so compare
against the enum members and treat anything else as "unknown" (for a subscription: not
active). Where a method takes an enum (`transactionStatus.get()`, `CreateUserDto.role`), the
string value (`'payment'`, `'user'`) is accepted too.

### Status Values

```typescript
enum TransactionStatusValue {
	CREATED = 'created',
	WAITING_CONFIRMATION = 'waitingConfirmation',
	PENDING = 'pending',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
	EXPIRED = 'expired',
}
```

## Refunds

### Get Refund by Transaction UUID

Public endpoint — no authentication required:

```typescript
const refund = await client.refunds.getByTransaction('pay@01997c89-d0e9-7c9a-9886-fe7709919695');
console.log(refund.status, refund.reason);
console.log(refund.merchantMessage || '(no answer yet)', refund.respondedAt ?? '(pending)');
```

### List Active Refunds

```typescript
const refunds = await client.refunds.getAll();
refunds.forEach((r) => console.log(r.uuid, r.status, r.amountMinUnits));
```

### List Inactive (Resolved) Refunds

```typescript
const result = await client.refunds.getAllInactive({ limit: 20 });
result.items.forEach((r) => console.log(r.uuid, r.respondedAt));

if (result.hasMore()) {
	const next = await client.refunds.getAllInactive({ cursor: result.nextCursor });
}
```

### Refund Statuses

```typescript
enum RefundStatus {
	PENDING = 'pending',
	APPROVED = 'approved',
	REFUSED = 'refused',
	FAILED = 'failed',
}
```

## Accounting Export

Export transaction data for reconciliation and bookkeeping.

```typescript
import fs from 'fs';

// JSON export — typed as AccountingEvent[]
const events = await client.accounting.export('2026-08-01', '2026-08-31', 'json');
events.forEach((e) => {
	console.log(e.paymentId, e.type, e.netAmountUsd);
});

// CSV export — typed as string (the header row is always included)
const csv = await client.accounting.export('2026-08-01', '2026-08-31', 'csv');
fs.writeFileSync('transactions.csv', csv);
```

Dates are `YYYY-MM-DD` calendar dates and `from` must not be after `to`; how wide a window the
API accepts is decided by the API (an error answer is parsed the same way for both formats).
Each `AccountingEvent` includes: transaction identifiers, product info, on-chain details (chain,
block, tx hash, addresses), token info, gross/net amounts, platform and organization fees, and
network fees for refunds. `type` is `payment`, the subscription-billing value
(`subscriptionHistory`; the API docs also spell it `subHistory`), `refund`, `organizationFee` or
`referralFee`.

## Claims

Claims enable organizations to transfer accumulated earnings to users who have claimed their account.

### Get Pending Claim Obligations

```typescript
const funds = await client.claims.getFunds();
funds.forEach((f) => {
	console.log(`User ${f.userId} is owed $${f.totalAmountOwed}`);
});
```

### Create a Claim Request for a User

Generate a one-time link that lets the user set up their password and wallet (admin only):

```typescript
const { link } = await client.claims.createRequest(userId);
// Send `link` to the user via email
console.log('Claim link:', link);
```

### Get an Existing Claim Request for a User

Check whether a claim request already exists for a given user and retrieve the link:

```typescript
const { link } = await client.claims.getRequestByUser(userId);
console.log('Existing claim link:', link);
```

### Trigger Test Claim Fund Computation

**Test mode only** — manually compute ledger totals for a user without waiting for the hourly job:

```typescript
await client.claims.triggerTestClaimFunds(userId);
```

## Customer Management

### Create a Customer

```typescript
const customer = await client.customers.create({
	name: 'John',
	lastName: 'Doe',
	email: 'john@example.com',
	phoneNumber: '+1234567890',
	reference: 'CRM-12345',
});
console.log('Customer created:', customer.uuid);
```

### Get Customer

```typescript
const customer = await client.customers.get('01997c89-d0e9-7c9a-9886-fe7709919695');
const byEmail = await client.customers.getByEmail('john@example.com');
const byReference = await client.customers.getByReference('CRM-12345');
console.log(customer.phoneNumber || '(no phone)', customer.userId); // '' / 0 when not set
```

### List Customers

```typescript
const result = await client.customers.getAll({ limit: 10 });
if (result.hasMore()) {
	const next = await client.customers.getAll({ limit: 10, cursor: result.nextCursor });
}
```

### Update Customer

```typescript
// Updates are partial: send only what changes, everything else is left untouched.
// An empty string counts as "not provided".
const updated = await client.customers.update(customer.uuid, {
	name: 'John',
});

// Or several fields at once
await client.customers.update(customer.uuid, {
	name: 'John',
	lastName: 'Doe',
	email: 'john.doe@example.com',
	phoneNumber: '+9876543210',
});

// Note: `reference` is immutable and cannot be updated.
```

### Delete Customer

```typescript
const response = await client.customers.delete(customer.uuid);
console.log(response.message);
```

## Product Management

### Create a Product

```typescript
const product = await client.products.create({
	name: 'Premium Subscription',
	description: 'Access to all premium features',
	price: 29.99,
	reference: 'PROD-PREMIUM',
});
```

### Get, List, Update, Delete

```typescript
const product = await client.products.get(1);
const byRef = await client.products.getByReference('PROD-PREMIUM');
const all = await client.products.getAll();

// Partial update: omitted fields keep their current value
const updated = await client.products.update(1, { price: 39.99 });

await client.products.update(1, {
	name: 'Premium Plus',
	description: 'Enhanced features',
	price: 39.99,
});

await client.products.delete(1);
```

## User Management

### Create a User

```typescript
import { UserRole } from 'qbitflow';

// Create (admin only)
const user = await client.users.create({
	name: 'Alice',
	lastName: 'Smith',
	email: 'alice@example.com',
	role: UserRole.USER,      // UserRole.USER / UserRole.ADMIN, or 'user' / 'admin' (HANDLE / OWNER are read-only)
	organizationFeeBps: 100,  // optional, an integer 0–5000 (1% fee)
});
```

### Get, List, Update, Delete

```typescript
// Get current user (identified by API key)
const me = await client.users.get();

// Get by ID / list all (admin only)
const byId = await client.users.getById(42);
const all = await client.users.getAll();

// Get by email (admin only for other users in the organization)
const byEmail = await client.users.getByEmail('alice@example.com');

// Update — partial: omitted fields keep their current value
const updated = await client.users.update(user.id, { name: 'Alicia' });

// organizationFeeBps requires admin authority (an admin/owner key, or an
// organization-level key via onBehalfOf). A non-admin caller sending it gets a 403.
await client.users.update(user.id, { organizationFeeBps: 250 }); // 2.5%

// Note: passwords cannot be changed through this SDK. It is a JWT-only, self-service
// operation on the API, so the field is intentionally absent from UpdateUserDto.

// Delete (admin only)
await client.users.delete(user.id);
```

## API Key Management

> **Note:** Creating and deleting API keys is a JWT-only operation on the API — it cannot be
> performed with an API key, which is the only credential this SDK uses. Manage keys from the
> [QBitFlow dashboard](https://qbitflow.app). The SDK exposes read access only.

```typescript
// List API keys for the current user
const keys = await client.apiKeys.getAll();

// List API keys for a specific user (admin only)
const forUser = await client.apiKeys.getForUser(userId);
```

## Currencies

Public lookups that resolve the currency IDs returned in `SessionCheckout.availableCurrencies`.
(Payments and subscriptions already carry their full `currency` object.) No authentication is
required for these endpoints.

```typescript
// All supported currencies (native currencies and tokens)
const available = await client.currencies.getAllAvailable();

// Only main (native / blockchain) currencies, excluding tokens
const main = await client.currencies.getAllMain();

// Resolve the currency IDs on a checkout session
const session = await client.oneTimePayments.getSession(payment.uuid);
const byId = new Map(available.map((c) => [c.id, c]));
const accepted = session.availableCurrencies.map((id) => byId.get(id));
```

## Webhook Handling

### Verifying a webhook signature

Every webhook QBitFlow sends carries three headers:

| Header | Meaning |
|---|---|
| `X-Webhook-Signature-256` | HMAC signature, formatted `sha256=<hex>` |
| `X-Webhook-Timestamp` | Send time, in unix seconds |
| `X-Webhook-Id` | Transaction id, e.g. `pay@<uuid>` |

There are two ways to check a webhook is genuine, and you can use either:

| | Needs the secret | Network call | Use when |
|---|---|---|---|
| **Local** | yes | none | Default. Faster, and keeps working if the API is unreachable. |
| **Remote** | no | one per webhook | You would rather not hold the secret at all. |

Local verification performs the same three checks the server does: the timestamp is within
a replay window (5 minutes by default), the HMAC matches, and the comparison is
constant-time so a timing side channel cannot be used to guess the signature.

**Why the signature covers a canonical rendering, not the raw bytes.** JSON object key
order is not significant, and proxies, frameworks and logging layers routinely re-serialize
a body and reorder keys. Signing raw bytes would reject a payload that is in fact
untouched. So both sides sign `<timestamp>.<canonical-json>`, where canonical means keys
sorted at every level and no insignificant whitespace. You do not have to do anything for
this — pass the body you received and the SDK handles it.

Get your webhook secret from the QBitFlow dashboard. Treat it like a password: keep it in
your environment or secret manager, never in source control.

```typescript
import express from 'express';
import { verifyWebhookSignature, extractWebhookHeaders, parseSessionWebhook } from 'qbitflow';

const app = express();

// Use the raw body: re-serializing before verification is fine (the signature is computed
// over a canonical form), but the raw body is what you will want to parse anyway.
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
    const { signature, timestamp, isTest } = extractWebhookHeaders(req.headers);

    try {
        verifyWebhookSignature(process.env.QBITFLOW_WEBHOOK_SECRET!, timestamp, signature, req.body);
    } catch {
        return res.status(400).send('invalid webhook');
    }

    // Verified. The dashboard's connectivity check is signed like any other delivery, so it
    // has just exercised your real setup — acknowledge it and stop, there is no transaction.
    if (isTest) return res.sendStatus(200);

    const event = parseSessionWebhook(req.body); // typed, every field present
    res.sendStatus(200);
});
```

`verifyWebhookSignature`, `client.webhooks.verify` and the `parse*Webhook` helpers all accept the
body as a `string`, a `Buffer`, a `Uint8Array`, an `ArrayBuffer`, or the already-parsed JSON.

`extractWebhookHeaders` takes anything header-shaped, so it works across frameworks: a Node
`IncomingHttpHeaders` (Express, Fastify, raw `http`), a Fetch `Headers` instance (Next.js
route handlers, Hono, Deno, Bun), or a plain object. Lookup is case-insensitive.

```typescript
// Next.js route handler
export async function POST(request: Request) {
    const body = await request.text();
    const { signature, timestamp } = extractWebhookHeaders(request.headers);

    try {
        verifyWebhookSignature(process.env.QBITFLOW_WEBHOOK_SECRET!, timestamp, signature, body);
    } catch {
        return new Response('invalid webhook', { status: 400 });
    }

    return new Response(null, { status: 200 });
}
```

To widen or narrow the replay window (it must match the server's setting):

```typescript
verifyWebhookSignature(secret, timestamp, signature, body, { maxTimestampAgeSeconds: 600 });
```

To verify through the API instead, with no secret in your process:

```typescript
// `false` only when the API rejects the signature (400); an outage throws — answer 5xx so
// QBitFlow retries the delivery.
const ok = await client.webhooks.verify(req.body, signature, timestamp);
```

### Configuring Webhook URLs

Webhook endpoint URLs are configured in the [QBitFlow dashboard](https://qbitflow.app) settings,
**not** per session. There are two independent webhooks:

- **Transaction webhook** — fired when a payment or subscription-checkout session changes status
  (payload: [`SessionWebhookResponse`](#transaction-webhooks)).
- **Subscription status webhook** — fired when an existing subscription transitions between statuses
  (payload: [`SubscriptionWebhook`](#subscription-status-webhooks)).

> **Migration note (1.2.1):** `webhookUrl` was removed from `createSession()` for both one-time
> payments and subscriptions. Set the **Transaction webhook** URL in the dashboard instead — this
> ensures consistent webhook handling across all transactions.

All webhooks are signed with HMAC. Verify every request — locally with
`verifyWebhookSignature(...)` or through the API with `client.webhooks.verify(...)` — before
processing it, using the headers exposed by the SDK:

| Getter                              | Header                     | Purpose                                 |
| ----------------------------------- | -------------------------- | --------------------------------------- |
| `client.webhooks.signatureHeader`   | `X-Webhook-Signature-256`  | HMAC signature to verify                |
| `client.webhooks.timestampHeader`   | `X-Webhook-Timestamp`      | Timestamp included in the signed payload |
| `client.webhooks.webhookIdHeader`   | `X-Webhook-Id`             | Transaction id, e.g. `pay@<uuid>` (see [Test Webhooks](#test-webhooks)) |

### Transaction Webhooks

Point your dashboard **Transaction webhook** URL at this endpoint. Decode the body with
`parseSessionWebhook()`: it returns a `SessionWebhookResponse`, whose `session` field is a
`SessionCheckout` (`OneTimePaymentSession | SubscriptionSession`, decoded by `txType` — narrow it
with `isSubscriptionSession()`).

```typescript
import express from 'express';
import {
	QBitFlow,
	TransactionStatusValue,
	isSubscriptionSession,
	parseSessionWebhook,
} from 'qbitflow';

const app = express();
const qbitflowClient = new QBitFlow(process.env.QBITFLOW_API_KEY!);

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
	const signature = req.headers[qbitflowClient.webhooks.signatureHeader.toLowerCase()] as string;
	const timestamp = req.headers[qbitflowClient.webhooks.timestampHeader.toLowerCase()] as string;
	const webhookId = req.headers[qbitflowClient.webhooks.webhookIdHeader.toLowerCase()] as string;

	if (!signature || !timestamp) {
		res.status(400).json({ error: 'Missing required headers' });
		return;
	}

	if (!(await qbitflowClient.webhooks.verify(req.body, signature, timestamp))) {
		res.status(401).json({ error: 'Invalid signature' });
		return;
	}

	// Reachability check from the dashboard "Test webhook" action — acknowledge and stop.
	if (webhookId === qbitflowClient.webhooks.testWebhookId) {
		res.status(200).json({ received: true });
		return;
	}

	const event = parseSessionWebhook(req.body);
	const session = event.session;

	// `status` is null when the server has none to report.
	if (event.status?.status === TransactionStatusValue.COMPLETED) {
		// `session.reference` echoes back the reference you set when creating the session
		// ('' if none), so you can match the transaction to your own order/invoice.
		console.log('Payment completed for product:', session.productName, 'ref:', session.reference);
		if (isSubscriptionSession(session)) {
			console.log('Subscription billed every', session.frequency, 'seconds');
		}
	} else if (event.status?.status === TransactionStatusValue.FAILED) {
		// Handle failed payment
	}

	res.status(200).json({ received: true });
});
```

### Subscription Status Webhooks

Point your dashboard **Subscription status webhook** URL at this endpoint to be notified whenever a
subscription transitions between statuses. This replaces the old pattern of polling
`subscriptions.get()` from a cron job.

The same endpoint also receives a delivery on each successful renewal, so the body is a
`SubscriptionWebhook` — an envelope carrying the subscription identity plus a `type`
discriminator, with the event-specific payload in `data`. Decode it with
`parseSubscriptionWebhook()` and narrow it with the type guards
`isSubscriptionStatusTransitionWebhook()` / `isSubscriptionBillingWebhook()`, which narrow
`data` too. A `type` this SDK does not know yet is kept as its raw string, with `data` left as
the raw JSON:

```typescript
type SubscriptionWebhook =
	| SubscriptionStatusTransitionWebhook   // type: 'status_transition'
	| SubscriptionBillingWebhook            // type: 'billing'
	| UnknownSubscriptionWebhook;           // any other type: raw `type` string, raw `data`

interface SubscriptionStatusTransitionWebhook {
	subscriptionUUID: string;         // subscription this delivery is about
	subscriptionReference: string;    // your own reference ('' if none was set at creation)
	type: SubscriptionWebhookType.STATUS_TRANSITION;
	data: {
		previousStatus: SubscriptionStatus | (string & {});
		currentStatus: SubscriptionStatus | (string & {});
		updatedAt: string;            // RFC3339 timestamp of the transition
	};
}

interface SubscriptionBillingWebhook {
	subscriptionUUID: string;
	subscriptionReference: string;
	type: SubscriptionWebhookType.BILLING;
	data: SubscriptionHistory;        // the billing record for the renewed period
}
```

```typescript
import {
	QBitFlow,
	SubscriptionStatus,
	isSubscriptionBillingWebhook,
	isSubscriptionStatusTransitionWebhook,
	parseSubscriptionWebhook,
} from 'qbitflow';

app.post('/subscription-status-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
	const signature = req.headers[qbitflowClient.webhooks.signatureHeader.toLowerCase()] as string;
	const timestamp = req.headers[qbitflowClient.webhooks.timestampHeader.toLowerCase()] as string;
	const webhookId = req.headers[qbitflowClient.webhooks.webhookIdHeader.toLowerCase()] as string;

	if (!signature || !timestamp) {
		res.status(400).json({ error: 'Missing required headers' });
		return;
	}

	if (!(await qbitflowClient.webhooks.verify(req.body, signature, timestamp))) {
		res.status(401).json({ error: 'Invalid signature' });
		return;
	}

	// Reachability check from the dashboard "Test webhook" action — acknowledge and stop.
	if (webhookId === qbitflowClient.webhooks.testWebhookId) {
		res.status(200).json({ received: true });
		return;
	}

	const event = parseSubscriptionWebhook(req.body);

	if (isSubscriptionBillingWebhook(event)) {
		// A period was renewed — record event.data against event.subscriptionUUID.
		console.log('billed', event.data.amount, event.data.currency.symbol);
		res.status(200).json({ received: true });
		return;
	}

	if (!isSubscriptionStatusTransitionWebhook(event)) {
		// A delivery type this SDK does not know yet: acknowledge it and look at it later.
		console.log('unknown subscription webhook type', event.type, event.data);
		res.status(200).json({ received: true });
		return;
	}

	switch (event.data.currentStatus) {
		case SubscriptionStatus.ACTIVE:
			// Grant / keep access
			break;
		case SubscriptionStatus.PAST_DUE:
		case SubscriptionStatus.LOW_ON_FUNDS:
			// Warn the customer that their next billing may fail
			break;
		case SubscriptionStatus.CANCELLED:
			// Revoke access
			break;
	}

	console.log(`${event.subscriptionUUID}: ${event.data.previousStatus} → ${event.data.currentStatus}`);

	res.status(200).json({ received: true });
});
```

### Test Webhooks

The dashboard **Test webhook** action sends a fake payload to your configured URL to confirm the
endpoint is reachable. That payload may not match the shape of a real webhook, so if you try to
process it normally your handler could error.

To handle it safely, check the incoming `X-Webhook-Id` header against
`client.webhooks.testWebhookId`. When they match, return HTTP `200` immediately and skip normal
payload processing (as shown in both examples above).

**Do this check *after* verifying the signature, not before.** Running the probe through your
verification path first is what makes the dashboard button a genuine end-to-end test of your
setup — secret, headers and all. Short-circuiting before the signature check would make the
button report success even with a broken or missing secret. This assumes the dashboard signs
the probe like a normal delivery (the SDK examples and the Express snippet above do it this way).

```typescript
if (webhookId === qbitflowClient.webhooks.testWebhookId) {
	res.status(200).json({ received: true });
	return;
}
```

## Error Handling

Every error the SDK throws extends `QBitFlowError`, so one `instanceof` catches them all. Errors
raised from an API response carry the HTTP status in `statusCode` and any per-field failures
in `fields` (`{ field, message }[]`); errors the SDK raises itself — client-side validation, a
request that got no response — leave `statusCode` undefined.

| HTTP status            | Class                   | Extra                                    |
| ---------------------- | ----------------------- | ---------------------------------------- |
| 400, 422               | `ValidationException`   | also thrown client-side (no `statusCode`) |
| 401                    | `UnauthorizedException` |                                          |
| 403                    | `ForbiddenException`    |                                          |
| 404                    | `NotFoundException`     |                                          |
| 409                    | `ConflictException`     | e.g. `executeTestBilling()` not yet due   |
| 429                    | `RateLimitException`    | `retryAfter?: number` (seconds), never retried |
| any other 4xx          | `QBitFlowError` (base)  | `statusCode` tells you which             |
| 3xx, 5xx               | `ServerException`       | 5xx on a GET is retried first            |
| empty (non-204) or non-JSON 2xx, a field of the wrong JSON type | `ServerException` | the message names the field path; `statusCode` is the response's |
| no response            | `NetworkException`      | GET retried first (not a request that could not be sent) |

```typescript
import {
	ConflictException,
	NotFoundException,
	QBitFlowError,
	RateLimitException,
	ValidationException,
} from 'qbitflow';

try {
	await client.products.create({ name: 'Widget', description: 'A fine widget', price: 0 });
} catch (error) {
	if (error instanceof ValidationException) {
		// Rejected locally (statusCode undefined) or by the API (statusCode 400/422)
		console.error(error.message, error.statusCode, error.fields);
	} else if (error instanceof NotFoundException) {
		console.error('Not found');
	} else if (error instanceof ConflictException) {
		console.error('Conflict:', error.message);
	} else if (error instanceof RateLimitException) {
		console.error('Rate limited, retry in', error.retryAfter, 's');
	} else if (error instanceof QBitFlowError) {
		console.error('QBitFlow error', error.statusCode, error.message);
	}
}
```

The message precedence for API errors is `error` → every entry of `errors[]` joined as
`Field: message; Field: message` → `message` → the plain-text body (shortened to 200
characters) → the HTTP status text. A JSON error body is parsed the same way for the CSV
export. The only errors that are not a `QBitFlowError` are the `QBitFlow` constructor's: a plain
`Error` for an invalid configuration (blank API key, malformed base URL, bad `timeout` /
`maxRetries`).

### Client-side validation

The SDK mirrors the API's `binding` rules before sending (the same rule set in all four QBitFlow
SDKs), so invalid input fails fast with the same `ValidationException` a `400` would produce:

- `alphanumspace` names (2–100 characters: letters, decimal digits, spaces, `-` `_` `'` `.`) and
  valid e-mails on customers and users; `role` `admin | user`; `organizationFeeBps` an integer
  0–5000;
- `producttext` (2–100 / 2–500, not blank, no markup or control characters) and a finite
  `price > 0` on products and inline session products;
- sessions: a product by `productId`, `productReference` or the inline triple; absolute http(s)
  redirect URLs; `customerUUID` a bare UUID; a required `frequency` (integer 1–4294967295, known
  unit) for subscriptions, `trialPeriod` and `minPeriods` 0–4294967295;
- real `YYYY-MM-DD` dates with `from <= to` for the accounting export;
- non-empty / positive identifiers on every method, a positive `limit` on pages.

Empty optional strings are left out of the request, as the API's `omitempty` treats them as "not
provided". Values JSON cannot represent (`NaN`, `Infinity`, a BigInt) are rejected before
sending.

## API Reference

### QBitFlow

Main client class.

#### Constructor

```typescript
new QBitFlow(apiKey: string)
new QBitFlow(config: QBitFlowConfig)
```

#### Methods

| Method                 | Returns    | Description                                                   |
| ---------------------- | ---------- | ------------------------------------------------------------- |
| `onBehalfOf(userId)`   | `QBitFlow` | A client whose every service sends `On-Behalf-Of` (`0` = org) |
| `getApiKey()`          | `string`   | The configured API key                                        |
| `getBaseUrl()`         | `string`   | The base URL, trailing slash removed                          |

#### Properties

| Property            | Type                         | Description                              |
| ------------------- | ---------------------------- | ---------------------------------------- |
| `customers`         | `CustomerRequests`           | Customer CRUD operations                 |
| `products`          | `ProductRequests`            | Product CRUD operations                  |
| `users`             | `UserRequests`               | User management                          |
| `apiKeys`           | `ApiKeyRequests`             | API key management                       |
| `webhooks`          | `WebhookRequests`            | Webhook signature verification           |
| `oneTimePayments`   | `PaymentRequests`            | One-time payment sessions and history    |
| `subscriptions`     | `SubscriptionRequests`       | Subscription sessions and management     |
| `transactionStatus` | `TransactionStatusRequests`  | Transaction status lookup                |
| `refunds`           | `RefundRequests`             | Refund query operations                  |
| `accounting`        | `AccountingRequests`         | Accounting data export (JSON / CSV)      |
| `claims`            | `ClaimRequests`              | Fund claim request management            |
| `currencies`        | `CurrencyRequests`           | Supported-currency lookups (public)      |

The service classes are exported as types (`import type { PaymentRequests } from 'qbitflow'`).
Webhook helpers: `verifyWebhookSignature`, `computeWebhookSignature`, `canonicalJson`,
`extractWebhookHeaders`, `parseSessionWebhook`, `parseSubscriptionWebhook`.


## License

This project is licensed under the MPL-2.0 License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://qbitflow.app/docs)
- 📧 [Email Support](mailto:support@qbitflow.app)
- 🐛 [Issue Tracker](https://github.com/qbitflow/qbitflow-js-sdk/issues)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Security

For security issues, please email security@qbitflow.app instead of using the issue tracker.

