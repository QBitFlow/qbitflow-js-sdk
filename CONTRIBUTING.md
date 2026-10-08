# Contributing to the QBitFlow JavaScript/TypeScript SDK

## Gates

Run them from the repository root before every commit (with no `QBITFLOW_*` variable set: they
stay offline):

```bash
npm run build && npm run lint && npm run typecheck && npm run test:unit && npm run smoke
cd examples && npm install && npm run typecheck   # the examples, against the build (file:..)
```

`npm test` is `typecheck` then `test:unit`. The live suite (`npm run test:live`) needs a key and a
server: see [tests/README.md](tests/README.md). Every new example program goes into the `typecheck`
script of `examples/package.json`, with an npm script to run it, and into
[examples/README.md](examples/README.md).

## Website snippets

> **Website snippets.** The code on qbitflow.app/docs and in this README comes from `// docs:start <id>` … `// docs:end <id>` regions in `examples/`. Every change keeps them true:
> - **New public capability:** add a region, an id in the hub's `snippets/catalog.json` (the same id across all SDKs), and the manifest entry, plus the README block via `scripts/embed-snippets.mjs`.
> - **Changed capability:** update the region's code. Never hand-edit an embedded README block: re-run the script.
> - **Ids are a public contract with the website.** Never rename or remove one silently. To retire an id, keep it until the website no longer uses it, and note it in the CHANGELOG.
> - **Before committing:** the examples run, the manifest check passes, and `embed-snippets --check` passes.
> - **Unsupported ids:** an id the SDK can't support goes under `unsupported` with a reason. Never write placeholder code.

The code blocks of [qbitflow.app/docs](https://qbitflow.app/docs) (its TypeScript tab) and of this
README are not written by hand: they are named regions of the programs in [`examples/`](examples).
The hub checkout this repository lives in (`sdk/qbitflow-js-sdk`)
holds the shared catalog of snippet ids (`snippets/catalog.json`) and the script that checks and
embeds them (`scripts/embed-snippets.mjs`).

- **Markers.** A region starts with a line `// docs:start <id>` and ends with `// docs:end <id>`
  (one space each side; indentation before is fine, the extractor dedents). One region per catalog
  id; regions never overlap or nest.
- **A region reads on its own.** Every snippet except `client-init` and `client-on-behalf-of`
  uses a ready client named `client`. An id it needs but doesn't create comes from a variable
  defined just outside the region (`paymentUuid`, `subscriptionUuid`, `sessionUuid`,
  `memberUuid`). Use the catalog's shared values (`conventions.values`: the T-shirt, `order-1042`,
  `https://shop.example.com/…`, `Placeholders.UUID` in the success URL, …), never a real key
  (`process.env.QBITFLOW_API_KEY`, `QBITFLOW_WEBHOOK_SECRET`). Setup the reader doesn't need (env
  lookups for ids, arg checks, demo clean-up) stays outside the region.
- **The manifest**, [`examples/snippets.manifest.json`](examples/snippets.manifest.json), maps every
  catalog id to the file holding its region (`snippets`), or to the reason this SDK can't provide
  it (`unsupported`), and pins the hub commit of the catalog it follows (`catalog`).
- **The README** embeds a region with an empty block, filled by the script:

  ```html
  <!-- docs:snippet checkout-create-payment -->
  <!-- /docs:snippet -->
  ```

  Never edit the code between the markers: change the region, then re-run the script.

From the repository root, in the hub checkout:

```bash
node ../../scripts/embed-snippets.mjs .           # rewrites README.md's embedded blocks
node ../../scripts/embed-snippets.mjs --check .   # changes nothing; exits 1 on any drift
```

`tests/snippets.test.ts` (part of `npm run test:unit`) runs the `--check`. It finds the hub at
`QBITFLOW_HUB_DIR` when set (an invalid one fails the test), else at `../..`; without a hub (this
repository cloned on its own) it is skipped.
