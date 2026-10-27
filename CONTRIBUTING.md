# Contributing to the QBitFlow JavaScript/TypeScript SDK

Thank you for helping. Bug reports and pull requests are welcome on
[GitHub](https://github.com/QBitFlow/qbitflow-js-sdk). For a security issue, don't open an
issue: follow [SECURITY.md](SECURITY.md).

## Setting up

You need Node.js 20 or later and npm.

```bash
git clone https://github.com/QBitFlow/qbitflow-js-sdk.git
cd qbitflow-js-sdk
npm ci
```

## The gates you can run

Run these from the repository root before opening a pull request, with no `QBITFLOW_*`
environment variable set (they then stay offline and need no account):

```bash
npm run build       # the CommonJS and ES module builds, with their .d.ts
npm run lint        # eslint, then prettier --check
npm run typecheck   # tsc over src, tests and scripts
npm run test:unit   # every offline test suite (jest)
npm run smoke       # packs the tarball and imports it from ESM, CommonJS and TypeScript
cd examples && npm install && npm run typecheck   # the example programs, against your build
```

`npm test` is `typecheck` then `test:unit`. `npm run format` rewrites the files prettier would
flag. The same gates run in CI on Node.js 20, 22 and 24 for every pull request.

Two suites belong to the maintainers' conformance suite and are **skipped** in a fresh clone:
`tests/vectors.test.ts` (the conformance vectors shared by the official SDKs) and
`tests/snippets.test.ts` (the website's code snippets). A skipped suite is expected; the
maintainers run them before merging. See [tests/README.md](tests/README.md).

The live suite, `npm run test:live`, calls a real QBitFlow server: it needs an API key and a base
URL (`QBITFLOW_API_KEY`, `QBITFLOW_BASE_URL`) and is skipped without them. Use a test-mode key
of your own; the write checks need `QBITFLOW_LIVE_WRITES=1`. You don't need to run it for a pull
request.

## Pull requests

- Keep a change focused, and add tests for it: the success and the error paths, asserting what
  was sent as well as what was returned (use the local server in `tests/helpers/`, not a mocked
  `fetch`).
- Document every exported symbol with TSDoc: it ships in the package's type declarations.
- A change users can see goes into the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md)
  (create it at the top if it isn't there).
- Don't hand-edit the code blocks the README embeds between `<!-- docs:snippet … -->` markers:
  they come from `examples/` (below). Change the example instead and mention it in the pull
  request; a maintainer regenerates the README.

## Examples and website snippets

The programs in [`examples/`](examples) are complete and runnable
([examples/README.md](examples/README.md)). Every new program goes into the `typecheck` script
of `examples/package.json`, with an npm script to run it, and into `examples/README.md`.

Some of their code is also published on [qbitflow.app/docs](https://qbitflow.app/docs) and in
this README: named regions between `// docs:start <id>` and `// docs:end <id>`.

- A region reads on its own: it uses a ready client named `client`, and the ids it needs come
  from variables defined just outside it (`paymentUuid`, `subscriptionUuid`, …). Never put a
  real key in one: use `process.env.QBITFLOW_API_KEY` and `process.env.QBITFLOW_WEBHOOK_SECRET`.
- Region ids are a public contract with the website: never rename or remove one. Ask in your
  pull request if one must change.
- [`examples/snippets.manifest.json`](examples/snippets.manifest.json) maps every id to the file
  holding its region. The maintainers' tooling checks the regions, the manifest and the README's
  embedded blocks (`tests/snippets.test.ts`).
