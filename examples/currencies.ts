/**
 * Lists the currencies customers can pay with.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx currencies.ts
 */
import { QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

// docs:start currencies-list
// A public route limited to 60 requests a minute per IP: cache the list at start-up.
const currencies = await client.currencies.listAvailable();
for (const currency of currencies) {
	console.log(`${currency.id}: ${currency.symbol}, ${currency.decimals} decimals`);
}
// docs:end currencies-list
