/**
 * Exports the accounting events of 2026 as JSON rows and as a CSV file
 * (./qbitflow-2026.csv, mode 0600). The API exports at most 95 days at a time: the range helpers
 * split the year into windows and concatenate the result.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] npx tsx accounting.ts
 */
import { writeFile } from 'node:fs/promises';

import { QBitFlow } from 'qbitflow';

const client = QBitFlow.fromEnv();

// docs:start accounting-export
// Every payment, bill, refund and fee between two dates (both included). Any range: the SDK
// requests it in windows of at most 95 days (here 4) and concatenates them.
const rows = await client.accounting.exportJsonRange('2026-01-01', '2026-12-31');
for (const row of rows.slice(0, 5)) {
	console.log(row.type, row.paymentUuid, row.txTimeUtc, row.tokenSymbol, row.netAmount);
}

// The same as CSV text, its header line once.
const csv = await client.accounting.exportCsvRange('2026-01-01', '2026-12-31');
await writeFile('qbitflow-2026.csv', csv, { mode: 0o600 });
// docs:end accounting-export

console.log(`${rows.length} rows; CSV written to qbitflow-2026.csv`);
