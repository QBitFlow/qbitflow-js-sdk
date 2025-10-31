
/**
 * Example client demonstrating QBitFlow SDK usage
 * This file shows how to create payment sessions, subscriptions, and PAYG subscriptions
 */

import { QBitFlow, TransactionType, TransactionStatusValue } from '../src';

// Your webhook URL where you'll receive payment notifications
const MY_URL = 'http://localhost:8001';

// Initialize the QBitFlow client with your API key
const client = new QBitFlow('<api_key_here>');

/**
 * Example 1: Create a one-time payment session with webhook
 * You can provide a webhook URL to receive updates about the transaction status
 */
async function createOneTimePaymentWithWebhook() {
  console.log('\n=== Creating one-time payment with webhook ===');
  
  try {
    const result = await client.oneTimePayments.createSession({
      productId: 1,
      webhookUrl: `${MY_URL}/webhook`,
      customerUuid: '01997c89-d0e9-7c9a-9886-fe7709919695',
    });
    
    console.log('Payment session created:');
    console.log('UUID:', result.uuid);
    console.log('Payment Link:', result.link);
    console.log('Expires At:', result.expiresAt);
  } catch (error) {
    console.error('Error creating payment:', error);
  }
}

/**
 * Example 2: Create a one-time payment with redirect URLs
 * You can use the following placeholders in the URLs:
 * - {{UUID}}: The UUID of the created payment session
 * - {{TRANSACTION_TYPE}}: The type of transaction (e.g., "payment", "createSubscription")
 */
async function createOneTimePaymentWithRedirects() {
  console.log('\n=== Creating one-time payment with redirect URLs ===');
  
  try {
    const result = await client.oneTimePayments.createSession({
      productId: 1,
      successUrl: `${MY_URL}/success?uuid={{UUID}}&transactionType={{TRANSACTION_TYPE}}`,
      cancelUrl: `${MY_URL}/cancel`,
      customerUuid: '01997c89-d0e9-7c9a-9886-fe7709919695',
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
 * You can provide a webhook URL to receive updates about the transaction status
 */
async function createSubscriptionSession() {
  console.log('\n=== Creating subscription session ===');
  
  try {
    const result = await client.subscriptions.createSession({
      productId: 1,
      frequency: { unit: 'months', value: 1 }, // Bill monthly
      trialPeriod: { unit: 'days', value: 7 }, // 7-day trial (optional)
      webhookUrl: `${MY_URL}/webhook`,
      customerUuid: '01997c89-d0e9-7c9a-9886-fe7709919695',
    });
    
    console.log('Subscription session created:');
    console.log('UUID:', result.uuid);
    console.log('Payment Link:', result.link);
  } catch (error) {
    console.error('Error creating subscription:', error);
  }
}

/**
 * Example 4: Create a pay-as-you-go subscription session
 * You can provide a webhook URL to receive updates about the transaction status
 */
async function createPayAsYouGoSession() {
  console.log('\n=== Creating pay-as-you-go subscription session ===');
  
  try {
    const result = await client.payAsYouGo.createSession({
      productId: 1,
      frequency: { unit: 'months', value: 1 }, // Bill monthly
      freeCredits: 100, // Start with 100 free credits (optional)
      webhookUrl: `${MY_URL}/webhook`,
      customerUuid: '01997c89-d0e9-7c9a-9886-fe7709919695',
    });
    
    console.log('Pay-as-you-go session created:');
    console.log('UUID:', result.uuid);
    console.log('Payment Link:', result.link);
  } catch (error) {
    console.error('Error creating PAYG subscription:', error);
  }
}

/**
 * Example 5: Check transaction status
 * Check the status of a transaction by its UUID
 */
async function checkTransactionStatus(transactionUuid: string) {
  console.log('\n=== Checking transaction status ===');
  
  try {
    const status = await client.transactionStatus.get(
      transactionUuid,
      TransactionType.ONE_TIME_PAYMENT
    );
    
    console.log('Transaction Status:', status.status);
    console.log('Transaction Type:', status.type);
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
 * Example 6: Listen to real-time transaction status updates via WebSocket
 * Connect to WebSocket to receive real-time updates about transaction status
 */
async function listenToTransactionUpdates(transactionUuid: string) {
  console.log('\n=== Listening to transaction status updates ===');
  
  try {
    await client.transactionStatus.connectAndHandleMessages(
      transactionUuid,
      TransactionType.ONE_TIME_PAYMENT,
      (message) => {
        if ('error' in message) {
          console.error('Error:', message.error);
          console.error('Status Code:', message.status);
        } else {
          console.log('\n--- Status Update Received ---');
          console.log('Transaction UUID:', message.transactionUuid);
          console.log('Status:', message.status.status);
          console.log('Type:', message.status.type);
          if (message.status.txHash) {
            console.log('Transaction Hash:', message.status.txHash);
          }
          
          // Example: Handle specific status values
          if (message.status.status === TransactionStatusValue.COMPLETED) {
            console.log('✓ Transaction completed successfully!');
          } else if (message.status.status === TransactionStatusValue.FAILED) {
            console.log('✗ Transaction failed');
          }
        }
      }
    );
  } catch (error) {
    console.error('Error connecting to WebSocket:', error);
  }
}

/**
 * Example 7: List all payments with pagination
 */
async function listPayments() {
  console.log('\n=== Listing payments ===');
  
  try {
    const result = await client.oneTimePayments.getAll({ limit: 10 });
    
    console.log(`Found ${result.data.length} payments`);
    console.log('Has more:', result.hasMore);
    
    result.data.forEach((payment, index) => {
      console.log(`\nPayment ${index + 1}:`);
      console.log('UUID:', payment.uuid);
      console.log('Amount:', payment.amount, 'USD');
      console.log('Created At:', payment.createdAt);
      console.log('Status: Completed');
    });
    
    // Fetch next page if available
    if (result.hasMore && result.nextCursor) {
      console.log('\nFetching next page...');
      const nextPage = await client.oneTimePayments.getAll({
        limit: 10,
        cursor: result.nextCursor,
      });
      console.log(`Next page has ${nextPage.data.length} payments`);
    }
  } catch (error) {
    console.error('Error listing payments:', error);
  }
}

/**
 * Example 8: Get a specific payment by UUID
 */
async function getPaymentDetails(paymentUuid: string) {
  console.log('\n=== Getting payment details ===');
  
  try {
    const payment = await client.oneTimePayments.get(paymentUuid);
    
    console.log('Payment Details:');
    console.log('UUID:', payment.uuid);
    console.log('Product:', payment.name);
    console.log('Amount:', payment.amount, 'USD');
    console.log('Currency:', payment.currency.symbol);
    console.log('Transaction Hash:', payment.transactionHash);
    console.log('Customer UUID:', payment.customerUuid);
  } catch (error) {
    console.error('Error getting payment:', error);
  }
}

/**
 * Example 9: Cancel a subscription
 */
async function cancelSubscription(subscriptionUuid: string) {
  console.log('\n=== Cancelling subscription ===');
  
  try {
    const result = await client.subscriptions.cancel(subscriptionUuid);
    console.log('Subscription cancelled:', result.message);
  } catch (error) {
    console.error('Error cancelling subscription:', error);
  }
}

// Main execution
async function main() {
  console.log('QBitFlow SDK Examples\n');
  
  // Uncomment the examples you want to run:
  
  await createOneTimePaymentWithWebhook();
  await createOneTimePaymentWithRedirects();
  await createSubscriptionSession();
  await createPayAsYouGoSession();
  
  // Replace with actual UUIDs to test:
  // await checkTransactionStatus('transaction-uuid-here');
  // await listenToTransactionUpdates('transaction-uuid-here');
  // await listPayments();
  // await getPaymentDetails('payment-uuid-here');
  // await cancelSubscription('subscription-uuid-here');
}

// Run examples
if (require.main === module) {
  main().catch(console.error);
}
