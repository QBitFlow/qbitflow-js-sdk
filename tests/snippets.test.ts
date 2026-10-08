/**
 * Website snippets: runs the hub's `scripts/embed-snippets.mjs --check` over this SDK. It checks
 * the `// docs:start <id>` / `// docs:end <id>` regions of `examples/`, the manifest
 * (`examples/snippets.manifest.json`) against the hub's catalog, and that the README's embedded
 * blocks are up to date. See CONTRIBUTING.md.
 *
 * The hub is `QBITFLOW_HUB_DIR` when set (an invalid one fails), else `../..` when it is the hub
 * checkout. Without a hub (this repository cloned on its own), the check is skipped.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join('scripts', 'embed-snippets.mjs');
const CATALOG = join('snippets', 'catalog.json');

const isHub = (dir: string): boolean =>
	existsSync(join(dir, SCRIPT)) && existsSync(join(dir, CATALOG));

const explicit = process.env.QBITFLOW_HUB_DIR;
const parent = resolve(ROOT, '..', '..');
const hub = explicit ? resolve(explicit) : isHub(parent) ? parent : undefined;

/** Runs the check and fails with its output. */
function check(dir: string): void {
	const result = spawnSync(process.execPath, [join(dir, SCRIPT), '--check', ROOT], {
		encoding: 'utf8',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`embed-snippets --check failed (exit ${result.status}):\n${result.stdout}${result.stderr}`
		);
	}
}

describe('website snippets', () => {
	if (explicit) {
		it('embed-snippets --check passes (hub: QBITFLOW_HUB_DIR)', () => {
			if (!isHub(hub!)) {
				throw new Error(
					`QBITFLOW_HUB_DIR=${explicit} is not the hub checkout: no ${SCRIPT} and ${CATALOG} there`
				);
			}
			check(hub!);
		});
	} else if (hub) {
		it('embed-snippets --check passes (hub: ../..)', () => check(hub));
	} else {
		it.skip('embed-snippets --check (skipped: no hub checkout at ../..; set QBITFLOW_HUB_DIR)', () => {});
	}
});
