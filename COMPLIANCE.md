# Data handling and compliance

This page describes what the QBitFlow JavaScript/TypeScript SDK (the npm package `qbitflow`)
does with data, to help you assess it in your own privacy and compliance reviews. It describes
the SDK only: what the QBitFlow platform stores and processes is covered by QBitFlow's terms
and privacy policy at [qbitflow.app](https://qbitflow.app).

## What the SDK sends, and where

The SDK is an HTTP client for the QBitFlow API. It sends requests only to the base URL you
configure (`https://api.qbitflow.app/v2` by default), and only when your code calls one of its
methods. A request carries:

- your API key (`X-API-Key`), and the `On-Behalf-Of`, `Idempotency-Key` and `X-Request-Id`
  headers when they apply;
- a `User-Agent` of the form `qbitflow-js/<version>`;
- the parameters you pass: for example a customer's name, email, phone number and address, a
  product's name and price, your references and `metadata`, a checkout's redirect URLs.

What you send is your decision: send only the personal data your integration needs, and keep
secrets out of `metadata`, references and descriptions (they are stored by QBitFlow and appear
in API reads and webhooks).

`client.webhooks.verifyRemote` posts a webhook body and its signature header to the API for
verification. `webhooks.verify` and `webhooks.constructEvent` run locally and send nothing.

## What the SDK stores

Nothing. The SDK keeps no cache, writes no file, sets no cookie and uses no browser or local
storage. A client holds its configuration (API key, base URL, timeout, retry count, default
`onBehalfOf`) in memory for its lifetime; API answers are returned to your code and not kept.

## Telemetry and logging

None. The SDK collects no usage data, sends nothing to QBitFlow or to anyone else beyond the
requests your code makes, and writes nothing to the console or to any log. What you log is up to
you: the SDK's errors never include your API key, and `console.log` of a client does not show it
(see [SECURITY.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/SECURITY.md)). An
error's `rawBody` is the API's answer and may contain data you sent; redact it before logging if
your policy requires.

## Secrets

- The API key is kept in a private field and never appears in error messages or inspection
  output.
- Webhook secrets are passed per call (or to the webhook router) and used only to compute the
  HMAC-SHA256 of the body; the SDK doesn't keep them beyond the router that holds them.

## Cryptography

The SDK implements no cryptographic primitive of its own. It uses Node.js's `node:crypto`
(HMAC-SHA256 and constant-time comparison) to verify webhook signatures, and the platform's
`fetch` (TLS) for transport. It never handles wallet keys, seed phrases or signatures of
blockchain transactions: payments are signed by the customer's wallet on QBitFlow's hosted
checkout.

## Dependencies and licence

The package has **zero runtime dependencies**: only Node.js built-ins and the global `fetch`
(Node.js 20 or later). It is distributed under the
[Mozilla Public License 2.0](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/LICENSE);
the QBitFlow name and logo are covered by the
[trademark policy](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/TRADEMARKS.md).
