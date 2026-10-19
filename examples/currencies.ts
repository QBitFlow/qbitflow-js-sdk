/**
 * Lists the currencies customers can pay with.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx currencies.ts
 */
import { QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

// docs:start currencies-list
// A public route limited to 60 requests a minute per IP: cache the list at start-up. One bounded
// list (an array): the live currencies; test: true, the test networks'; main: true, the chains'
// native coins only.
const currencies = await client.currencies.list();
for (const { id, code, name, chain, decimals } of currencies) {
	console.log(`${id}: ${code} (${name} on ${chain}), ${decimals} decimals`);
}
// docs:end currencies-list
