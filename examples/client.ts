/**
 * Example client demonstrating QBitFlow SDK usage
 * This file shows how to create payment sessions and subscriptions
 *
 * Environment:
 *   QBITFLOW_API_KEY        your API key (required)
 *   QBITFLOW_BASE_URL       API base URL (optional; defaults to production)
 *   QBITFLOW_CUSTOMER_UUID  an existing customer's UUID to pre-fill checkout (optional)
 *   QBITFLOW_PRODUCT_ID     an existing product ID (optional; defaults to 1)
 */

import { QBitFlow, TransactionType, isSubscriptionSession } from '../src';

// Your server URL, used for the redirect examples (see server.ts)
const MY_URL = 'http://localhost:8001';

// Initialize the QBitFlow client with your API key (never hardcode a real key — use the env)
const client = new QBitFlow({
	apiKey: process.env.QBITFLOW_API_KEY ?? '<api_key_here>',
	baseUrl: process.env.QBITFLOW_BASE_URL,
});

const PRODUCT_ID = Number(process.env.QBITFLOW_PRODUCT_ID ?? 1);
// Optional: pre-fill the customer. Omit it and the customer is collected during checkout.
const CUSTOMER_UUID = process.env.QBITFLOW_CUSTOMER_UUID;

/**
 * Example 1: Create a one-time payment session
 * Webhook URLs are configured in the dashboard, not per session.
 */
async function createOneTimePayment() {
	console.log('\n=== Creating one-time payment ===');

	try {
		const result = await client.oneTimePayments.createSession({
			productId: PRODUCT_ID,
			customerUUID: CUSTOMER_UUID,
		});

		console.log('Payment session created:');
		console.log('UUID:', result.uuid);
		console.log('Payment Link:', result.link);
	} catch (error) {
		console.error('Error creating payment:', error);
	}
}

/**
 * Example 2: Create a one-time payment with your own reference and redirect URLs.
 * The reference lets the success page look the payment up without storing QBitFlow's UUID.
 */
async function createOneTimePaymentWithRedirects() {
	console.log('\n=== Creating one-time payment with redirect URLs ===');

	const orderRef = `order-${Date.now()}`;
	try {
		const result = await client.oneTimePayments.createSession({
			productId: PRODUCT_ID,
			reference: orderRef,
			successUrl: `${MY_URL}/success?ref=${encodeURIComponent(orderRef)}`,
			cancelUrl: `${MY_URL}/cancel`,
			customerUUID: CUSTOMER_UUID,
		});

		console.log('Payment session created:');
		console.log('UUID:', result.uuid);
		console.log('Payment Link:', result.link);
	} catch (error) {
		console.error('Error creating payment:', error);
	}
}

/**
 * Example 3: Create a subscription session
 */
async function createSubscriptionSession() {
	console.log('\n=== Creating subscription session ===');

	try {
		const result = await client.subscriptions.createSession({
			productId: PRODUCT_ID,
			frequency: { unit: 'months', value: 1 }, // Bill monthly
			trialPeriod: { unit: 'days', value: 7 }, // 7-day trial (optional)
			customerUUID: CUSTOMER_UUID,
		});

		console.log('Subscription session created:');
		console.log('UUID:', result.uuid);
		console.log('Payment Link:', result.link);

		// Read it back: a subscription session carries its frequency (in seconds).
		const session = await client.subscriptions.getSession(result.uuid);
		console.log('Frequency (s):', session.frequency, 'trial (s):', session.trialPeriod);
		console.log('Is subscription:', isSubscriptionSession(session));
	} catch (error) {
		console.error('Error creating subscription:', error);
	}
}

/**
 * Example 4: Check transaction status
 * Poll the status of a transaction by its UUID. To be told when a checkout completes, prefer
 * webhooks (see server.ts); a transaction that has not been processed yet answers 404.
 */
async function checkTransactionStatus(transactionUUID: string) {
	console.log('\n=== Checking transaction status ===');

	try {
		const status = await client.transactionStatus.get(
			transactionUUID,
			TransactionType.ONE_TIME_PAYMENT
		);

		console.log('Transaction Status:', status.status);
		// txHash / message are '' until the API has something to report.
		if (status.txHash) {
			console.log('Transaction Hash:', status.txHash);
		}
		if (status.message) {
			console.log('Message:', status.message);
		}
	} catch (error) {
		console.error('Error checking status:', error);
	}
}

/**
 * Example 5: List all payments with pagination
 */
async function listPayments() {
	console.log('\n=== Listing payments ===');

	try {
		const result = await client.oneTimePayments.getAll({ limit: 10 });

		console.log(`Found ${result.items.length} payments`);
		console.log('Has more:', result.hasMore());

		result.items.forEach((payment, index) => {
			console.log(`\nPayment ${index + 1}:`);
			console.log('UUID:', payment.uuid);
			console.log('Amount:', payment.amount, 'USD');
			console.log('Currency:', payment.currency.symbol);
			console.log('Created At:', payment.createdAt);
		});

		// Fetch next page if available
		if (result.hasMore()) {
			console.log('\nFetching next page...');
			const nextPage = await client.oneTimePayments.getAll({
				limit: 10,
				cursor: result.nextCursor,
			});
			console.log(`Next page has ${nextPage.items.length} payments`);
		}
	} catch (error) {
		console.error('Error listing payments:', error);
	}
}

/**
 * Example 6: Get a specific payment by UUID
 */
async function getPaymentDetails(paymentUuid: string) {
	console.log('\n=== Getting payment details ===');

	try {
		const payment = await client.oneTimePayments.get(paymentUuid);

		console.log('Payment Details:');
		console.log('UUID:', payment.uuid);
		console.log('Product:', payment.name);
		console.log('Amount:', payment.amount, 'USD');
		console.log('Currency:', `${payment.currency.symbol} (${payment.currency.name})`);
		console.log('Transaction Hash:', payment.transactionHash);
		console.log('Customer UUID:', payment.customerUUID ?? '(none)');
		console.log('Your reference:', payment.reference ?? '(none)');
		console.log('Merchant receives (USD):', payment.metadata.txAmounts.usd.merchant);
	} catch (error) {
		console.error('Error getting payment:', error);
	}
}

/**
 * Example 7: Work on behalf of one of your organization's users (organization-level key)
 */
async function actForUser(userId: number) {
	console.log('\n=== Acting on behalf of a user ===');

	try {
		const asUser = client.onBehalfOf(userId); // every service sends On-Behalf-Of
		const products = await asUser.products.getAll();
		console.log(`User ${userId} has ${products.length} products`);
	} catch (error) {
		console.error('Error acting for user:', error);
	}
}

// Main execution
async function main() {
	console.log('QBitFlow SDK Examples\n');

	// Uncomment the examples you want to run:

	await createOneTimePayment();
	await createOneTimePaymentWithRedirects();
	await createSubscriptionSession();

	// Replace with actual identifiers to test:
	// await checkTransactionStatus('pay@…');
	// await listPayments();
	// await getPaymentDetails('pay@…');
	// await actForUser(123);
}

// Run examples
if (require.main === module) {
	main().catch(console.error);
}
