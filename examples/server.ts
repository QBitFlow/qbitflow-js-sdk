/**
 * Example Express server demonstrating webhook handling
 * This file shows how to set up a webhook endpoint to receive payment notifications
 */

import express, { Request, Response } from 'express';
import {
	extractWebhookHeaders,
	QBitFlow,
	SessionWebhookResponse,
	TransactionStatusValue,
	TransactionType,
	verifyWebhookSignature,
} from '../src';

const app = express();
const PORT = 8001;

// Initialize QBitFlow client
const qbitflowClient = new QBitFlow('<api_key_here>');

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Webhook endpoint to receive payment notifications
 * This endpoint will be called by QBitFlow when a payment status changes
 *
 * POST /webhook
 * Body: SessionWebhookResponse
 */
app.post('/webhook', async (req: Request, res: Response) => {
	console.log('\n=== Webhook Received ===');

	// Pull out the QBitFlow headers. extractWebhookHeaders does a case-insensitive lookup
	// and accepts Node headers, a Fetch `Headers`, or a plain object.
	const { signature, timestamp, isTest } = extractWebhookHeaders(req.headers);

	// The dashboard's "Test webhook" button sends a fake event just to check the endpoint
	// is reachable. Acknowledge it and stop — there is no transaction behind it.
	if (isTest) {
		console.log('Connectivity test webhook received');
		res.sendStatus(200);
		return;
	}

	if (!signature || !timestamp) {
		console.warn('Missing signature or timestamp headers');
		res.status(400).json({ error: 'Missing required headers' });
		return;
	}

	// Verify authenticity.
	//
	// Local verification is the recommended default: it needs your webhook secret (from the
	// QBitFlow dashboard) but makes no network call, so it is faster and keeps working when
	// the API is unreachable. If you would rather not hold the secret at all, the remote
	// path below asks QBitFlow to check the signature instead.
	const secret = process.env.QBITFLOW_WEBHOOK_SECRET;

	if (secret) {
		try {
			// The replay window defaults to 5 minutes (DEFAULT_MAX_TIMESTAMP_AGE_SECONDS) and
			// must match the server's setting. Override with { maxTimestampAgeSeconds: … }.
			verifyWebhookSignature(secret, timestamp, signature, req.body);
			console.log('Verified locally (no API round-trip)');
		} catch (error) {
			console.warn('Local webhook verification failed:', error);
			res.status(401).json({ error: 'Invalid signature' });
			return;
		}
	} else {
		// Remote fallback: no secret needed, one API round-trip per webhook.
		if (!(await qbitflowClient.webhooks.verify(req.body, signature, timestamp))) {
			console.warn('Remote webhook verification failed');
			res.status(401).json({ error: 'Invalid signature' });
			return;
		}
		console.log('Verified via the QBitFlow API');
	}

	try {
		// Parse the webhook payload
		const event = req.body as SessionWebhookResponse;

		console.log('Session UUID:', event.uuid);
		console.log('Transaction Status:', event.status.status);
		console.log('Transaction Type:', event.txType);

		// Log session details
		console.log('\nSession Details:');
		console.log('Product:', event.session.productName);
		console.log('Description:', event.session.description);
		console.log('Price:', event.session.price, 'USD');
		console.log('Customer UUID:', event.session.customerUUID);
		console.log('Organization:', event.session.organizationName);

		if (event.status.txHash) {
			console.log('Transaction Hash:', event.status.txHash);
		}

		// Handle different transaction statuses
		switch (event.status.status) {
			case TransactionStatusValue.COMPLETED:
				console.log('✓ Payment completed successfully!');
				// TODO: Update your database, fulfill order, etc.
				handleCompletedPayment(event);
				break;

			case TransactionStatusValue.FAILED:
				console.log('✗ Payment failed');
				// TODO: Notify customer, log failure, etc.
				handleFailedPayment(event);
				break;

			case TransactionStatusValue.PENDING:
				console.log('⏳ Payment is pending');
				// TODO: Update status in your system
				break;

			case TransactionStatusValue.CANCELLED:
				console.log('✗ Payment was cancelled');
				// TODO: Handle cancellation
				break;

			default:
				console.log('Status:', event.status.status);
		}

		// Always respond with 200 to acknowledge receipt
		res.status(200).json({
			received: true,
			uuid: event.uuid,
			status: event.status.status,
		});
	} catch (error) {
		console.error('Error processing webhook:', error);
		res.status(500).json({ error: 'Failed to process webhook' });
	}
});

/**
 * Success redirect endpoint
 * This endpoint is called when a payment is successful (if successUrl is provided)
 *
 * GET /success?uuid={sessionUuid}&transactionType={type}
 */
app.get('/success', async (req: Request, res: Response) => {
	console.log('\n=== Success Redirect ===');

	const uuid = req.query.uuid as string;
	const transactionType = req.query.transactionType as TransactionType;

	if (!uuid || !transactionType) {
		return res.status(400).send('Missing uuid or transactionType parameter');
	}

	try {
		// Fetch the transaction status to verify completion
		const transactionStatus = await qbitflowClient.transactionStatus.get(uuid, transactionType);

		console.log('Transaction UUID:', uuid);
		console.log('Transaction Type:', transactionType);
		console.log('Status:', transactionStatus.status);

		// If status is completed, fetch the session details
		if (transactionStatus.status === TransactionStatusValue.COMPLETED) {
			const session = await qbitflowClient.oneTimePayments.getSession(uuid);

			console.log('\nPayment Session Details:');
			console.log('Product:', session.productName);
			console.log('Price:', session.price, 'USD');
			console.log('Customer UUID:', session.customerUUID);

			// TODO: Handle successful payment in your application
			// - Update order status
			// - Send confirmation email
			// - Grant access to product/service

			res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Payment Successful</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                max-width: 600px; 
                margin: 50px auto; 
                text-align: center;
              }
              .success { color: #28a745; font-size: 48px; }
              .details { 
                background: #f8f9fa; 
                padding: 20px; 
                border-radius: 8px; 
                margin-top: 20px; 
                text-align: left;
              }
            </style>
          </head>
          <body>
            <div class="success">✓</div>
            <h1>Payment Successful!</h1>
            <p>Thank you for your payment.</p>
            <div class="details">
              <h3>Order Details</h3>
              <p><strong>Product:</strong> ${session.productName}</p>
              <p><strong>Amount:</strong> $${session.price}</p>
              <p><strong>Transaction ID:</strong> ${uuid}</p>
            </div>
          </body>
        </html>
      `);
		} else {
			console.log(`Transaction status is ${transactionStatus.status}, not completed yet.`);

			res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Payment Processing</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                max-width: 600px; 
                margin: 50px auto; 
                text-align: center;
              }
            </style>
          </head>
          <body>
            <h1>Payment Processing</h1>
            <p>Your payment is being processed. Current status: ${transactionStatus.status}</p>
            <p>You will receive a confirmation email once the payment is complete.</p>
          </body>
        </html>
      `);
		}
	} catch (error) {
		console.error('Error fetching transaction details:', error);
		res.status(500).send('Error processing payment verification');
	}

	return null;
});

/**
 * Cancel redirect endpoint
 * This endpoint is called when a payment is cancelled (if cancelUrl is provided)
 *
 * GET /cancel
 */
app.get('/cancel', (_: Request, res: Response) => {
	console.log('\n=== Cancel Redirect ===');
	console.log('Payment was cancelled by the user');

	// TODO: Handle payment cancellation
	// - Update order status
	// - Log cancellation
	// - Optionally send notification

	res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Cancelled</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 600px; 
            margin: 50px auto; 
            text-align: center;
          }
          .cancelled { color: #dc3545; font-size: 48px; }
        </style>
      </head>
      <body>
        <div class="cancelled">✗</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment has been cancelled. No charges were made.</p>
        <p><a href="/">Return to home</a></p>
      </body>
    </html>
  `);
});

/**
 * Handle completed payment
 * This is where you would implement your business logic for successful payments
 */
function handleCompletedPayment(event: SessionWebhookResponse) {
	// Example business logic:
	// 1. Update order status in database
	// 2. Send confirmation email to customer
	// 3. Trigger fulfillment process
	// 4. Update inventory
	// 5. Log the transaction

	console.log('\nHandling completed payment...');
	console.log('Customer UUID:', event.session.customerUUID);
	console.log('Product ID:', event.session.productId);
	console.log('Amount:', event.session.price, 'USD');

	// Your implementation here
}

/**
 * Handle failed payment
 * This is where you would implement your business logic for failed payments
 */
function handleFailedPayment(event: SessionWebhookResponse) {
	// Example business logic:
	// 1. Update order status to failed
	// 2. Notify customer about the failure
	// 3. Log the failure
	// 4. Optionally retry or offer alternative payment methods

	console.log('\nHandling failed payment...');
	console.log('Session UUID:', event.uuid);
	console.log('Reason:', event.status.message || 'Unknown');

	// Your implementation here
}

// Start the server
app.listen(PORT, () => {
	console.log(`\n🚀 Webhook server is running on http://localhost:${PORT}`);
	console.log(`\nWebhook endpoint: http://localhost:${PORT}/webhook`);
	console.log(`Success endpoint: http://localhost:${PORT}/success`);
	console.log(`Cancel endpoint: http://localhost:${PORT}/cancel\n`);
});
