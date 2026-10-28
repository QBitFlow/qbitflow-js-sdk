# Security policy

This policy covers the QBitFlow JavaScript/TypeScript SDK (the npm package
[`qbitflow`](https://www.npmjs.com/package/qbitflow)). For the QBitFlow platform itself (the API,
the dashboard, the hosted checkout), use the same address below.

## Supported versions

Only the latest 3.x release receives security fixes. Fixes are not backported to 2.x or earlier:
upgrade with the [migration guide](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/MIGRATION-v3.md).

| Version | Security fixes |
|---|---|
| latest 3.x | yes |
| older 3.x | no: upgrade to the latest 3.x |
| 2.x and earlier | no |

## Reporting a vulnerability

Email **security@qbitflow.app**. Do not open a public GitHub issue, discussion or pull request
for a suspected vulnerability.

Please include:

- the SDK version (`import { VERSION } from 'qbitflow'`), your Node.js version and your OS or
  runtime;
- what you found and its impact, with the steps or a minimal program that reproduces it;
- whether you believe it is being exploited, and how you would like to be credited.

Never send a live API key, a webhook secret or customer data. If a reproduction needs a key,
use a test-mode key (`sk_test_…`) you revoke afterwards.

We acknowledge your report, keep you informed while we investigate, and agree a disclosure date
with you before anything is published.

## Disclosure

Fixed vulnerabilities are published as
[GitHub Security Advisories](https://github.com/QBitFlow/qbitflow-js-sdk/security/advisories)
on this repository (with a CVE when one applies) and listed in the
[CHANGELOG](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/CHANGELOG.md) under
**Security**, in the release that fixes them.

## Security properties of the SDK

What the SDK does to protect your credentials and your integration (each point holds in the
current source, under `src/`):

- **The API key stays out of output.** The client keeps the key in a JavaScript private field:
  `console.log`, `util.inspect` and `JSON.stringify` of a client (or of any object the SDK
  creates) never show it. A key, `onBehalfOf` value or base URL the SDK refuses is never quoted
  in the error message.
- **The key is only sent to the base URL.** Requests go to `https://api.qbitflow.app/v2` by
  default, over TLS through the platform's `fetch`. Redirects are never followed (the request is
  sent with `redirect: 'manual'`, and a 3xx answer is an error), so the `X-API-Key` header cannot
  be forwarded to another host. A custom `baseUrl` must be an absolute `http` or `https` URL with
  no credentials, query or fragment; use `http` only for a local test server.
- **Headers and paths are checked before sending.** The API key must be printable ASCII without
  spaces, `onBehalfOf` a UUID, `X-Request-Id` and `Idempotency-Key` short printable values: a
  value that could inject a header line is refused. Path parameters are percent-encoded, and a
  path segment of `.` or `..` is refused, so an input can never address another route.
- **Webhook signatures are verified safely.** `webhooks.verify` and `webhooks.constructEvent`
  compute the HMAC-SHA256 of the raw body with your endpoint secret and compare it to every `v1`
  signature of the `QBitFlow-Signature` header in constant time (`crypto.timingSafeEqual`). The
  signature's timestamp must be within a tolerance of the current time (300 seconds by default),
  which limits replays. The webhook router's adapters refuse bodies over 1 MiB.
- **Untrusted JSON can't pollute prototypes.** Metadata maps decoded from the API or from a
  webhook keep a `__proto__` key as an ordinary own entry; nothing is merged into
  `Object.prototype`.
- **No telemetry, no logging.** The SDK sends nothing to anyone but the base URL you configure,
  and writes nothing to the console, to files or to any other output.
- **No runtime dependencies.** The package depends only on Node.js built-ins (`node:crypto`) and
  the global `fetch`, which keeps its supply chain to this repository.

## Your part

- Keep API keys and webhook secrets in a secret manager or environment variables, never in source
  control or client-side code. The SDK is for servers: never ship a key to a browser.
- Verify every webhook (`webhooks.verify`, `constructEvent` or the webhook router) on the raw
  body, before parsing it, and deduplicate deliveries on the event `id`.
- Fulfil orders on `payment.completed` / `subscription.created`, never on the customer reaching
  your `successUrl`.
- Revoke a key in the dashboard as soon as you suspect it leaked.
