/**
 * Website snippets (part of the maintainers' conformance suite): runs the maintainers'
 * `scripts/embed-snippets.mjs --check` over this SDK. It checks the `// docs:start <id>` /
 * `// docs:end <id>` regions of `examples/`, the manifest (`examples/snippets.manifest.json`)
 * against the snippet catalog the website uses, and that the README's embedded blocks are up to
 * date. See CONTRIBUTING.md.
 *
 * The maintainers' workspace is `QBITFLOW_HUB_DIR` when set (an invalid one fails), else `../..`
 * when it holds the script and the catalog. Skipped outside the maintainers' workspace (this
 * repository cloned on its own).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SCRIPT = join('scripts', 'embed-snippets.mjs');
const CATALOG = join('snippets', 'catalog.json');

const isWorkspace = (dir: string): boolean =>
	existsSync(join(dir, SCRIPT)) && existsSync(join(dir, CATALOG));

const explicit = process.env.QBITFLOW_HUB_DIR;
const parent = resolve(ROOT, '..', '..');
const workspace = explicit ? resolve(explicit) : isWorkspace(parent) ? parent : undefined;

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
		it('embed-snippets --check passes (QBITFLOW_HUB_DIR)', () => {
			if (!isWorkspace(workspace!)) {
				throw new Error(
					`QBITFLOW_HUB_DIR=${explicit} is not the maintainers' workspace: no ${SCRIPT} and ${CATALOG} there`
				);
			}
			check(workspace!);
		});
	} else if (workspace) {
		it('embed-snippets --check passes (../..)', () => check(workspace));
	} else {
		it.skip("embed-snippets --check (skipped outside the maintainers' workspace)", () => {});
	}
});
