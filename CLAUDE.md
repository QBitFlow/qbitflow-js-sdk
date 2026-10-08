# QBitFlow JavaScript/TypeScript SDK: rules for agents

> **Website snippets.** The code on qbitflow.app/docs and in this README comes from `// docs:start <id>` … `// docs:end <id>` regions in `examples/`. Every change keeps them true:
> - **New public capability:** add a region, an id in the hub's `snippets/catalog.json` (the same id across all SDKs), and the manifest entry, plus the README block via `scripts/embed-snippets.mjs`.
> - **Changed capability:** update the region's code. Never hand-edit an embedded README block: re-run the script.
> - **Ids are a public contract with the website.** Never rename or remove one silently. To retire an id, keep it until the website no longer uses it, and note it in the CHANGELOG.
> - **Before committing:** the examples run, the manifest check passes, and `embed-snippets --check` passes.
> - **Unsupported ids:** an id the SDK can't support goes under `unsupported` with a reason. Never write placeholder code.

Gates (from the repository root): `npm run build && npm run lint && npm run typecheck && npm run test:unit && npm run smoke`, then
`cd examples && npm install && npm run typecheck`. `npm run test:unit` includes `tests/snippets.test.ts`, which runs
`node ../../scripts/embed-snippets.mjs --check .` when this repository sits in the hub checkout (or `QBITFLOW_HUB_DIR` is set).
Never run `npm run test:live` without being asked. See CONTRIBUTING.md.
