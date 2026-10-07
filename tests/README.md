# QBitFlow SDK Tests

This directory contains the test suite for the QBitFlow JavaScript/TypeScript SDK.

## Running Tests

```bash
# Type-check src + tests, then run every offline suite (the live suite skips without a key)
npm test

# Only jest, no type-check
npm run test:unit

# Live integration suite: reads QBITFLOW_API_KEY and QBITFLOW_BASE_URL from the environment
# (load the workspace's .local.env — never print it)
set -a; source ../.local.env; set +a
npm run test:live

# Packed-tarball smoke test (ESM import, CJS require, TypeScript nodenext) — needs `npm run build`
npm run smoke
```

## Test Structure

Offline suites (no server, run on every `npm test`):

- **QBitFlow.test.ts** – client construction and defaults
- **exceptions.test.ts** – exception hierarchy, `statusCode`, `fields`, `retryAfter`
- **errorParsing.test.ts** – error envelopes (`error`, `errors[]`, `message`, plain text) → messages/fields
- **decode.test.ts** – the response decoder (absent/null → zero value, nullable fields always
  present, wrong JSON type → `ServerException` with the field path), every schema, and the
  `parseSessionWebhook` / `parseSubscriptionWebhook` helpers
- **requestBehaviour.test.ts** – request construction and bodies, path escaping, headers,
  per-service and client-level `onBehalfOf`, response decoding (null lists, currency objects,
  empty / non-JSON 2xx), session-kind checks, status → exception mapping
  (400/422/401/403/404/409/429/other 4xx/3xx/5xx), CSV error parsing, `webhooks.verify()`
  false-only-on-400 with raw-body inputs
- **retryPolicy.test.ts** – GET-only retries with exponential back-off, POST/PUT/DELETE and the
  action GETs (force-cancel, execute-billing, claim-funds test trigger) never retried,
  `maxRetries: 0`, configuration errors never retried, redirects never followed
- **utils.test.ts** – client-side validation rules (alphanumspace, producttext, email, URLs,
  customer UUIDs, prices, durations and uint32 bounds, accounting dates) and request bodies
- **types.test.ts** – enum completeness and compile-time pinning of every response field's type
- **webhookVerify.test.ts** – local HMAC verification, including both sets of Go-generated
  golden vectors, raw-byte inputs and Go-compatible timestamp parsing
- **esmSpecifiers.test.ts** – every relative import carries a `.js` extension (ESM build guard),
  the `exports` map, and `VERSION` = `package.json` = top CHANGELOG entry

Live suite:

- **integration.test.ts** – end-to-end calls against a real QBitFlow server. It never defaults to
  a URL: with `QBITFLOW_API_KEY` and `QBITFLOW_BASE_URL` set it runs against that server; with
  the key but no base URL it **fails** with a message naming the missing variable; with neither
  it is skipped, so the offline `npm test` stays green. Unexpected errors fail the test.

## Writing New Tests

1. Test both success and error cases.
2. Prefer the throwaway HTTP server pattern (see `requestBehaviour.test.ts`) over mocking axios,
   so the real request path is exercised.
3. Anything that needs the API goes in `integration.test.ts` under `describeLive`.
4. `tests/` is type-checked (`npm run typecheck`), so response-shape assertions are compile-time.
