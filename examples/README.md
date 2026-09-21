
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

2. Make sure to replace `<api_key_here>` with your actual API key in both files.

### Running the Client Examples

The client examples demonstrate various SDK operations:

```bash
npm run client
```

This will show you how to:
- Create one-time payments
- Create subscriptions
- Create pay-as-you-go subscriptions
- Check transaction status
- List payments
- And more...

### Running the Webhook Server

The server example demonstrates how to handle webhooks:

```bash
npm run server
```

This will start an Express server on port 8001 with the following endpoints:
- `POST /webhook` - Receives payment notifications from QBitFlow
- `GET /success` - Handles successful payment redirects
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

3. **Status Updates**: Use WebSocket connections for real-time status updates during payment processing.

4. **Security**: 
   - Never commit your API key to version control
   - Use environment variables for sensitive data
   - Validate webhook signatures in production

5. **Testing**: Use test mode API keys during development to avoid real transactions.
