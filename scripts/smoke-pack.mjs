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
		"import { QBitFlow, VERSION, UserRole, ConflictException, parseSessionWebhook } from 'qbitflow';\n" +
			"const c = new QBitFlow('sk_smoke');\n" +
			"if (typeof c.products.getAll !== 'function' || !VERSION || UserRole.USER !== 'user' || !ConflictException) process.exit(2);\n" +
			"if (typeof c.onBehalfOf(5).products.getAll !== 'function') process.exit(3);\n" +
			"if (parseSessionWebhook('{\"uuid\":\"pay@1\"}').managementPageLink !== '') process.exit(4);\n" +
			"console.log('  ESM import OK', VERSION);\n"
	);
	run('ESM import from a "type": "module" project', process.execPath, ['esm.mjs']);

	// 3b. CommonJS consumer.
	writeFileSync(
		join(consumer, 'cjs.cjs'),
		"const { QBitFlow, VERSION } = require('qbitflow');\n" +
			"const c = new QBitFlow('sk_smoke');\n" +
			"if (typeof c.products.getAll !== 'function' || !VERSION) process.exit(2);\n" +
			"console.log('  CJS require OK', VERSION);\n"
	);
	run('CommonJS require', process.execPath, ['cjs.cjs']);

	// 3c. TypeScript consumer under the strictest resolution mode.
	writeFileSync(
		join(consumer, 'types.mts'),
		"import { QBitFlow, UserRole, type CreateUserDto, type Payment, isSubscriptionSession } from 'qbitflow';\n" +
			"const c = new QBitFlow({ apiKey: 'sk_smoke', maxRetries: 0 });\n" +
			"const dto: CreateUserDto = { name: 'A', lastName: 'B', email: 'a@b.co', role: UserRole.USER };\n" +
			"const p = {} as Payment; const sym: string = p.currency.symbol; const ref: string | null = p.reference;\n" +
			'const scoped: QBitFlow = c.onBehalfOf(7);\n' +
			'void c; void dto; void sym; void ref; void scoped; void isSubscriptionSession;\n'
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
