# QBitFlow JavaScript/TypeScript SDK

[![npm version](https://i.ytimg.com/vi/LkHy0YWvpRI/mqdefault.jpg)
[![License: MIT](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/MIT_Logo_New.svg/1200px-MIT_Logo_New.svg.png)

Official JavaScript/TypeScript SDK for [QBitFlow](https://qbitflow.app) - a comprehensive cryptocurrency payment processing platform that enables seamless integration of crypto payments, recurring subscriptions, and pay-as-you-go models into your applications.

## Features

- 🔐 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🚀 **Easy to Use**: Simple, intuitive API design
- 🔄 **Automatic Retries**: Built-in retry logic for failed requests
- ⚡ **Real-time Updates**: WebSocket support for transaction status monitoring
- 📦 **Dual Package**: Works with both CommonJS and ES modules
- 🧪 **Well Tested**: Comprehensive test coverage
- 📚 **Great Documentation**: Detailed docs with examples
- 🔌 **Webhook Support**: Handle payment notifications easily

## Installation

```bash
npm install qbitflow-sdk
```

Or using yarn:

```bash
yarn add qbitflow-sdk
```

## Quick Start

```typescript
import { QBitFlow } from 'qbitflow-sdk';

// Initialize the client
const client = new QBitFlow('your-api-key');

// Create a one-time payment
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	customerUUID: 'customer-uuid',
	webhookUrl: 'https://yourapp.com/webhook',
});

console.log('Payment link:', payment.link);
// Send this link to your customer
```

## Table of Contents

- [Authentication](#authentication)
- [Configuration](#configuration)
- [One-Time Payments](#one-time-payments)
- [Subscriptions](#subscriptions)
- [Pay-As-You-Go Subscriptions](#pay-as-you-go-subscriptions)
- [Transaction Status](#transaction-status)
- [Webhook Handling](#webhook-handling)
- [Error Handling](#error-handling)
- [TypeScript Support](#typescript-support)
- [Examples](#examples)
- [API Reference](#api-reference)
- [Testing](#testing)

## Authentication

Get your API key from the QBitFlow dashboard. The SDK requires an API key for all operations.

```typescript
import { QBitFlow } from 'qbitflow-sdk';

// Simple initialization
const client = new QBitFlow('your-api-key');

// With custom configuration
const client = new QBitFlow({
	apiKey: 'your-api-key',
	timeout: 30000, // 30 seconds
	maxRetries: 3,
});
```

## Configuration

### Configuration Options

| Option       | Type   | Default                    | Description                                  |
| ------------ | ------ | -------------------------- | -------------------------------------------- |
| `apiKey`     | string | (required)                 | Your QBitFlow API key                        |
| `baseUrl`    | string | `https://api.qbitflow.app` | API base URL                                 |
| `timeout`    | number | `30000`                    | Request timeout in milliseconds              |
| `maxRetries` | number | `3`                        | Number of retry attempts for failed requests |

## One-Time Payments

### Create a Payment Session

Create a payment session for a one-time purchase:

```typescript
// Using an existing product
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	customerUUID: 'customer-uuid',
	webhookUrl: 'https://yourapp.com/webhook',
});

// Or create a custom payment
const payment = await client.oneTimePayments.createSession({
	productName: 'Custom Product',
	description: 'Product description',
	price: 99.99, // USD
	customerUUID: 'customer-uuid',
	webhookUrl: 'https://yourapp.com/webhook',
});

console.log(payment.uuid); // Session UUID
console.log(payment.link); // Payment link for customer
```

### With Redirect URLs

You can provide redirect URLs for success and cancellation:

```typescript
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	successUrl: 'https://yourapp.com/success?uuid={{UUID}}&type={{TRANSACTION_TYPE}}',
	cancelUrl: 'https://yourapp.com/cancel',
	customerUUID: 'customer-uuid',
});
```

**Available Placeholders:**

- `{{UUID}}`: The session UUID
- `{{TRANSACTION_TYPE}}`: The transaction type (e.g., "payment")

### Get Payment Session

Retrieve details of a payment session:

```typescript
const session = await client.oneTimePayments.getSession('session-uuid');
console.log(session.productName, session.price);
```

### Get Completed Payment

Retrieve details of a completed payment:

```typescript
const payment = await client.oneTimePayments.get('payment-uuid');
console.log(payment.transactionHash, payment.amount);
```

### List All Payments

List all one-time payments with pagination:

```typescript
const result = await client.oneTimePayments.getAll({ limit: 10 });

console.log(result.items); // Array of payments
console.log(result.hasMore()); // Whether there are more pages
console.log(result.nextCursor); // Cursor for next page

// Fetch next page
if (result.hasMore()) {
	const nextPage = await client.oneTimePayments.getAll({
		limit: 10,
		cursor: result.nextCursor,
	});
}
```

### List Combined Payments

Get all payments (one-time and subscription payments combined):

```typescript
const result = await client.oneTimePayments.getAllCombined({ limit: 20 });
result.items.forEach((payment) => {
	console.log(payment.source); // "payment" or "subscription_history"
	console.log(payment.amount);
});
```

## Subscriptions

### Create a Subscription

Create a recurring subscription:

```typescript
const subscription = await client.subscriptions.createSession({
	productId: 1,
	frequency: { unit: 'months', value: 1 }, // Bill monthly
	trialPeriod: { unit: 'days', value: 7 }, // 7-day trial (optional)
	minPeriods: 3, // Minimum billing periods (optional)
	webhookUrl: 'https://yourapp.com/webhook',
	customerUUID: 'customer-uuid',
});

console.log(subscription.link); // Send to customer
```

### Frequency Units

Available units for `frequency` and `trialPeriod`:

- `seconds`
- `minutes`
- `hours`
- `days`
- `weeks`
- `months`

### Get Subscription

Retrieve subscription details:

```typescript
const subscription = await client.subscriptions.get('subscription-uuid');
console.log(subscription.status, subscription.nextBillingDate);
```

### Get all payments for subscription

```typescript
const history = await client.subscriptions.getPaymentHistory('subscription-uuid');
history.forEach((record) => {
	console.log(record.uuid, record.amount, record.createdAt);
});
```

## Pay-As-You-Go Subscriptions

PAYG subscriptions allow customers to pay based on usage with a billing cycle.

### Create PAYG Subscription

```typescript
const payg = await client.payAsYouGo.createSession({
	productId: 1,
	frequency: { unit: 'months', value: 1 }, // Bill monthly
	freeCredits: 100, // Initial free credits (optional)
	webhookUrl: 'https://yourapp.com/webhook',
	customerUUID: 'customer-uuid',
});

console.log(payg.link);
```

### Get PAYG Subscription

```typescript
const payg = await client.payAsYouGo.get('payg-uuid');
console.log(payg.allowance, payg.unitsCurrentPeriod);
```

### Get all payments for PAYG subscription

```typescript
const history = await client.payAsYouGo.getPaymentHistory('payg-uuid');
history.forEach((record) => {
	console.log(record.uuid, record.amount, record.createdAt);
});
```

### Increase units current period

Increase the number of units for the current billing period:

```typescript
// For example, the product is billed per hour of usage, and the customer consumed 5 additional hours
const response = await client.payAsYouGo.increaseUnitsCurrentPeriod('payg-uuid', 5);
```

## Transaction Status

### Check Status

Get the current status of a transaction:

```typescript
import { TransactionType } from 'qbitflow-sdk';

const status = await client.transactionStatus.get(
	'transaction-uuid',
	TransactionType.ONE_TIME_PAYMENT
);

console.log(status.status); // "created", "pending", "completed", etc.
console.log(status.txHash); // Blockchain transaction hash
```

### Transaction Types

```typescript
enum TransactionType {
	/** One-time payment transaction */
	ONE_TIME_PAYMENT = 'payment',
	/** Create subscription transaction */
	CREATE_SUBSCRIPTION = 'createSubscription',
	/** Cancel subscription transaction */
	CANCEL_SUBSCRIPTION = 'cancelSubscription',
	/** Execute subscription payment transaction */
	EXECUTE_SUBSCRIPTION_PAYMENT = 'executeSubscription',
	/** Create pay-as-you-go subscription transaction */
	CREATE_PAYG_SUBSCRIPTION = 'createPAYGSubscription',
	/** Cancel pay-as-you-go subscription transaction */
	CANCEL_PAYG_SUBSCRIPTION = 'cancelPAYGSubscription',
	/** Increase allowance transaction */
	INCREASE_ALLOWANCE = 'increaseAllowance',
	/** Update max amount transaction */
	UPDATE_MAX_AMOUNT = 'updateMaxAmount',
}
```

### Status Values

```typescript
enum TransactionStatusValue {
	/** Transaction has been created but not yet processed */
	CREATED = 'created',
	/** Waiting for blockchain confirmation */
	WAITING_CONFIRMATION = 'waitingConfirmation',
	/** Transaction is pending processing */
	PENDING = 'pending',
	/** Transaction has been successfully completed */
	COMPLETED = 'completed',
	/** Transaction has failed */
	FAILED = 'failed',
	/** Transaction has been cancelled */
	CANCELLED = 'cancelled',
	/** Transaction has expired */
	EXPIRED = 'expired',
}
```

### Real-Time Status Updates (WebSocket)

Monitor transaction status in real-time:

```typescript
await client.transactionStatus.connectAndHandleMessages(
	'transaction-uuid',
	TransactionType.ONE_TIME_PAYMENT,
	(message) => {
		if ('error' in message) {
			console.error('Error:', message.error);
		} else {
			console.log('Status update:', message.status.status);

			if (message.status.status === TransactionStatusValue.COMPLETED) {
				console.log('Payment completed!');
				// Handle successful payment
			}
		}
	}
);
```

## Webhook Handling

Webhooks provide reliable notifications about payment status changes.

### Express.js Example

```typescript
import express from 'express';
import { QBitFlow, SessionWebhookResponse, TransactionStatusValue } from 'qbitflow-sdk';

const app = express();
const client = new QBitFlow('your-api-key');

app.use(express.json());

app.post('/webhook', (req, res) => {
	const event = req.body as SessionWebhookResponse;

	console.log('Webhook received:', event.uuid);
	console.log('Status:', event.status.status);

	switch (event.status.status) {
		case TransactionStatusValue.COMPLETED:
			// Handle successful payment
			console.log('Payment completed!');
			// Update your database, fulfill order, etc.
			break;

		case TransactionStatusValue.FAILED:
			// Handle failed payment
			console.log('Payment failed');
			break;
	}

	// Always respond with 200
	res.status(200).json({ received: true });
});

app.listen(3000, () => {
	console.log('Webhook server running on port 3000');
});
```

### Webhook Payload

```typescript
interface SessionWebhookResponse {
	/** Session UUID */
	uuid: string;
	/** Current transaction status */
	status: TransactionStatus;
	/** Complete session information */
	session: Session;
}
```

The webhook payload includes:

- `uuid`: Session UUID
- `status`: Current transaction status with type, status value, and optional transaction hash
- `session`: Complete session details including product info, price, customer UUID, etc.

## Error Handling

The SDK provides specific error classes for different scenarios:

```typescript
import {
	NotFoundException,
	UnauthorizedException,
	ValidationException,
	NetworkException,
	QBitFlowError,
} from 'qbitflow-sdk';

try {
	const payment = await client.oneTimePayments.get('invalid-uuid');
} catch (error) {
	if (error instanceof NotFoundException) {
		console.error('Payment not found');
	} else if (error instanceof UnauthorizedException) {
		console.error('Invalid API key');
	} else if (error instanceof ValidationException) {
		console.error('Invalid request:', error.message);
	} else if (error instanceof NetworkException) {
		console.error('Network error:', error.message);
	} else if (error instanceof QBitFlowError) {
		console.error('QBitFlow error:', error.message);
	} else {
		console.error('Unknown error:', error);
	}
}
```

### Error Classes

- `QBitFlowError`: Base error class
- `NotFoundException`: Resource not found (404)
- `UnauthorizedException`: Invalid API key (401)
- `ForbiddenException`: Access denied (403)
- `ValidationException`: Invalid request (400)
- `RateLimitException`: Rate limit exceeded (429)
- `ServerException`: Server error (500+)
- `NetworkException`: Network/connection error
- `WebSocketException`: WebSocket connection error

## TypeScript Support

The SDK is written in TypeScript and includes complete type definitions.

### Usage with TypeScript

```typescript
import { QBitFlow, CreateSessionDto, LinkResponse } from 'qbitflow-sdk';

const client = new QBitFlow('api-key');

const sessionData: CreateSessionDto = {
	productId: 1,
	customerUUID: 'uuid',
	webhookUrl: 'https://example.com/webhook',
};

const payment: LinkResponse = await client.oneTimePayments.createSession(sessionData);
```

## Examples

The `examples/` directory contains complete working examples:

### Client Example

See `examples/client.ts` for comprehensive examples of:

- Creating payments
- Creating subscriptions
- Checking transaction status
- Real-time status monitoring
- Listing payments
- Error handling

### Server Example

See `examples/server.ts` for an Express.js server demonstrating:

- Webhook endpoint implementation
- Success/cancel redirect handling
- Transaction verification
- Payment completion logic

### Running Examples

```bash
cd examples
npm install
npm run client  # Run client examples
npm run server  # Run webhook server
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

- `customers: CustomerRequests` - Customer operations
- `products: ProductRequests` - Product operations
- `users: UserRequests` - User operations
- `apiKeys: ApiKeyRequests` - API key operations
- `oneTimePayments: PaymentRequests` - One-time payment operations
- `subscriptions: SubscriptionRequests` - Subscription operations
- `payAsYouGo: PayAsYouGoRequests` - PAYG subscription operations
- `transactionStatus: TransactionStatusRequests` - Transaction status operations

#### Methods

- `getApiKey(): string` - Get current API key
- `getBaseUrl(): string` - Get current base URL

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Building

Build the SDK from source:

```bash
# Install dependencies
npm install

# Build
npm run build

# The compiled code will be in the dist/ directory
```

## License

MPL-2.0 License - see LICENSE file for details

## Support

- 📧 Email: support@qbitflow.app
- 🐛 Issues: [GitHub Issues](https://github.com/qbitflow/qbitflow-js-sdk/issues)
- 📚 Documentation: [Official Docs](https://qbitflow.app/docs)
      <!-- - 💬 Discord: [Join our community](https://discord.gg/qbitflow) -->

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

Made with ❤️ by the QBitFlow team
