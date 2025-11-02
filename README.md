# QBitFlow JavaScript/TypeScript SDK

[![npm version](https://i.ytimg.com/vi/LkHy0YWvpRI/mqdefault.jpg)](https://www.npmjs.com/package/qbitflow-sdk)
[![License: MPL-2.0](https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Mozilla_Logo_2024.svg/1920px-Mozilla_Logo_2024.svg.png)](https://opensource.org/licenses/MPL-2.0)

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
- 💳 **One-Time Payments**: Accept cryptocurrency payments with ease
- 🔄 **Recurring Subscriptions**: Automated recurring billing in cryptocurrency
- 📊 **Pay-as-You-Go**: Usage-based billing with cryptocurrency
- 👥 **Customer Management**: Create and manage customer profiles
- 🛍️ **Product Management**: Organize your products and pricing
- 📈 **Transaction Tracking**: Real-time transaction status updates
- 🔐 **Secure Authentication**: API key-based authentication
- 🎯 **Type-Safe**: Full type hints for better IDE support
- 📝 **Comprehensive Documentation**: Detailed docstrings and examples

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
    - [1. Get Your API Key](#1-get-your-api-key)
    - [2. Initialize the Client](#2-initialize-the-client)
    - [3. Create a One-Time Payment](#3-create-a-one-time-payment)
    - [4. Create a Recurring Subscription](#4-create-a-recurring-subscription)
    - [5. Check Transaction Status](#5-check-transaction-status)
- [Configuration](#configuration)
- [One-Time Payments](#one-time-payments)
    - [Create a Payment Session](#create-a-payment-session)
    - [With Redirect URLs](#with-redirect-urls)
    - [Get Payment Session](#get-payment-session)
    - [Get Completed Payment](#get-completed-payment)
    - [List All Payments](#list-all-payments)
    - [List Combined Payments](#list-combined-payments)
- [Subscriptions](#subscriptions)
    - [Create a Subscription](#create-a-subscription)
    - [Frequency Units](#frequency-units)
    - [Get Subscription](#get-subscription)
    - [Get all payments for subscription](#get-all-payments-for-subscription)
    - [Execute Test Billing Cycle](#execute-test-billing-cycle)
- [Pay-As-You-Go Subscriptions](#pay-as-you-go-subscriptions)
    - [Create PAYG Subscription](#create-payg-subscription)
    - [Get PAYG Subscription](#get-payg-subscription)
    - [Get all payments for PAYG subscription](#get-all-payments-for-payg-subscription)
    - [Execute Test Billing Cycle](#execute-test-billing-cycle-1)
    - [Increase units current period](#increase-units-current-period)
- [Transaction Status](#transaction-status)
    - [Check Status](#check-status)
    - [Transaction Types](#transaction-types)
    - [Status Values](#status-values)
- [Customer Management](#customer-management)
    - [Create a Customer](#create-a-customer)
    - [Get Customer by UUID](#get-customer-by-uuid)
    - [Update Customer](#update-customer)
    - [Delete Customer](#delete-customer)
- [Product Management](#product-management)
    - [Create a Product](#create-a-product)
    - [Update Product](#update-product)
    - [Delete Product](#delete-product)
- [Webhook Handling](#webhook-handling)
    - [Express.js Example](#expressjs-example)
- [Error Handling](#error-handling)
- [API Reference](#api-reference)
    - [QBitFlow](#qbitflow)
        - [Constructor](#constructor)
        - [Properties](#properties)
- [License](#license)
- [Support](#support)
- [Changelog](#changelog)

## Installation

```bash
npm install qbitflow-sdk
```

Or using yarn:

```bash
yarn add qbitflow-sdk
```

## Quick Start

### 1. Get Your API Key

Sign up at [QBitFlow](https://qbitflow.app) and obtain your API key from the dashboard.

### 2. Initialize the Client

```typescript
import { QBitFlow } from 'qbitflow-sdk';

// Initialize the client
const client = new QBitFlow('your-api-key');
```

### 3. Create a One-Time Payment

```typescript
// Create a one-time payment
const payment = await client.oneTimePayments.createSession({
	productId: 1,
	customerUUID: 'customer-uuid',
	webhookUrl: 'https://yourapp.com/webhook',
	successUrl: 'https://yourapp.com/success',
	cancelUrl: 'https://yourapp.com/cancel',
});

console.log('Payment link:', payment.link);
// Send this link to your customer
```

### 4. Create a Recurring Subscription

```typescript
const subscription = await client.subscriptions.createSession({
	productId: 1,
	frequency: { unit: 'months', value: 1 }, // Bill monthly
	trialPeriod: { unit: 'days', value: 7 }, // 7-day trial (optional)
	webhookUrl: 'https://yourapp.com/webhook',
	customerUUID: 'customer-uuid',
});

console.log('Subscription link:', subscription.link);
```

### 5. Check Transaction Status

```typescript
import { TransactionType, TransactionStatusValue } from 'qbitflow-sdk';

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
	customerUUID: 'customer-uuid', // optional
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
- `{{TRANSACTION_TYPE}}`: The transaction type (e.g., "payment", "subscription", "payAsYouGo")

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

### Execute Test Billing Cycle

**Test Mode Only**: Manually trigger a billing cycle for testing.

**For live mode**: Billing cycles are executed automatically based on the subscription frequency.

```typescript
const result = await client.subscriptions.executeTestBilling('subscription-uuid');
console.log('Transaction status link:', result.statusLink);
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

### Execute Test Billing Cycle

**Test Mode Only**: Manually trigger a billing cycle for testing.

**For live mode**: Billing cycles are executed automatically based on the subscription frequency.

```typescript
const result = await client.payAsYouGo.executeTestBilling('subscription-uuid');
console.log('Transaction status link:', result.statusLink);
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

## Customer Management

### Create a Customer

```typescript
const customerData: CreateCustomerDto = {
	name: 'John',
	lastName: 'Doe',
	email: 'john@example.com',
	phoneNumber: '+1234567890',
	reference: 'CRM-12345',
};

const customer = await client.customers.create(customerData);
console.log('Customer created:', customer.uuid);
```

### Get Customer by UUID

```typescript
const customer = await client.customers.get('customer-uuid');
console.log(`${customer.name} ${customer.lastName} - ${customer.email}`);
```

### Update Customer

```typescript
const updateData: UpdateCustomerDto = {
	name: 'John',
	lastName: 'Doe',
	email: 'john.doe@example.com',
	phoneNumber: '+9876543210',
};

const updatedCustomer = await client.customers.update('customer-uuid', updateData);
```

### Delete Customer

```typescript
const response = await client.customers.delete('customer-uuid');
console.log(response.message);
```

## Product Management

### Create a Product

```typescript
const productData: CreateProductDto = {
	name: 'Premium Subscription',
	description: 'Access to all premium features',
	price: 29.99,
	reference: 'PROD-PREMIUM',
};

const product = await client.products.create(productData);
console.log('Product created: ID', product.id);
```

### Update Product

```typescript
const updateData: UpdateProductDto = {
	name: 'Premium Plus',
	description: 'Enhanced premium features',
	price: 39.99,
};

const updatedProduct = await client.products.update(1, updateData);
```

### Delete Product

```typescript
const response = await client.products.delete(1);
```

## Webhook Handling

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

	if (event.status.status === TransactionStatusValue.COMPLETED) {
		console.log('Payment completed!');
		// Handle successful payment
	} else if (event.status.status === TransactionStatusValue.FAILED) {
		console.log('Payment failed');
	}

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
- `payAsYouGo: PayAsYouGoRequests` - Pay-as-you-go operations
- `transactionStatus: TransactionStatusRequests` - Transaction status operations

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

## License

This project is licensed under the MPL-2.0 License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://qbitflow.app/docs)
- 📧 [Email Support](mailto:support@qbitflow.app)
- 🐛 [Issue Tracker](https://github.com/qbitflow/qbitflow-python-sdk/issues)
    <!-- -   💬 [Community Forum](https://community.qbitflow.app) -->

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## Security

For security issues, please email security@qbitflow.app instead of using the issue tracker.

---

Made with ❤️ by the QBitFlow team
