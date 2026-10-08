# QBitFlow SDK tests

The test suites of the QBitFlow JavaScript/TypeScript SDK 3.0.0 (jest + ts-jest). They import the
TypeScript sources directly (`../src/…`); `tests/` is type-checked with the sources
(`tsconfig.test.json`).

## Running the tests

```bash
npm test               # tsc over src + tests, then every offline suite (the live suite skips)
npm run test:unit      # jest only, no type-check
npm run test:coverage  # jest with a coverage report (coverage/)
npm run smoke          # packs the tarball and imports it from ESM, CJS and TypeScript (after `npm run build`)
```

One suite or one test: `npx jest tests/<file>.test.ts -t '<name>'`.

## Offline suites

Every `*.test.ts` except `integration.test.ts` runs without a QBitFlow server: requests go to a
local throwaway HTTP server (`tests/helpers/`) that records what it receives and answers with
scripted responses, so the real `fetch` path (headers, timeouts, redirects, dropped connections) is
exercised. The clients built on it record their back-off sleeps instead of waiting. The suites
(`client`, `transport`, `retry`, `errors`, `pagination`, `validate`, `webhook`, `events`, `models`,
`services`, `router`, `helpers`, `esmSpecifiers`, and `vectors` below) cover, for the behaviour contract the four
QBitFlow SDKs share:

- **the client**: key and option checks, defaults, `onBehalfOf` (client and request level),
  `me()`;
- **request building for every method**: verb, path and path escaping, query, body, and the
  headers (`X-API-Key`, `User-Agent`, `On-Behalf-Of`, `X-Request-Id`, `Idempotency-Key` on the 7
  creates only, stable across a retried 503);
- **the retry matrix**: which methods are retried, on what, the back-off, `Retry-After` and its
  60-second cap, `maxRetries: 0`, cancellation with an `AbortSignal`;
- **error mapping**: each status and code to its class, `fieldErrors` from `details.errors`,
  `requestId`, `rawBody`, the message format, `isRetryable`, `instanceof` across builds;
- **decoding**: absent or `null` values to zero values, a wrong JSON type to a `ServerError`,
  unknown enum values kept, the 202 of `subscriptions.cancel`, empty and non-JSON bodies;
- **client-side validation**: every rule, with the wire names of the failing fields;
- **pagination**: `Page<T>` and the async iterators (lazy, filters kept, stop conditions);
- **webhooks**: `verify` (the documented vector, secret rotation, tolerance, the header edge
  cases), `constructEvent`, `parseEvent` on the 15 documented event examples (`tests/fixtures/`),
  the type guards, and `verifyRemote`;
- **the webhook router** (`router`): the status matrix of `handle` (valid → 200 with typed data,
  bad or stale signature → 400, not JSON or v1 → 400, unknown type → 200 with `onUnknown` and
  `onAny`, a failing handler → 500 with the later handlers skipped, `onAny` order), and the
  adapters: `fetchHandler` with Web `Request`/`Response`, `nodeHandler` behind a real `node:http`
  server (raw body, a `Buffer`/string `req.body`, a parsed `req.body` → 500), 405, 413 and the
  header's case;
- **the integration helpers** (`helpers`): the `webhooks.sign` vector and round trip,
  `waitForCompletion` (completion, expiry, timeout, interval floor, errors, abort), `hasAccess`
  boundaries, `formatAmount` / `parseAmount`, the 95-day export windows and the CSV header
  de-duplication, `QBitFlow.fromEnv`, `Placeholders`;
- **packaging**: relative imports carry their `.js` extension (ESM build), the `exports` map, and
  `VERSION` = `package.json` = the top CHANGELOG entry.

## Cross-SDK vectors

`vectors.test.ts` replays the conformance vectors shared by the Go, JavaScript, Python and PHP SDKs
(generated with the Go reference SDK): `../.claude/cross-sdk-checks/v3/vectors/*.json` in the SDKs'
workspace (`signature`, `events`, `validation`, `decoding`, `requests`). Every expected outcome must
be reproduced, except the JavaScript deviations listed at the top of the file (a path segment made
only of dots, which `fetch` cannot send, is refused with a `ValidationError`). The suite is skipped
when the workspace's vectors are not there, e.g. when the package is tested on its own.

## Live suite

`integration.test.ts` runs end-to-end calls against a real QBitFlow server (`npm run test:live`).
It never defaults to a URL:

| Environment | Result |
|---|---|
| `QBITFLOW_API_KEY` and `QBITFLOW_BASE_URL` set | runs against that server |
| `QBITFLOW_API_KEY` set, `QBITFLOW_BASE_URL` not | **fails**, naming the missing variable |
| neither | skipped, so the offline `npm test` stays green |

```bash
QBITFLOW_API_KEY=sk_… QBITFLOW_BASE_URL=https://… npm run test:live
# or, from the SDKs' workspace (never print the file):
set -a; source ../.local.env; set +a; npm run test:live
```

The read-only checks only read. The write checks (they create a product, a customer, a checkout
session, which `waitForCompletion` waits on with a short timeout, a checkout session with fees,
and a webhook endpoint, then delete or expire each of them) also need `QBITFLOW_LIVE_WRITES=1` **and** a test-mode
key (checked with `me()`); `QBITFLOW_ALLOW_LIVE_MODE_WRITES=1` allows a live-mode key, for a
disposable server only.

## Writing new tests

1. Test the success and the error paths, and assert what was sent as well as what was returned.
2. Use the local server helpers rather than mocking `fetch`, so the real request path is exercised.
3. A behaviour every SDK shares belongs in the cross-SDK vectors too.
4. Anything that needs the API goes in `integration.test.ts`, read-only unless it is a write check.
