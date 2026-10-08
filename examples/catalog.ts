/**
 * The catalog: creates the T-shirt product (reference tshirt-blue-m) unless it exists, lists the
 * products and one page of customers, and opens a checkout for the product by its reference.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx catalog.ts
 */
import { ConflictError, Placeholders, QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

/** Creates the product. */
async function createProduct(client: QBitFlow): Promise<void> {
	// docs:start products-create
	const product = await client.products.create({
		name: 'T-shirt',
		description: 'Blue, size M',
		price: 4.99, // USD
		reference: 'tshirt-blue-m', // your own id: unique per space
	});
	console.log(`product ${product.uuid}, payment link ${product.paymentLink}`);
	// docs:end products-create
}

try {
	await createProduct(client);
} catch (err) {
	if (!(err instanceof ConflictError && err.code === 'unique_violation')) throw err;
	console.log('tshirt-blue-m exists already'); // a run before this one
}

{
	// docs:start products-list
	// The active products; includeHidden: true adds the inactive ones.
	const products = await client.products.list();
	for (const product of products) {
		console.log(`${product.reference}: ${product.name}, ${product.price} USD`);
	}
	// docs:end products-list
}

{
	// docs:start customers-list
	const page = await client.customers.list({ limit: 10 });
	for (const customer of page.items) {
		console.log(`${customer.uuid} ${customer.email}`);
	}
	// null on the last page; else pass it back as cursor to read the next one.
	console.log(`next cursor: ${page.nextCursor}`);
	// docs:end customers-list
}

// docs:start checkout-create-payment-product
const session = await client.checkoutSessions.createPayment({
	productReference: 'tshirt-blue-m', // or productUuid
	reference: 'order-1042',
	successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/orders/cancel',
});
console.log(`Redirect the customer to ${session.link}`);
// docs:end checkout-create-payment-product

// A demo: expire it, so that order-1042 can be used again (by checkout.ts).
await client.checkoutSessions.expire(session.uuid);
