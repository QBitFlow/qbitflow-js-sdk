# QBitFlow JavaScript/TypeScript SDK

[![npm version](https://i.ytimg.com/vi/LkHy0YWvpRI/mqdefault.jpg)](https://www.npmjs.com/package/qbitflow)
[![License: MPL-2.0](https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Mozilla_Logo_2024.svg/1920px-Mozilla_Logo_2024.svg.png)](https://opensource.org/licenses/MPL-2.0)

Official JavaScript/TypeScript SDK for [QBitFlow](https://qbitflow.app) - a comprehensive cryptocurrency payment processing platform that enables seamless integration of crypto payments and recurring subscriptions into your applications.

## Features

- 🔐 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🚀 **Easy to Use**: Simple, intuitive API design
- 🔄 **Automatic Retries**: Built-in retry logic for failed requests
- ⚡ **Real-time Updates**: WebSocket support for transaction status monitoring
- 📦 **Dual Package**: Works with both CommonJS and ES modules
- 🧪 **Well Tested**: Comprehensive test coverage
- 📚 **Great Documentation**: Detailed docs with examples
- 🔌 **Webhook Support**: Handle payment and subscription-status notifications easily
- 💳 **One-Time Payments**: Accept cryptocurrency payments with ease
- 🔄 **Recurring Subscriptions**: Automated recurring billing in cryptocurrency
- 👥 **Customer Management**: Create and manage customer profiles
- 🛍️ **Product Management**: Organise your products and pricing
- 📈 **Transaction Tracking**: Real-time transaction status updates
- 💰 **Refunds**: Query and track refund entries
- 📊 **Accounting Export**: Export payment data as JSON or CSV
- 🔑 **Account Claims**: Manage user fund claim requests

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
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

const client = new QBitFlow('your-api-key');
```

### 3. Create a One-Time Payment

```typescript
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	customerUUID: 'customer-uuid',
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
	customerUUID: 'customer-uuid',
});

console.log('Subscription link:', subscription.link);
```

### 5. Check Transaction Status

```typescript
import { TransactionType, TransactionStatusValue } from 'qbitflow';

const status = await client.transactionStatus.get(
	'transaction-uuid',
	TransactionType.ONE_TIME_PAYMENT
);

if (status.status === TransactionStatusValue.COMPLETED) {
	console.log('Payment completed! Transaction hash:', status.txHash);
} else if (status.status === TransactionStatusValue.FAILED) {
	console.log('Payment failed:', status.message);
}
```

## Configuration

| Option       | Type   | Default                    | Description                                  |
| ------------ | ------ | -------------------------- | -------------------------------------------- |
| `apiKey`     | string | (required)                 | Your QBitFlow API key                        |
| `baseUrl`    | string | `https://api.qbitflow.app` | API base URL                                 |
| `timeout`    | number | `30000`                    | Request timeout in milliseconds              |
| `maxRetries` | number | `3`                        | Number of retry attempts for failed requests |

## One-Time Payments

### Create a Payment Session

Provide either a `productId` or inline product details (`productName` + `description` + `price`):

```typescript
// Using an existing product
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	customerUUID: 'customer-uuid',
	successUrl: 'https://yourapp.com/success',
	cancelUrl: 'https://yourapp.com/cancel',
});

// Or with inline product details
const payment = await client.oneTimePayments.createSession({
	productName: 'Custom Product',
	description: 'Product description',
	price: 99.99, // USD
	customerUUID: 'customer-uuid',
});

console.log(payment.uuid); // Session UUID
console.log(payment.link); // Payment link for customer
```

### Get Payment Session

```typescript
const session = await client.oneTimePayments.getSession('session-uuid');
console.log(session.productName, session.price);
```

### Get Completed Payment

```typescript
const payment = await client.oneTimePayments.get('payment-uuid');
console.log(payment.transactionHash, payment.amount);
```

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
const customer = await client.oneTimePayments.getCustomerForTransaction('transaction-uuid');
console.log(customer.email);
```

## Subscriptions

### Create a Subscription


```typescript
const subscription = await client.subscriptions.createSession({
	productId: 1,
	frequency: { unit: 'months', value: 1 }, // Bill monthly
	trialPeriod: { unit: 'days', value: 7 }, // 7-day trial (optional)
	minPeriods: 3, // Minimum commitment periods (optional)
	customerUUID: 'customer-uuid',
});

console.log(subscription.link);
```

> **Track lifecycle changes with webhooks, not polling.** Previously you had to run a
> cron job that periodically fetched each subscription with `subscriptions.get()` to detect
> status changes and act on them. Now you can set a **Subscription status webhook** URL in
> the dashboard settings and QBitFlow will notify you on every status transition
> (`active` → `past_due`, `trial` → `active`, etc.), eliminating the need for a cron job.
> See [Subscription Status Webhooks](#subscription-status-webhooks).

### Frequency Units

Available units for `frequency` and `trialPeriod`:

`seconds` · `minutes` · `hours` · `days` · `weeks` · `months`

### Get Subscription Session

```typescript
const session = await client.subscriptions.getSession('session-uuid');
// Returns SubscriptionSession — frequency and trialPeriod are in raw seconds
console.log(session.frequency, session.trialPeriod);
```

### Get Subscription

```typescript
const sub = await client.subscriptions.get('subscription-uuid');
console.log(sub.subscriptionStatus, sub.nextBillingDate);
```

### Get Subscription Payment History

```typescript
const history = await client.subscriptions.getPaymentHistory('subscription-uuid');
history.forEach((record) => {
	console.log(record.uuid, record.amount, record.createdAt);
});
```

### Force-Cancel a Subscription

Bypasses the normal subscriber-signed cancellation flow (admin use only):

```typescript
const result = await client.subscriptions.forceCancel('subscription-uuid');
console.log(result.message);
```

### Execute Test Billing Cycle

**Test mode only** — manually trigger a billing cycle to validate your webhook handling:

```typescript
const result = await client.subscriptions.executeTestBilling('subscription-uuid');
console.log('Status link:', result.statusLink);
```

## Transaction Status

### Check Status

```typescript
import { TransactionType } from 'qbitflow';

const status = await client.transactionStatus.get(
	'transaction-uuid',
	TransactionType.ONE_TIME_PAYMENT
);

console.log(status.status); // "created", "pending", "completed", etc.
console.log(status.txHash); // On-chain transaction hash
```

### Transaction Types

```typescript
enum TransactionType {
	ONE_TIME_PAYMENT = 'payment',
	CREATE_SUBSCRIPTION = 'createSubscription',
	CANCEL_SUBSCRIPTION = 'cancelSubscription',
	EXECUTE_SUBSCRIPTION_PAYMENT = 'executeSubscription',
	INCREASE_ALLOWANCE = 'increaseAllowance',
}
```

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
const refund = await client.refunds.getByTransaction('transaction-uuid');
console.log(refund.status, refund.reason);
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
// JSON export — returns AccountingEvent[]
const events = await client.accounting.export('2024-01-01', '2024-12-31', 'json') as AccountingEvent[];
events.forEach((e) => {
	console.log(e.paymentId, e.type, e.netAmountUsd);
});

// CSV export — returns a raw CSV string
import fs from 'fs';
const csv = await client.accounting.export('2024-01-01', '2024-12-31', 'csv') as string;
fs.writeFileSync('transactions.csv', csv);
```

Each `AccountingEvent` includes: transaction identifiers, product info, on-chain details (chain, block, tx hash, addresses), token info, gross/net amounts, platform and organization fees, and network fees for refunds.

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
const customer = await client.customers.get('customer-uuid');
const byEmail = await client.customers.getByEmail('john@example.com');
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
const updated = await client.customers.update('customer-uuid', {
	name: 'John',
	lastName: 'Doe',
	email: 'john.doe@example.com',
	phoneNumber: '+9876543210',
});
```

### Delete Customer

```typescript
const response = await client.customers.delete('customer-uuid');
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

const updated = await client.products.update(1, {
	name: 'Premium Plus',
	description: 'Enhanced features',
	price: 39.99,
});

await client.products.delete(1);
```

## User Management

### Create a User

```typescript
// Create (admin only)
const user = await client.users.create({
	name: 'Alice',
	lastName: 'Smith',
	email: 'alice@example.com',
	role: 'user',             // 'user' or 'admin'
	organizationFeeBps: 100,  // optional, 1% fee
});
```

### Get, List, Update, Delete

```typescript
// Get current user (identified by API key)
const me = await client.users.get();

// Get by ID / list all (admin only)
const byId = await client.users.getById(42);
const all = await client.users.getAll();

// Update
const updated = await client.users.update(user.id, {
	name: 'Alicia',
	lastName: 'Smith',
	email: user.email,
});

// Delete (admin only)
await client.users.delete(user.id);
```

## API Key Management

### Create an API Key

```typescript
const resp = await client.apiKeys.create({
	name: 'Production Key',
	userId: userId,
	test: false,
});
console.log('Key (only shown once):', resp.key);
```

### List and Delete

```typescript
// List API keys for the current user
const keys = await client.apiKeys.getAll();

// List API keys for a specific user (admin only)
const forUser = await client.apiKeys.getForUser(userId);

// Delete
await client.apiKeys.delete(keyId);
```

## Webhook Handling

### Configuring Webhook URLs

Webhook endpoint URLs are configured in the [QBitFlow dashboard](https://qbitflow.app) settings,
**not** per session. There are two independent webhooks:

- **Transaction webhook** — fired when a payment or subscription-checkout session changes status
  (payload: [`SessionWebhookResponse`](#transaction-webhooks)).
- **Subscription status webhook** — fired when an existing subscription transitions between statuses
  (payload: [`SubscriptionStatusTransitionWebhook`](#subscription-status-webhooks)).

> **Migration note (1.2.1):** `webhookUrl` was removed from `createSession()` for both one-time
> payments and subscriptions. Set the **Transaction webhook** URL in the dashboard instead — this
> ensures consistent webhook handling across all transactions.

All webhooks are signed with HMAC. Verify every request with `client.webhooks.verify(...)` before
processing it, using the headers exposed by the SDK:

| Getter                              | Header                     | Purpose                                 |
| ----------------------------------- | -------------------------- | --------------------------------------- |
| `client.webhooks.signatureHeader`   | `X-Webhook-Signature-256`  | HMAC signature to verify                |
| `client.webhooks.timestampHeader`   | `X-Webhook-Timestamp`      | Timestamp included in the signed payload |
| `client.webhooks.webhookIdHeader`   | `X-Webhook-ID`             | Unique webhook ID (see [Test Webhooks](#test-webhooks)) |

### Transaction Webhooks

Point your dashboard **Transaction webhook** URL at this endpoint. The body is a
`SessionWebhookResponse`, whose `session` field is a `SessionCheckout`
(`OneTimePaymentSession | SubscriptionSession | PaygSubscriptionSession`).

```typescript
import express from 'express';
import {
	QBitFlow,
	SessionWebhookResponse,
	TransactionStatusValue,
	OneTimePaymentSession,
	SubscriptionSession,
} from 'qbitflow';

const app = express();
const qbitflowClient = new QBitFlow('your-api-key');

app.use(express.json());

app.post('/webhook', async (req, res) => {
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

	const event = req.body as SessionWebhookResponse;
	// event.session is typed as SessionCheckout (OneTimePaymentSession | SubscriptionSession | PaygSubscriptionSession)
	const session = event.session as OneTimePaymentSession | SubscriptionSession;

	if (event.status.status === TransactionStatusValue.COMPLETED) {
		console.log('Payment completed for product:', session.productName);
	} else if (event.status.status === TransactionStatusValue.FAILED) {
		// Handle failed payment
	}

	res.status(200).json({ received: true });
});
```

### Subscription Status Webhooks

Point your dashboard **Subscription status webhook** URL at this endpoint to be notified whenever a
subscription transitions between statuses. This replaces the old pattern of polling
`subscriptions.get()` from a cron job.

The body is a `SubscriptionStatusTransitionWebhook`:

```typescript
interface SubscriptionStatusTransitionWebhook {
	subscriptionUUID: string;         // subscription that changed status
	previousStatus: SubscriptionStatus;
	currentStatus: SubscriptionStatus;
	updatedAt: string;                // ISO timestamp of the transition
}
```

```typescript
import {
	QBitFlow,
	SubscriptionStatus,
	SubscriptionStatusTransitionWebhook,
} from 'qbitflow';

app.post('/subscription-status-webhook', async (req, res) => {
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

	const event = req.body as SubscriptionStatusTransitionWebhook;

	switch (event.currentStatus) {
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

	console.log(`${event.subscriptionUUID}: ${event.previousStatus} → ${event.currentStatus}`);

	res.status(200).json({ received: true });
});
```

### Test Webhooks

The dashboard **Test webhook** action sends a fake payload to your configured URL to confirm the
endpoint is reachable. That payload may not match the shape of a real webhook, so if you try to
process it normally your handler could error.

To handle it safely, check the incoming `X-Webhook-ID` header against
`client.webhooks.testWebhookId`. When they match, return HTTP `200` immediately and skip normal
payload processing (as shown in both examples above).

```typescript
if (webhookId === qbitflowClient.webhooks.testWebhookId) {
	res.status(200).json({ received: true });
	return;
}
```

## Error Handling

```typescript
import {
	NotFoundException,
	UnauthorizedException,
	ForbiddenException,
	ValidationException,
	RateLimitException,
	NetworkException,
	QBitFlowError,
} from 'qbitflow';

try {
	const payment = await client.oneTimePayments.get('invalid-uuid');
} catch (error) {
	if (error instanceof NotFoundException) {
		console.error('Not found');
	} else if (error instanceof UnauthorizedException) {
		console.error('Invalid API key');
	} else if (error instanceof ForbiddenException) {
		console.error('Insufficient permissions');
	} else if (error instanceof ValidationException) {
		console.error('Validation error:', error.message);
	} else if (error instanceof RateLimitException) {
		console.error('Rate limit exceeded');
	} else if (error instanceof NetworkException) {
		console.error('Network error:', error.message);
	} else if (error instanceof QBitFlowError) {
		console.error('QBitFlow error:', error.message);
	}
}
```

## API Reference

### QBitFlow

Main client class.

#### Constructor

```typescript
new QBitFlow(apiKey: string)
new QBitFlow(config: QBitFlowConfig)
```

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
| `transactionStatus` | `TransactionStatusRequests`  | Transaction status polling and WebSocket |
| `refunds`           | `RefundRequests`             | Refund query operations                  |
| `accounting`        | `AccountingRequests`         | Accounting data export (JSON / CSV)      |
| `claims`            | `ClaimRequests`              | Fund claim request management            |


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

