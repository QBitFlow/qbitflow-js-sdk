
# QBitFlow SDK Examples

This directory contains example code demonstrating how to use the QBitFlow JavaScript/TypeScript SDK.

## Files

- **client.ts** - Example client showing various SDK operations (create payments, subscriptions, etc.)
- **server.ts** - Example Express.js server showing webhook handling

## Running the Examples

### Prerequisites

1. Install dependencies in the examples directory:
```bash
cd examples
npm install
```

2. Export your API key as `QBITFLOW_API_KEY` — both files read it from the environment (never
   hardcode a real key). Optionally export `QBITFLOW_BASE_URL` (defaults to production),
   `QBITFLOW_PRODUCT_ID` and `QBITFLOW_CUSTOMER_UUID` (an existing customer's bare UUID; omit it
   and the customer is collected during checkout). For local webhook verification also export
   `QBITFLOW_WEBHOOK_SECRET`.

### Running the Client Examples

The client examples demonstrate various SDK operations:

```bash
npm run client
```

This will show you how to:
- Create one-time payments
- Create subscriptions
- Check transaction status
- List payments
- And more...

### Running the Webhook Server

The server example demonstrates how to handle webhooks:

```bash
npm run server
```

This will start an Express server on port 8001 with the following endpoints:
- `POST /webhook` - Receives payment notifications from QBitFlow: verifies the signature on the
  raw body (locally with `QBITFLOW_WEBHOOK_SECRET`, otherwise through the API), then
  acknowledges the dashboard's test probe, then decodes the payload with `parseSessionWebhook`
- `GET /success?ref=…` - Handles successful payment redirects: looks the payment up by your own
  order reference (`oneTimePayments.getByReference`) and escapes everything it renders
- `GET /cancel` - Handles cancelled payment redirects

## Modifying the Examples

Feel free to modify these examples to test different scenarios:

1. Change product IDs to match your products
2. Adjust subscription frequencies and trial periods
3. Customize webhook handling logic
4. Add your own business logic for payment processing

## Integration Tips

1. **Webhooks**: Use webhooks for reliable payment notifications. They're more reliable than polling.

2. **Error Handling**: Always wrap SDK calls in try-catch blocks to handle errors gracefully.

3. **Status Updates**: Use webhooks to learn when a payment completes; poll
   `client.transactionStatus.get()` only when you need the status on demand.

4. **Security**: 
   - Never commit your API key to version control
   - Use environment variables for sensitive data
   - Validate webhook signatures in production

5. **Testing**: Use test mode API keys during development to avoid real transactions.

6. **Rendering data**: HTML-escape anything you render from a query string or an API response
   (the server example shows how) — a redirect URL is visible to, and editable by, the customer.
