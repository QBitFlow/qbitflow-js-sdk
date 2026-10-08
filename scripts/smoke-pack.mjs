#!/usr/bin/env node
/**
 * Packed-tarball smoke test.
 *
 * Builds the tarball `npm publish` would upload, installs it into a throwaway consumer
 * project (deps symlinked from this repo's node_modules — no network), and checks that the
 * package can actually be consumed three ways:
 *
 *   1. `import 'qbitflow'` from a Node ESM module  (catches extensionless ESM specifiers)
 *   2. `require('qbitflow')` from CommonJS
 *   3. `tsc --moduleResolution nodenext` on a small TypeScript consumer (catches broken
 *      `exports`/`types` wiring and re-exports the type checker cannot follow), and a negative
 *      check that an ESM consumer's types reject `import x from 'qbitflow'` — the package has
 *      no default export, so types that allowed it would crash at runtime ("masquerading as CJS")
 *
 * Run with `npm run smoke` (after `npm run build`); `prepublishOnly` runs it automatically.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'qbitflow-smoke-'));

const fail = (msg) => {
	console.error(`\n✖ smoke test failed: ${msg}`);
	process.exit(1);
};

try {
	if (!existsSync(join(root, 'dist', 'esm', 'index.js'))) {
		fail('dist/ is missing — run `npm run build` first');
	}

	// 1. Pack exactly what would be published.
	const packDir = join(work, 'pack');
	mkdirSync(packDir);
	execFileSync('npm', ['pack', '--pack-destination', packDir, '--silent'], { cwd: root, stdio: 'inherit' });
	const tarball = readdirSync(packDir).find((f) => f.endsWith('.tgz'));
	if (!tarball) fail('npm pack produced no tarball');

	// 2. Install it into a consumer project without touching the network.
	const consumer = join(work, 'consumer');
	const nodeModules = join(consumer, 'node_modules');
	mkdirSync(nodeModules, { recursive: true });
	execFileSync('tar', ['-xzf', join(packDir, tarball), '-C', nodeModules]);
	renameSync(join(nodeModules, 'package'), join(nodeModules, 'qbitflow'));
	for (const dep of readdirSync(join(root, 'node_modules'))) {
		if (dep.startsWith('.') || dep === 'qbitflow') continue;
		symlinkSync(join(root, 'node_modules', dep), join(nodeModules, dep));
	}
	writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));

	const run = (label, cmd, args, cwd = consumer) => {
		const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
		if (res.status !== 0) {
			fail(`${label}\n${res.stdout}${res.stderr}`);
		}
		console.log(`✔ ${label}`);
	};

	// 3a. Node ESM consumer.
	writeFileSync(
		join(consumer, 'esm.mjs'),
		"import { QBitFlow, VERSION, SubscriptionStatus, ConflictError, NotFoundError, webhooks } from 'qbitflow';\n" +
			"const c = new QBitFlow('sk_smoke');\n" +
			"if (typeof c.products.list !== 'function' || VERSION !== '3.0.0' || SubscriptionStatus.PastDue !== 'pastDue' || !ConflictError) process.exit(2);\n" +
			"if (typeof c.onBehalfOf('019eca82-5680-7b00-8000-0000000000b1').checkoutSessions.createPayment !== 'function') process.exit(3);\n" +
			"const e = webhooks.parseEvent('{\"id\":\"evt_1\",\"type\":\"webhook.test\",\"version\":\"v2\",\"createdAt\":\"2026-10-01T12:00:00Z\",\"data\":{}}');\n" +
			"if (e.data.endpointUuid !== '') process.exit(4);\n" +
			"const { createRequire } = await import('node:module');\n" +
			"const cjs = createRequire(import.meta.url)('qbitflow');\n" +
			"if (!(new cjs.NotFoundError({ message: 'x', status: 404 }) instanceof NotFoundError)) process.exit(5);\n" +
			"const { formatAmount, parseAmount, hasAccess, Placeholders } = await import('qbitflow');\n" +
			"if (formatAmount('1500000', 6) !== '1.5' || parseAmount('1.5', 6) !== '1500000' || hasAccess({}) !== false || Placeholders.UUID !== '{{UUID}}') process.exit(6);\n" +
			"const signed = webhooks.sign('{}', 'whsec_x', 1790856000);\n" +
			"const r = webhooks.router('whsec_x').on('webhook.test', () => undefined);\n" +
			"if (!(r instanceof webhooks.WebhookRouter) || typeof r.fetchHandler() !== 'function' || typeof r.nodeHandler() !== 'function' || !signed.startsWith('t=1790856000,v1=')) process.exit(7);\n" +
			"const res = await r.fetchHandler()(new Request('http://x/', { method: 'GET' }));\n" +
			"if (res.status !== 405) process.exit(8);\n" +
			"if (typeof QBitFlow.fromEnv !== 'function' || typeof c.checkoutSessions.waitForCompletion !== 'function' || typeof c.accounting.exportCsvRange !== 'function' || typeof c.webhooks.router !== 'function') process.exit(9);\n" +
			"console.log('  ESM import OK', VERSION);\n"
	);
	run('ESM import from a "type": "module" project (errors instanceof across CJS/ESM)', process.execPath, ['esm.mjs']);

	// 3b. CommonJS consumer.
	writeFileSync(
		join(consumer, 'cjs.cjs'),
		"const { QBitFlow, VERSION, webhooks, ValidationError } = require('qbitflow');\n" +
			"const c = new QBitFlow({ apiKey: 'sk_smoke', maxRetries: 0 });\n" +
			"if (typeof c.webhooks.endpoints.create !== 'function' || !VERSION || typeof webhooks.verify !== 'function') process.exit(2);\n" +
			"try { new QBitFlow('pk_nope'); process.exit(3); } catch (e) { if (!(e instanceof ValidationError)) process.exit(4); }\n" +
			"const { formatAmount, parseAmount, hasAccess, Placeholders } = require('qbitflow');\n" +
			"if (formatAmount('-10004200', 6) !== '-10.0042' || parseAmount('-0.5', 2) !== '-50' || hasAccess({ currentPeriodEnd: '2999-01-01T00:00:00Z' }) !== true || Placeholders.TRANSACTION_TYPE !== '{{TRANSACTION_TYPE}}') process.exit(5);\n" +
			"const signed = webhooks.sign('{}', 'whsec_x', 1790856000);\n" +
			"const r = webhooks.router('whsec_x');\n" +
			"r.handle('{}', signed).then((res) => { if (res.status !== 400) process.exit(6); });\n" +
			"if (!(c.webhooks.router('whsec_x') instanceof webhooks.WebhookRouter) || typeof QBitFlow.fromEnv !== 'function' || typeof c.accounting.exportJsonRange !== 'function') process.exit(7);\n" +
			"console.log('  CJS require OK', VERSION);\n"
	);
	run('CommonJS require', process.execPath, ['cjs.cjs']);

	// 3c. TypeScript consumer under the strictest resolution mode.
	writeFileSync(
		join(consumer, 'types.mts'),
		"import { QBitFlow, webhooks, SubscriptionStatus, type CreatePaymentSessionParams, type Payment, type Event } from 'qbitflow';\n" +
			"const c = new QBitFlow({ apiKey: 'sk_smoke', maxRetries: 0 });\n" +
			"const params: CreatePaymentSessionParams = { productName: 'T-shirt', price: 25, successUrl: 'https://x.io/ok?id={{UUID}}' };\n" +
			"const p = {} as Payment; const sym: string | undefined = p.currency?.symbol; const ref: string | undefined = p.reference;\n" +
			"const scoped: QBitFlow = c.onBehalfOf('019eca82-5680-7b00-8000-0000000000b1');\n" +
			"const status: string = SubscriptionStatus.Active;\n" +
			"function handle(e: Event): string { switch (e.type) { case 'payment.completed': return e.data.uuid; case 'subscription.billingFailed': return e.data.amountUsd; default: return webhooks.isUnknownEvent(e) ? 'unknown' : e.type; } }\n" +
			"import { formatAmount, hasAccess, Placeholders, type WebhookResult, type WebhookRouter, type WaitOptions } from 'qbitflow';\n" +
			"const router: WebhookRouter = webhooks.router('whsec_x').on('payment.completed', (data, event) => { const r: string | undefined = data.reference; return [r, event.id]; }).onAny(async (e) => e.id);\n" +
			"const fetchHandler: (req: Request) => Promise<Response> = router.fetchHandler();\n" +
			"const result: Promise<WebhookResult> = router.handle('{}', webhooks.sign('{}', 'whsec_x'));\n" +
			"const wait: WaitOptions = { timeout: 1000, interval: 1000 };\n" +
			"const access: boolean = hasAccess({ currentPeriodEnd: undefined }); const amount: string = formatAmount('1', 6);\n" +
			"const fromEnv: QBitFlow = QBitFlow.fromEnv({ maxRetries: 0 }); const url = `https://x.io/ok?id=${Placeholders.UUID}`;\n" +
			'void params; void sym; void ref; void scoped; void status; void handle; void fetchHandler; void result; void wait; void access; void amount; void fromEnv; void url;\n'
	);
	writeFileSync(join(consumer, 'default-import.mts'), "import qb from 'qbitflow';\nvoid qb;\n");
	const tsc = join(root, 'node_modules', '.bin', 'tsc');
	const typeRoots = join(root, 'node_modules', '@types');
	const tscArgs = (module, resolution, file) => [
		'--noEmit', '--strict', '--skipLibCheck', '--module', module, '--moduleResolution', resolution,
		'--target', 'es2020', '--typeRoots', typeRoots, '--types', 'node', file,
	];
	run('TypeScript consumer (moduleResolution nodenext)', tsc, tscArgs('nodenext', 'nodenext', 'types.mts'));
	run('TypeScript consumer (moduleResolution bundler)', tsc, tscArgs('esnext', 'bundler', 'types.mts'));

	// 3d. The ESM types must not pretend there is a default export: types that allowed
	// `import qb from 'qbitflow'` would type-check code that crashes at runtime.
	const negative = spawnSync(tsc, tscArgs('nodenext', 'nodenext', 'default-import.mts'), {
		cwd: consumer,
		encoding: 'utf8',
	});
	if (negative.status === 0) {
		fail('an ESM consumer can `import x from "qbitflow"` at the type level, but the package has no default export');
	}
	console.log('\u{2714} ESM types reject a default import (no "masquerading as CJS")');

	console.log('\n✔ packed tarball is consumable from ESM, CJS and TypeScript (nodenext)');
} finally {
	rmSync(work, { recursive: true, force: true });
}
