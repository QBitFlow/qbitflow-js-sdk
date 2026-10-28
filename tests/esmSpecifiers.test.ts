/**
 * Guard for the ESM build.
 *
 * `dist/esm` is emitted as native ES modules (`"type": "module"`), and Node's ESM loader
 * requires explicit file extensions on relative specifiers. `tsc` does not add them, so
 * every relative import/export in `src/` must be written with `.js` (TypeScript maps
 * `./x.js` to `./x.ts`). A bare `./x` type-checks fine and only breaks at runtime for ESM
 * consumers — which is exactly what happened in 2.1.0. `npm run smoke` checks the packed
 * tarball end to end; this test catches the mistake earlier.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { USER_AGENT, VERSION } from '../src/version';

const SRC = join(__dirname, '..', 'src');

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : name.endsWith('.ts') ? [full] : [];
	});

describe('ESM specifiers', () => {
	it('every relative import/export in src/ carries a .js extension', () => {
		const offenders: string[] = [];
		for (const file of walk(SRC)) {
			const text = readFileSync(file, 'utf8');
			for (const match of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
				if (!/\.(js|json)$/.test(match[1])) {
					offenders.push(`${file.replace(SRC, 'src')}: ${match[1]}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('package.json gives each condition its own types (ESM types for import, CJS for require)', () => {
		const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
			exports: Record<string, Record<string, Record<string, string>> | string>;
			files: string[];
			types: string;
			version: string;
			dependencies?: Record<string, string>;
			engines: Record<string, string>;
		};
		// No runtime dependencies: the SDK runs on the global fetch (Node >= 20).
		expect(pkg.dependencies ?? {}).toEqual({});
		expect(pkg.engines.node).toBe('>=20.0.0');
		const root = pkg.exports['.'] as Record<string, Record<string, string>>;
		expect(root.import).toEqual({
			types: './dist/esm/index.d.ts',
			default: './dist/esm/index.js',
		});
		expect(root.require).toEqual({
			types: './dist/cjs/index.d.ts',
			default: './dist/cjs/index.js',
		});
		// `types` must come first inside each condition.
		expect(Object.keys(root.import)[0]).toBe('types');
		expect(Object.keys(root.require)[0]).toBe('types');
		expect(pkg.exports['./package.json']).toBe('./package.json');
		expect(pkg.types).toBe('./dist/cjs/index.d.ts');
		expect(pkg.files).toContain('CHANGELOG.md');
		expect(pkg.files).toContain('MIGRATION-v3.md');
		expect(pkg.files).not.toContain('QUICKSTART.md');
	});

	it('VERSION matches package.json and the top CHANGELOG entry', () => {
		const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
			version: string;
		};
		expect(VERSION).toBe(pkg.version);
		expect(USER_AGENT).toBe(`qbitflow-js/${pkg.version}`);
		const changelog = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
		const top = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog);
		expect(top?.[1]).toBe(pkg.version);
	});
});
