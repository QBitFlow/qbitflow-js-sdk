/**
 * Example Express server demonstrating webhook handling
 * This file shows how to set up a webhook endpoint to receive payment notifications
 *
 * Environment:
 *   QBITFLOW_API_KEY         your API key (required)
 *   QBITFLOW_BASE_URL        API base URL (optional; defaults to production)
 *   QBITFLOW_WEBHOOK_SECRET  your webhook secret, for local verification (optional; without it
 *                            the example verifies through the API)
 */

import express, { Request, Response } from 'express';
import {
	extractWebhookHeaders,
	isSubscriptionSession,
	NotFoundException,
	parseSessionWebhook,
	QBitFlow,
	SessionWebhookResponse,
	TransactionStatusValue,
	verifyWebhookSignature,
} from '../src';

const app = express();
const PORT = 8001;

// Initialize QBitFlow client (never hardcode a real key — use the environment)
const qbitflowClient = new QBitFlow({
	apiKey: process.env.QBITFLOW_API_KEY ?? '<api_key_here>',
	baseUrl: process.env.QBITFLOW_BASE_URL,
});

/** Escape text for an HTML page, so nothing from a query string or the API becomes markup. */
const escapeHtml = (value: unknown): string =>
	String(value).replace(
		/[&<>"']/g,
		(char) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
	);

/**
 * Webhook endpoint to receive payment notifications
 * This endpoint will be called by QBitFlow when a checkout completes
 *
 * POST /webhook
 * Body: SessionWebhookResponse (the raw body is kept for verification)
 */
app.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
	console.log('\n=== Webhook Received ===');

	// Pull out the QBitFlow headers. extractWebhookHeaders does a case-insensitive lookup
	// and accepts Node headers, a Fetch `Headers`, or a plain object.
	const { signature, timestamp, isTest } = extractWebhookHeaders(req.headers);

	if (!signature || !timestamp) {
		console.warn('Missing signature or timestamp headers');
		res.status(400).json({ error: 'Missing required headers' });
		return;
	}

	// 1. Verify authenticity — always before anything else, including the test probe below.
	//
	// Local verification is the recommended default: it needs your webhook secret (from the
	// QBitFlow dashboard) but makes no network call, so it is faster and keeps working when
	// the API is unreachable. If you would rather not hold the secret at all, the remote
	// path below asks QBitFlow to check the signature instead. Both accept the raw body.
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
		try {
			// Remote fallback: no secret needed, one API round-trip per webhook. Only a
			// rejected signature returns false; an outage throws, so answer 5xx and let
			// QBitFlow retry the delivery.
			if (!(await qbitflowClient.webhooks.verify(req.body, signature, timestamp))) {
				console.warn('Remote webhook verification failed');
				res.status(401).json({ error: 'Invalid signature' });
				return;
			}
			console.log('Verified via the QBitFlow API');
		} catch (error) {
			console.error('Could not verify the webhook right now:', error);
			res.status(503).json({ error: 'Verification unavailable, retry later' });
			return;
		}
	}

	// 2. The dashboard's "Test webhook" button sends a fake event just to check the endpoint is
	// reachable. It was verified above like any other delivery (this assumes the dashboard
	// signs the probe like a normal webhook), so the button exercises your real setup —
	// secret, headers and all. Acknowledge it and stop: there is no transaction behind it.
	if (isTest) {
		console.log('Connectivity test webhook received');
		res.sendStatus(200);
		return;
	}

	try {
		// 3. Decode the payload: every field is present with its declared type.
		const event = parseSessionWebhook(req.body);

		console.log('Session UUID:', event.uuid);
		console.log('Transaction Status:', event.status?.status ?? '(none)');
		console.log('Transaction Type:', event.txType);

		console.log('\nSession Details:');
		console.log('Product:', event.session.productName);
		console.log('Description:', event.session.description);
		console.log('Price:', event.session.price, 'USD');
		console.log('Your reference:', event.session.reference || '(none)');
		console.log('Customer UUID:', event.session.customerUUID ?? '(collected at checkout)');
		console.log('Organization:', event.session.organizationName);
		if (isSubscriptionSession(event.session)) {
			console.log('Billing every', event.session.frequency, 'seconds');
		}

		if (event.status?.txHash) {
			console.log('Transaction Hash:', event.status.txHash);
		}

		// Handle different transaction statuses
		switch (event.status?.status) {
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
				console.log('Status:', event.status?.status);
		}

		// Always respond with 200 to acknowledge receipt
		res.status(200).json({
			received: true,
			uuid: event.uuid,
			status: event.status?.status,
		});
	} catch (error) {
		console.error('Error processing webhook:', error);
		res.status(500).json({ error: 'Failed to process webhook' });
	}
});

/**
 * Success redirect endpoint
 * The successUrl of the session (see client.ts) carries your own order reference:
 *
 * GET /success?ref={your order reference}
 */
app.get('/success', async (req: Request, res: Response) => {
	console.log('\n=== Success Redirect ===');

	const ref = typeof req.query.ref === 'string' ? req.query.ref : '';
	if (!ref) {
		res.status(400).send('Missing ref parameter');
		return;
	}

	try {
		// The payment record is written once the transaction is processed on-chain, which can
		// take a moment after the redirect: a 404 means "not yet", not "failed".
		const payment = await qbitflowClient.oneTimePayments.getByReference(ref);

		console.log('Payment UUID:', payment.uuid);
		console.log('Amount:', payment.amount, 'USD in', payment.currency.symbol);

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
              <p><strong>Product:</strong> ${escapeHtml(payment.name)}</p>
              <p><strong>Amount:</strong> $${escapeHtml(payment.amount)}</p>
              <p><strong>Order:</strong> ${escapeHtml(ref)}</p>
            </div>
          </body>
        </html>
      `);
	} catch (error) {
		if (error instanceof NotFoundException) {
			res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Payment Processing</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
            <h1>Payment Processing</h1>
            <p>Your payment for order ${escapeHtml(ref)} is being confirmed.</p>
            <p>You will receive a confirmation email once the payment is complete.</p>
          </body>
        </html>
      `);
			return;
		}
		console.error('Error fetching payment details:', error);
		res.status(500).send('Error processing payment verification');
	}
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
	// 1. Update order status in database (event.session.reference is your order reference)
	// 2. Send confirmation email to customer
	// 3. Trigger fulfillment process
	// 4. Update inventory
	// 5. Log the transaction

	console.log('\nHandling completed payment...');
	console.log('Order reference:', event.session.reference || '(none)');
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
	console.log('Reason:', event.status?.message || 'Unknown');

	// Your implementation here
}

// Start the server
app.listen(PORT, () => {
	console.log(`\n🚀 Webhook server is running on http://localhost:${PORT}`);
	console.log(`\nWebhook endpoint: http://localhost:${PORT}/webhook`);
	console.log(`Success endpoint: http://localhost:${PORT}/success`);
	console.log(`Cancel endpoint: http://localhost:${PORT}/cancel\n`);
});
