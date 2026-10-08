/**
 * Builds clients: from the API key with the constructor, checking what the key is with me(); and
 * from the environment with QBitFlow.fromEnv, with explicit options overriding it.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [QBITFLOW_ON_BEHALF_OF=…] npx tsx client-setup.ts
 *
 * The first client uses the default base URL (https://api.qbitflow.app/v2); the fromEnv ones honour
 * QBITFLOW_BASE_URL.
 */
import { QBitFlow } from 'qbitflow';

/** Builds a client with the constructor and checks its key. */
async function createClient(): Promise<QBitFlow> {
	// docs:start client-init
	// One client per API key, shared by the whole program. A blank key, or one not starting with
	// sk_, throws a ValidationError (nothing is sent).
	const client = new QBitFlow(process.env.QBITFLOW_API_KEY ?? '');

	// The recommended start-up check: what is this key, and which mode is it in? An
	// AuthenticationError for an unknown or revoked key.
	const me = await client.me();
	console.log(`${me.role} key, test mode: ${me.space?.test}`);
	// docs:end client-init
	return client;
}

/** Builds clients from the environment. */
function fromEnvironment(): QBitFlow {
	// docs:start config-from-env
	// QBITFLOW_API_KEY (required), and QBITFLOW_BASE_URL and QBITFLOW_ON_BEHALF_OF when set.
	const client = QBitFlow.fromEnv();

	// Explicit options override the environment and add the others.
	const patient = QBitFlow.fromEnv({ timeout: 60_000, maxRetries: 5 });
	// docs:end config-from-env
	console.log(`two clients: ${client !== patient}`);
	return client;
}

if (process.env.QBITFLOW_BASE_URL) {
	console.log('QBITFLOW_BASE_URL is set: skipping the constructor example (default base URL)');
} else {
	await createClient();
}
const client = fromEnvironment();
const me = await client.me();
console.log(`fromEnv: role ${me.role}, on behalf of ${me.onBehalfOf ?? 'nobody'}`);
