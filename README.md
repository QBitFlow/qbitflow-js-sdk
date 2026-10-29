# QBitFlow JavaScript/TypeScript SDK

[![npm version](https://img.shields.io/npm/v/qbitflow.svg)](https://www.npmjs.com/package/qbitflow)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](#installation)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)

The official JavaScript/TypeScript SDK for [QBitFlow](https://qbitflow.app), non-custodial crypto
payments: hosted checkouts, one-time payments, subscriptions, refunds, marketplaces with
commissions and held funds, accounting exports and signed webhooks. Customers pay from their own
wallets, on Ethereum, Base and Solana, straight to yours.

- **API v2**, every integrator route: 53 public routes in 14 services, one `QBitFlow` client.
- **No runtime dependencies**: Node.js 20+, the global `fetch` (or one you inject), CommonJS and
  ES modules, TypeScript types included.
- **Typed errors** matched with `instanceof`, each carrying the API's code, request id and field
  errors.
- **Safe retries**: reads and creates are retried on network errors, 5xx and 429, and every create
  sends an `Idempotency-Key`, so a retry never charges or creates twice.
- **Async iterators**: `for await (const p of client.payments.iterate())` walks every page lazily.
- **Webhooks** verified locally (`QBitFlow-Signature`, secret rotation included) and parsed into a
  typed event union; a **webhook router** turns a delivery into the right HTTP answer, for Next.js,
  Express, Hono, Workers or plain Node.
- **Integration helpers**: `waitForCompletion`, `hasAccess`, exact `formatAmount` / `parseAmount`,
  accounting exports over any range, `QBitFlow.fromEnv()`.

> Coming from 2.x? Read [MIGRATION-v3.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/MIGRATION-v3.md): 3.0.0 targets API v2 and changes the
> services, the routes, the ids, the money types, the errors and the webhooks.

## Contents

- [Installation](#installation)
- [TypeScript, ES modules and CommonJS](#typescript-es-modules-and-commonjs)
- [Quick start](#quick-start)
- [Integration recipes](#integration-recipes)
- [Authentication and acting for a member](#authentication-and-acting-for-a-member)
- [Test mode and live mode](#test-mode-and-live-mode)
- [Checkout sessions](#checkout-sessions)
- [Products and customers](#products-and-customers)
- [Payments and failures](#payments-and-failures)
- [Subscriptions](#subscriptions)
- [Refunds](#refunds)
- [Marketplaces](#marketplaces)
- [Wallets](#wallets)
- [Accounting export](#accounting-export)
- [Webhooks](#webhooks)
- [Currencies](#currencies)
- [Pagination and iterators](#pagination-and-iterators)
- [Errors](#errors)
- [Retries and idempotency](#retries-and-idempotency)
- [Configuration](#configuration)
- [What the SDK doesn't cover](#what-the-sdk-doesnt-cover)
- [Migrating from 2.x](#migrating-from-2x)
- [Examples](#examples) · [Testing](#testing) · [License](#license) · [Support](#support) · [Security](#security)

## Installation

```bash
npm install qbitflow
```

```ts
import { QBitFlow, webhooks, NotFoundError } from 'qbitflow'; // ES modules and TypeScript
```

```js
const { QBitFlow, webhooks, NotFoundError } = require('qbitflow'); // CommonJS
```

**Requires Node.js 20 or later.** The SDK has no runtime dependencies: it calls the API with the
global `fetch` and verifies webhooks with `node:crypto`. It is server-side code: never ship an API
key to a browser. Bun and Deno (`npm:qbitflow`) provide `node:crypto`; on Cloudflare Workers enable
the `nodejs_compat` flag; runtimes without `node:crypto` (the Next.js and Vercel Edge runtime) can't
load the package.

## TypeScript, ES modules and CommonJS

The package ships both module formats and their type declarations, wired through its `exports`
map: `import` gets the ES module build, `require` the CommonJS build, each with its own `.d.ts`.
Every exported class, method, model and option is documented in TSDoc, so your editor shows the
same documentation as this README. The package has no default export: import what you use by
name.

```ts
import { QBitFlow, EventType, type Payment, type Page } from 'qbitflow';

async function recentPayments(client: QBitFlow): Promise<Page<Payment>> {
	return client.payments.list({ limit: 10 });
}

// Enums are string-literal unions with a const object of the known values.
const wanted: EventType[] = [EventType.PaymentCompleted, EventType.CheckoutExpired];
```

TypeScript 5 with `strict` is supported, under `"moduleResolution"` `node16`, `nodenext` or
`bundler`. The package marks itself free of side effects (`"sideEffects": false`), so bundlers
can drop what you don't import.

## Quick start

Create a client and check its key (`import { Placeholders, QBitFlow } from 'qbitflow'`):

<!-- docs:snippet client-init -->
```ts
// One client per API key, shared by the whole program. A blank key, one not starting with
// sk_, or one with a space or a control character, throws a ValidationError (nothing is sent).
const client = new QBitFlow(process.env.QBITFLOW_API_KEY ?? '');

// The recommended start-up check: what is this key, and which mode is it in? An
// AuthenticationError for an unknown or revoked key.
const me = await client.me();
console.log(`${me.role} key, test mode: ${me.space?.test}`);
```
<!-- /docs:snippet -->

Then open a hosted checkout and send the customer to it:

<!-- docs:snippet checkout-create-payment -->
```ts
// An inline product: nothing needs to exist in your catalog. QBitFlow replaces {{UUID}} with the
// session's id on the redirect.
const session = await client.checkoutSessions.createPayment({
	productName: 'T-shirt',
	description: 'Blue, size M',
	priceUsd: '4.99', // USD, a decimal string, never a float
	reference: 'order-1042', // your order id: unique per space
	successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/orders/cancel',
});

// Redirect the customer to the hosted checkout page.
console.log(`Redirect the customer to ${session.link}`);
```
<!-- /docs:snippet -->

Fulfil the order when the [`payment.completed` webhook](#webhooks) arrives for `session.uuid`,
never on the customer's redirect to your success page.

### Conventions

- **Every method** returns a `Promise`, takes its params as one object, and accepts
  [request options](#configuration) as its last argument (`onBehalfOf`, `idempotencyKey`,
  `requestId`, `signal`).
- **Ids are strings.** Resources are named by UUIDs; transactions by prefixed ids (`pay@…` a
  payment, `sub@…` a subscription, `sub-hist@…` a bill, `refund@…` a refund) that you pass back
  verbatim. Only currencies keep numeric ids.
- **Optional response fields** are typed `field?: T` (absent: `undefined`). The API never sends
  `null`: an optional field without a value is absent. A required field the API leaves out decodes
  to its zero value (`''`, `0`, `false`, `[]`, `{}`), never to an error; a value of the wrong JSON
  type is a `ServerError`.
- **Money is a decimal string, never a number**, in requests and responses alike: USD amounts
  (`priceUsd: '4.99'`, `amountUsd`, `totalUsd`), token amounts (`amount: '10'` in the token's
  units, next to `amountMinUnits: '10000000'` on-chain and the `currency` object) and fee rates in
  percent (`feePercent: '0.99'` is 0.99 %, `refundPercent: '50'`). Inputs are checked before
  sending: at most 2 decimals, no sign or exponent (`'12.50'` is fine; a JSON number would be
  refused by the API). Compare or add them with a decimal library, or `formatAmount` /
  `parseAmount`.
- **Metadata:** products, customers, checkouts and subscriptions carry `metadata`, your own
  `Record<string, string>` (an order id, a CRM key): at most 50 keys of 1 to 40 characters among
  `A-Z a-z 0-9 _ - . :`, values of at most 500 characters without control or bidirectional
  characters. A checkout's is copied onto its payment or subscription and into their webhooks. On
  an update it is **merged**: a key set to a value sets it, a key set to `''` deletes it, keys not
  named are kept. Never put secrets or personal data in it.
- **Enums** are string-literal unions with a `const` object listing the known values
  (`SubscriptionStatus.PastDue === 'pastDue'`). A value this SDK does not know yet is kept as is:
  give every `switch` a `default` branch.
- **Times** are ISO 8601 strings, exactly as the API sent them (RFC 3339 in UTC; any offset is
  accepted): use `Date.parse(value)` to compare. Date filters (`createdAfter`,
  `createdBefore`) take a `Date` or an RFC 3339 string.
- **Path segments** you pass (ids, event ids) are percent-encoded. A value that is
  exactly `.` or `..` is refused with a `ValidationError`: `fetch` would normalise it away.

## Integration recipes

A typical integration is three steps: open a checkout, receive the webhook, grant access. The
helpers below make each one a few lines; the sections after them document every method.

### A webhook endpoint in your framework

`webhooks.router(secret)` verifies each delivery's signature over the raw body, parses it, runs the
handlers registered for its type and answers QBitFlow: 200 when handled (or ignored), 400 for a
bad signature, 500 when a handler throws (QBitFlow retries it later). See
[Webhooks](#2-handle-the-deliveries-with-the-router) for the details.

**Next.js** (App Router, `app/api/webhooks/qbitflow/route.ts`, the default Node.js runtime, not
the Edge runtime): a route handler receives the raw body, nothing to configure.

```ts
import { webhooks } from 'qbitflow';

const router = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!)
	.on('payment.completed', async (payment, event) => {
		await fulfilOrder(payment.reference, event.id); // idempotent: deduplicate on event.id
	});

export const POST = router.fetchHandler();
```

**Express**: give the route the raw body with `express.raw()`, and register it **before** any
`app.use(express.json())`. A body already parsed cannot be verified: the router answers 500 and
says so.

```ts
import express from 'express';
import { webhooks } from 'qbitflow';

const router = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!)
	.on('payment.completed', (payment, event) => fulfilOrder(payment.reference, event.id));

const app = express();
app.post('/webhooks/qbitflow', express.raw({ type: 'application/json' }), router.nodeHandler());
app.use(express.json()); // the rest of your API, after the webhook route
app.listen(3000);
```

**Hono, Bun, Deno, Cloudflare Workers**: anything that hands over a Web `Request` takes
`fetchHandler()`. On Workers, enable the `nodejs_compat` compatibility flag (the SDK uses
`node:crypto`) and build the router from `env`:

```ts
import { Hono } from 'hono';
import { webhooks } from 'qbitflow';

const handleWebhook = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!)
	.on('payment.completed', (payment, event) => fulfilOrder(payment.reference, event.id))
	.fetchHandler();

const app = new Hono();
app.post('/webhooks/qbitflow', (c) => handleWebhook(c.req.raw));
export default app;
```

```ts
import { webhooks } from 'qbitflow';

interface Env {
	QBITFLOW_WEBHOOK_SECRET: string;
}

// A Cloudflare Worker: the secret comes from env, so the router is built per request (cheap).
export default {
	fetch(request: Request, env: Env): Promise<Response> {
		return webhooks
			.router(env.QBITFLOW_WEBHOOK_SECRET)
			.on('payment.completed', (payment, event) => fulfilOrder(payment.reference, event.id))
			.fetchHandler()(request);
	},
};
```

**Plain Node.js** (`node:http`): `nodeHandler()` reads the raw body itself (at most 1 MiB).

<!-- docs:snippet webhook-handler -->
```ts
const router = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!, {
		// Every 400 (bad signature or body: event null) and 500 (a handler threw). The router
		// answers without the details: log them here.
		onError: (event, err) => console.error('webhook rejected:', event?.id, err.message),
	})
	.on('payment.completed', async (payment, event) => {
		await fulfilOrder(payment.reference, event.id); // idempotent: deduplicates on event.id
	});

// nodeHandler() reads the raw body itself (at most 1 MiB): mount it before any body parser.
const handleWebhook = router.nodeHandler();
createServer((req, res) => {
	if (req.url === '/webhooks/qbitflow') void handleWebhook(req, res);
	else res.writeHead(404).end();
}).listen(8080);
```
<!-- /docs:snippet -->

### Checkout, success page, and waiting in scripts

Open the checkout as in the [Quick start](#quick-start): QBitFlow fills the placeholders of
`successUrl` and `cancelUrl` in on the redirect (`Placeholders.UUID`, never URL-encoded by the
SDK). The success page may show the [status](#status) (`checkoutSessions.get`), but never fulfils: the `payment.completed`
webhook does (anyone can open the success URL).

In a script, a test or a back-office job, `waitForCompletion` polls the status until the session
is `completed` or `expired` (every 3 s, for 10 minutes by default). When the timeout comes first it
returns the last status seen: check it.

<!-- docs:snippet wait-for-completion -->
```ts
// Polls get until the session is completed or expired. When the timeout comes first,
// it returns the last status seen: check it.
const final = await client.checkoutSessions.waitForCompletion(sessionUuid, {
	timeout: 10 * 60_000, // ms
	interval: 5_000, // ms, at least 1000
});
if (final.status === CheckoutSessionStatusValue.Completed) {
	console.log(`paid, tx ${final.txHash}`);
} else {
	console.log(`not paid: ${final.status}`); // expired, or still open at the timeout
}
```
<!-- /docs:snippet -->

### Access control

Grant access while `now < currentPeriodEnd`, whatever the subscription's status: `hasAccess`
does exactly that. `hasAccess(subscription, at)` checks at a given time, and it takes the
subscription the `subscription.*` webhooks carry (`event.data`) too.

<!-- docs:snippet has-access -->
```ts
// Grant access while now < currentPeriodEnd, whatever the status: a stopped or paused
// subscription has paid for its period.
const subscription = await client.subscriptions.get(subscriptionUuid);
if (hasAccess(subscription)) {
	console.log('serve the premium content');
} else {
	console.log('access ended: show the renewal page');
}
```
<!-- /docs:snippet -->

### Money display

Token amounts come both ways: `amount` in the token's units (`'4.99'`) and `amountMinUnits`, its
on-chain integer (`'4990000'`). Convert between the two exactly with `formatAmount` and
`parseAmount` (string arithmetic, never floats). For a payment:
`formatAmount(payment.amountMinUnits, payment.currency.decimals)` equals `payment.amount`.

<!-- docs:snippet amounts-display -->
```ts
// Token amounts come both ways, as decimal strings: payment.amount ('4.99') and
// payment.amountMinUnits ('4990000', with payment.currency.decimals). Convert between them with
// string arithmetic, never floats.
const shown = formatAmount('4990000', 6); // '4.99' (USDC has 6 decimals)
const minUnits = parseAmount('4.99', 6); // '4990000'
console.log(`${shown} USDC = ${minUnits} minimal units`);
```
<!-- /docs:snippet -->

### A yearly accounting export

The API exports at most 92 days at a time (both included); the range helpers split any range into
windows, request them in order and concatenate the result (the CSV header once).

<!-- docs:snippet accounting-export -->
```ts
// Every payment, bill, refund and fee between two dates (both included). Any range: the SDK
// requests it in windows of at most 92 days, both included (here 4), and concatenates them.
const rows = await client.accounting.exportJsonRange('2026-01-01', '2026-12-31');
for (const row of rows.slice(0, 5)) {
	console.log(row.type, row.txUuid, row.txTimeUtc, row.grossAmountUsd, row.productName);
}

// The same as CSV text, its header line once.
const csv = await client.accounting.exportCsvRange('2026-01-01', '2026-12-31');
await writeFile('qbitflow-2026.csv', csv, { mode: 0o600 });
```
<!-- /docs:snippet -->

### Configuration from the environment

<!-- docs:snippet config-from-env -->
```ts
// QBITFLOW_API_KEY (required), and QBITFLOW_BASE_URL and QBITFLOW_ON_BEHALF_OF when set.
const client = QBitFlow.fromEnv();

// Explicit options override the environment and add the others.
const patient = QBitFlow.fromEnv({ timeout: 60_000, maxRetries: 5 });
```
<!-- /docs:snippet -->

## Authentication and acting for a member

Every request sends your API key in `X-API-Key`. Keys are created in the QBitFlow dashboard; each
belongs to one **space** (your organization's, or one of its members') and one **mode** (test or
live). The constructor only checks the key's shape (non-blank, starting with `sk_`, printable ASCII
without spaces) and sends nothing: call `me()` to check it online ([Quick start](#quick-start)). It returns the key's `role`
(`admin`: an organization key) and its `space` (`organizationName`, `test`): a job meant for test
mode can refuse to run when `me.space?.test` is not `true`.

Keep the key in a secret store or an environment variable, never in code. The client never shows
it: `console.log(client)` and `JSON.stringify(client)` leave it out. API v2 issues keys shaped
`sk_<test|live>_<uuid>_<secret>`; the SDK never parses them. Keys in an earlier format (v1's
`sk_<digits>_…`, or `sk_<uuid>_<test|live>_…`) pass the SDK's check but are refused by the API
(`401`): create a new one in the dashboard.

### `On-Behalf-Of`: acting in a member's space

A marketplace's **organization key** can act in any of its members' spaces: create their products
and checkouts, read their payments. Name the member by their **user UUID** (`Member.userUuid`,
also in the `member.joined` webhook). A non-member, an owner or admin of the team, or a member of
the other mode answers 404. Acting for a member, the request's role is `user`: the admin methods
(`members`, `invitations`, `wallets.listForMember`, `listAcceptedCurrencies` with a `userUuid`)
answer 403.

<!-- docs:snippet client-on-behalf-of -->
```ts
// An organization key acting in a member's space: every request of seller sends
// On-Behalf-Of. It shares client's configuration.
const seller = client.onBehalfOf(memberUuid);
const products = await seller.products.list();
console.log(`${products.items.length} products on the first page of the seller's space`);
```
<!-- /docs:snippet -->

For one request only, the request option wins over the client's; `''` forces the organization's
own space:

```ts
const page = await client.payments.list({}, { onBehalfOf: memberUuid });
const own = await seller.products.list({}, { onBehalfOf: '' }); // the organization's products
console.log(page.items.length, own.items.length);
```

`onBehalfOf` is also a client option: `new QBitFlow(key, { onBehalfOf: memberUuid })`. A value
that is not a UUID (or the nil UUID, or blank) throws a `ValidationError` at once, from
`client.onBehalfOf()` and from the constructor; as a request option it fails that call before
anything is sent. `''` means the organization level and the header is then **omitted** (never sent
blank: the API answers 403 to a blank one).

Acting for a member carries your organization's authority over its members: a member policy
doesn't stop you (`members.subscriptions`, `members.checkoutRedirects`, …), but the member's own
wallets and account stay theirs.

## Test mode and live mode

A key belongs to one mode, and so does everything it reads or creates: a test key only sees test
resources, a live key only live ones. `me()` tells you which (`me.space?.test`); there is no flag
to switch per request.

- **Test mode** runs on test networks with test tokens: nothing of value moves. A checkout is
  capped at `'5'` USD, fees included (a `ValidationError` with `details.max`), redirect URLs may
  be `http` (a local shop), subscriptions are billed only when you call
  [`subscriptions.testBill`](#test-billing), and the frequency may be as short as 5 minutes.
- **Live mode** needs `https` redirect and webhook URLs, a live subscription's price above
  `'0.25'` USD, and a frequency of at least 1 hour. `subscriptions.testBill` answers a
  `BadRequestError` `test_mode_only`.
- Webhook endpoints, members, invitations, products and customers are per mode too. Every event
  says its mode (`event.test`), and `currencies.list({ test: true })` lists the test networks'
  currencies.

Build and test your integration with a test key, then switch the key (not the code) for live.

## Checkout sessions

A checkout session is a hosted payment page. Create it, send your customer to its `link`, and act
on the webhook. The session's id (`pay@…` or `sub@…`) is also the id of the payment or the
subscription it creates once the customer's transaction is confirmed.

Name the product with **exactly one** of `productUuid`, `productReference`, or an inline product
(`productName` + `priceUsd`, `description` optional: see the [Quick start](#quick-start)). For a
product of your catalog:

<!-- docs:snippet checkout-create-payment-product -->
```ts
const session = await client.checkoutSessions.createPayment({
	productReference: 'tshirt-blue-m', // or productUuid
	reference: 'order-1042',
	successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/orders/cancel',
});
console.log(`Redirect the customer to ${session.link}`);
```
<!-- /docs:snippet -->

A subscription checkout takes the same fields plus its terms (`frequency`, `trialPeriod`, and
`minPeriods`: the periods the customer commits to), each optional over a subscription product's:

<!-- docs:snippet checkout-create-subscription -->
```ts
// The subscription exists, with the session's id, once the customer signed (here: started the
// trial). Act on the subscription.created webhook.
const session = await client.checkoutSessions.createSubscription({
	productName: 'T-shirt',
	description: 'Blue, size M',
	priceUsd: '4.99', // USD per period, a decimal string
	frequency: { value: 1, unit: DurationUnit.Months },
	trialPeriod: { value: 7, unit: DurationUnit.Days },
	reference: 'order-1043',
	successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/orders/cancel',
});
console.log(`Redirect the customer to ${session.link}`);
```
<!-- /docs:snippet -->

- **Other fields:** `reference` (your order id, unique per space), `customerUuid` or
  `customerReference` (kept on the payment; **no receipt without a QBitFlow customer**: see
  [Products and customers](#products-and-customers)), `expiresInMinutes` (10 to 1440; left out: the
  default), `metadata` (copied onto the payment or the subscription and into their webhooks:
  `payment.completed`, `subscription.*`, `checkout.expired`).
- **The answer** is a `CreatedCheckoutSession`: `link`, `uuid` and `expiresAt`, always set.
- **Redirect placeholders.** In `successUrl` and `cancelUrl`, QBitFlow replaces `{{UUID}}` with the
  session's id and `{{TRANSACTION_TYPE}}` with `payment` or `createSubscription`
  (`Placeholders.UUID`, `Placeholders.TRANSACTION_TYPE`; the SDK sends them as they are). In live mode both
  URLs must be `https`. A redirect proves nothing (anyone can open the URL): fulfil on the
  webhook, or on `checkoutSessions.get`.
- **A member's own key may send `successUrl` and `cancelUrl`** while its organization's
  `members.checkoutRedirects` policy allows it (on by default: a member's shop sends its customers
  back to its own site). With the policy off, the call fails with a `PermissionDeniedError`
  (403 `policy_disabled`, `details.policy` `members.checkoutRedirects`, `details.field` naming the
  URL, `successUrl` first) and nothing is created: the member's checkouts then go where the
  organization's checkout defaults say. An organization key, acting `onBehalfOf` a member too, may
  always send them.
- **Errors to expect:** a `ConflictError` `merchant_not_ready` (`details.reason`) when the space's
  wallets accept no currency, or for a subscription of a member whose funds you hold
  (`fundsHeld`); `unique_violation` when another payment or open session holds the `reference`; a `ValidationError` above `'5'` USD in test mode, fees included (`details.max`, a
  string), and at `'0.25'` or less for a live subscription (`details.min`); a `NotFoundError` for
  an unknown product or customer; a `GoneError` `merchant_closed` for a removed member's space.

### Fees

A checkout, a payment's or a subscription's, can add amounts to its price with `fees`: your own
lines (a tax, shipping, a service fee) and QBitFlow's processing fee. The customer sees each line
on the checkout and pays them with the price (a subscription: with every bill):

<!-- docs:snippet checkout-create-payment-fees -->
```ts
// The customer pays the price plus your lines and, with processingFee, QBitFlow's fee (grossed
// up, so you keep the price and your lines). Test mode caps the total at $5, fees included; the
// network fee comes on top.
const session = await client.checkoutSessions.createPayment({
	productName: 'T-shirt',
	description: 'Blue, size M',
	priceUsd: '3.99', // USD
	reference: 'order-1044',
	successUrl: `https://shop.example.com/orders/success?uuid=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/orders/cancel',
	fees: {
		items: [{ label: 'Shipping', description: 'Standard, 3 to 5 days', amountUsd: '0.75' }],
		processingFee: true, // omitted: your checkout.customerPaysProcessingFee setting decides
	},
});
console.log(`Redirect the customer to ${session.link}`);
```
<!-- /docs:snippet -->

- **Your lines** (`fees.items`, at most 10, shown in this order): `label` (1 to 40 characters, one
  line), `description` (optional, at most 200), `amountUsd` (a decimal string, `'4.99'`: above 0,
  at most 1,000,000, at most 2 decimals; sent as typed, so no float rounds it). The SDK checks them
  before sending: a `ValidationError` names the field (`fees.items[0].amountUsd`, or `fees.items`
  above 10 lines).
- **The processing fee** (`fees.processingFee: true`) is a last line, `Processing fee`, computed
  by QBitFlow on the price and your lines at your platform fee, grossed up and rounded up to the
  cent: QBitFlow's fee is also taken on that line, so you keep at least the price and your lines,
  as if no fee were taken ($100 + $20 VAT at 0.99 % → a $1.20 processing fee, $121.20 charged,
  $120.00 kept). The rate is the checkout's: QBitFlow's fee for your space when the checkout is
  created (a schedule by volume, unless QBitFlow set you a custom rate). `false`: you pay the
  fee, as without fees. Left out: your
  `checkout.customerPaysProcessingFee` setting decides (off by default, set by the organization's
  team in the dashboard: a member can't change it; your product links follow it too).
- **What the customer pays** is the session's and the payment's `amountUsd`: `priceUsd` plus every
  line. It is what the contracts split (QBitFlow's fee, and a marketplace's organization fee, are
  taken on it); the payment records it with its `priceUsd` and `fees`
  ([Payments](#payments-and-failures)). The network fee comes on top, in the currency the customer
  picks (`settlement.split.networkFee`). Test mode caps the total, fees included, at `'5'` USD
  (a `ValidationError` on `fees`).
- **Afterwards**, the `Payment` has `priceUsd`, `fees` (the lines as the customer saw them:
  `type` `custom` or `processingFee`, `label`, `description`, `amountUsd`) and `amountUsd`;
  `checkout.expired` sends the session with `priceUsd`, `fees` and `amountUsd`.
- **Subscriptions** take the same `fees` (`createSubscription`, the same rules), locked with the
  price: every bill, the first one and each next one, charges the price plus every line, whatever
  the product's price or your fee becomes. The `Subscription` keeps them as `fees` next to
  `priceUsd` (which stays the price); a bill's `amountUsd` and `subscription.upcomingBill`'s
  `amountUsd` include them, and the maximum and allowance the subscriber signs are sized on that
  amount. A trial's upgrade keeps the trial's lines. `checkout.customerPaysProcessingFee` applies
  to subscription checkouts too.
- A marketplace's organization fee is not passed on: it is taken from the amount as on any
  payment.

### Status

<!-- docs:snippet checkout-status -->
```ts
const status = await client.checkoutSessions.get(sessionUuid);
switch (status.status) {
	case CheckoutSessionStatusValue.Completed:
		console.log(`paid, tx ${status.txHash}`);
		break;
	case CheckoutSessionStatusValue.Expired:
		console.log('expired unpaid');
		break;
	case CheckoutSessionStatusValue.WaitingConfirmation:
		console.log('sent, waiting for the network');
		break;
	default:
		// created: waiting for the customer. A failed attempt (lastAttempt) is not final: the
		// customer can still pay from the same checkout.
		console.log(`open (${status.status}), last attempt: ${status.lastAttempt?.code ?? 'none'}`);
}
```
<!-- /docs:snippet -->

| `status` | Meaning | Final |
|---|---|---|
| `created` | Waiting for the customer. With `lastAttempt` set, their last attempt failed (`lastAttempt.code` says why) | no |
| `waitingConfirmation` | A transaction was sent; waiting for the network. It may last: the transaction can still land | no |
| `completed` | Confirmed and recorded: the `Payment` or `Subscription` exists, with the session's id | yes |
| `expired` | Expired unpaid (`checkout.expired` was sent). Once QBitFlow no longer keeps the record, a 404 | yes |

**Never cancel an order on `lastAttempt`:** a failed attempt is not final, and the customer can pay
from the same checkout until it expires. Release what the order holds on `checkout.expired`.

`expiresAt` is set while the session is open.
`checkoutSessions.waitForCompletion(uuid, { timeout?, interval?, signal? })` polls `get`
until `completed` or `expired` and returns that status; when `timeout` (ms, default 10 minutes; 0
or less: the default) elapses first, it returns the last status seen, after one final poll at the
deadline. `interval` is in ms (default 3000, at least 1000); the request options (`onBehalfOf`,
`requestId`) apply to each poll; `get`'s errors propagate (a 404 included). It is meant for
scripts, tests and back-office jobs: [fulfil orders on the webhook](#integration-recipes).

### Expire

End a session early (an order cancelled on your side). It answers its status (`expired`,
`expiresAt` the time you expired it), and `checkout.expired` follows. Once the customer paid or is paying it is a `ConflictError`
`tx_already_sent`.

<!-- docs:snippet checkout-expire -->
```ts
// The customer can no longer pay it, and checkout.expired follows. Once they paid or are paying,
// it is a ConflictError tx_already_sent.
const expired = await client.checkoutSessions.expire(sessionUuid);
console.log(`checkout ${expired.status}`); // expired
```
<!-- /docs:snippet -->

## Products and customers

Products are optional (a checkout can name an inline product) and give you a reusable catalog
with payment links. A subscription product carries its terms
(`subscription: { frequency: { value: 1, unit: DurationUnit.Months } }`). A member's key gives a
product terms (on `create` or `update`) only while the organization's `members.subscriptions`
policy allows it (`403 policy_disabled` otherwise); with the policy off, the links of the
member's subscription products open nothing.

<!-- docs:snippet products-create -->
```ts
const product = await client.products.create({
	name: 'T-shirt',
	description: 'Blue, size M',
	priceUsd: '4.99', // USD, a decimal string, never a float
	reference: 'tshirt-blue-m', // your own id: unique per space
});
console.log(`product ${product.uuid}, payment link ${product.paymentLink}`);
```
<!-- /docs:snippet -->

<!-- docs:snippet products-list -->
```ts
// iterate walks every page (list returns one); hidden products only with includeHidden.
for await (const product of client.products.iterate()) {
	console.log(`${product.reference}: ${product.name}, ${product.priceUsd} USD`);
}
```
<!-- /docs:snippet -->

`products.update` (`PATCH`) changes only the fields given. A new price applies to new checkouts
and subscribers only:

```ts
const updated = await client.products.update(product.uuid, {
	priceUsd: '5.99',
	isActive: false, // hidden from products.list
	description: '', // '' clears it
	metadata: { sku: 'TS-BLUE-M', legacy: '' }, // merged: '' deletes a key
});
console.log(updated.priceUsd, updated.metadata);
```

`products.get` and `delete` (`204`, resolves to `void`) complete the set.
`products.getByReference('tshirt-blue-m')` runs the list's reference filter
(`GET /products?reference=`, hidden products included) and returns its one product, or throws a
`NotFoundError` (status 404, code `not_found`) when there is none, exactly like an unknown UUID.
Deleting a product does not stop its subscriptions: cancel them with `subscriptions.cancel` if the
product is gone for good.

```ts
let customer = await client.customers.create({
	firstName: 'Ada',
	lastName: 'Lovelace',
	email: 'ada@example.com',
	reference: 'crm-42',
	metadata: { plan: 'pro' },
});

// '' clears lastName, phoneNumber or address; a field left out is unchanged.
customer = await client.customers.update(customer.uuid, { phoneNumber: '' });

// An email is not unique: several customers of a space may share one.
const page = await client.customers.list({ email: 'ada@example.com' });
console.log(`${page.items.length} customers with this email`);

const byReference = await client.customers.getByReference('crm-42'); // a NotFoundError when none
console.log(customer.uuid === byReference.uuid);
```

`customers.get`, `list` / `iterate` (by `email` or `reference`) and `delete` (`204`) complete the
set. A checkout given `customerUuid` or `customerReference` asks the customer
nothing (`customerReference` is kept on the payment, and links your customer with that reference
if there is one; none is created); without either, the checkout asks what your
`checkout.customerDetails` setting says (the full details by default).

**Without a QBitFlow customer, the buyer gets no receipt and no other customer email** (a
subscription's billing emails included): QBitFlow has no address for them. To have them, create
the customer with that reference and their email first
(`customers.create({ reference: 'crm-42', firstName: 'Ada', email: 'ada@example.com' })`). That
works even after the checkout was created, as long as it is before the payment is recorded.

## Payments and failures

A `Payment` exists once its transaction is confirmed, with its checkout session's `pay@…` id.

<!-- docs:snippet payments-list -->
```ts
const page = await client.payments.list({
	createdAfter: new Date(Date.now() - 30 * 24 * 3600 * 1000), // the last 30 days
	limit: 10,
});
for (const payment of page.items) {
	// Amounts are decimal strings: the token's (amount, in currency) and USD (amountUsd).
	const { uuid, reference, amount, currency, amountUsd } = payment;
	console.log(`${uuid} "${reference ?? ''}": ${amount} ${currency.symbol} (${amountUsd} USD)`);
}
if (page.hasMore) {
	// Pass it back, verbatim, as the cursor param for the next page.
	console.log(`next cursor: ${page.nextCursor}`);
}
```
<!-- /docs:snippet -->

<!-- docs:snippet payments-get -->
```ts
const payment = await client.payments.get(paymentUuid); // pay@…, the checkout session's id
console.log(payment.uuid, payment.reference, payment.amountUsd, 'USD', payment.metadata);

// Runs GET /payments?reference= and returns its one payment: a NotFoundError (404,
// not_found) until the customer paid.
const byReference = await client.payments.getByReference('order-1042');
console.log(`order-1042 was paid by ${byReference.from}`);
```
<!-- /docs:snippet -->

A payment carries its transaction (`txHash`, `explorerUrl`, `confirmedAt`), your `metadata`
(copied from its checkout, read-only), how it settled (`settlement`), and whether it can be
refunded (`refundable`, `refund`).

- **The amounts:** `amount` is what the customer paid **in the token's units** (`'10'` for 10 USDC,
  with `amountMinUnits` and the `currency` object), `amountUsd` the same in USD: `priceUsd` (the
  product's price at the checkout) plus every line of `fees` (the [checkout's fees](#fees), each a
  `FeeLine`: `type` `custom` or `processingFee`, `label`, `description`, `amountUsd`). It is what
  the contracts split; the network fee the customer paid on top is not in it (`paid`,
  `paidMinUnits` and `paidUsd` include it: a refund's base). Every amount is a decimal string
  ([Money display](#money-display)).
- **The settlement** (`settlement`): QBitFlow's `feePercent`, the `organizationFee` and
  `referralFee` when they apply, the `split` (`platform`, `organization`, `referral`, `merchant`,
  `networkFee`, each a `TokenAmount`: `amount`, `amountMinUnits`, `amountUsd`) and the
  `transaction` that paid it (`blockNumber`, `blockTime`, `gasUsed`, its `fee` in the native coin).
- **Filters** (`PaymentListParams`): `customerUuid`, `productUuid`, `createdAfter` / `createdBefore`
  (both excluded), `reference`, `refunded`, and, with an organization key acting for itself,
  `includeMembers` (every member's rows, each naming its `userUuid`) or `userUuid` (one member's).
  The last two exclude each other. `payments.getByReference` runs the `reference` filter and throws
  a `NotFoundError` (404, `not_found`) when no payment has it.
- **Reading a member's row** from the organization's space: `payments.get(id, { includeMembers:
  true })`, or `onBehalfOf` the member.
- **The transactions feed** of one-time payments and subscription bills, newest first:
  `transactions.list` / `iterate`, with the same filters plus `type` (`TransactionKind.Payment`,
  `TransactionKind.Bill`), `subscriptionUuid` and `refunded`. Each `Transaction` reads like its
  resource (a `Payment` or a `Bill`); open it with `payments.get` or `subscriptions.getBill`.

<!-- docs:snippet transactions-list -->
```ts
// One feed of one-time payments and subscription bills, newest first; each row reads like its
// resource. `type` filters it to one kind (TransactionKind.Payment or TransactionKind.Bill).
const feed = await client.transactions.list({ limit: 20 });
for (const tx of feed.items) {
	console.log(tx.type, tx.uuid, tx.amountUsd, 'USD');
}
```
<!-- /docs:snippet -->

- **Failures** are the failed attempts to pay a checkout or a bill. They never moved money and
  are not final: the customer can try again.

```ts
for await (const f of client.failures.iterate({ category: FailureCategory.InsufficientBalance })) {
	console.log(`${f.txUuid} attempt ${f.attempt}: ${f.code} (${f.attemptedUsd} USD)`);
}
```

## Subscriptions

A subscription exists once its customer signed its checkout: paid the first period, or started
the free trial. It keeps the checkout's `sub@…` id for life.

| `status` | Meaning |
|---|---|
| `trial` | In its free trial |
| `trialExpired` | The trial ended without the customer confirming it (`actionRequired` `confirmTrial`); cancelled 7 days later unless confirmed |
| `active` | Billed on its due dates |
| `pastDue` | A bill failed; retried for up to 7 days (`dunning` on reads), then cancelled |
| `paused` | Paused by its customer: not billed until resumed |
| `stopped` | Cancelled during its period: never billed again, `cancelled` at `nextBillingAt` |
| `cancelled` | Over (`cancellationReason` says why). Final |

**Access rule: grant access while `now < currentPeriodEnd`, whatever the status.** A `stopped` or
`paused` subscription has paid for its period; a `pastDue` one's period has ended.
`hasAccess(sub, at?)` (exported by `qbitflow`) applies it: see [Access control](#access-control).

`actionRequired` says what the customer must do (`topUpAllowance`, `raiseMaximum`,
`confirmTrial`; absent: nothing): point them to the subscription's `managementPageLink`.

A subscription's price is locked at signup: `priceUsd` plus its `fees` lines, every bill. Its
`allowance` (absent during a trial) is what the subscriber's wallet still lets QBitFlow bill
(`amount`, `amountMinUnits`, `amountUsd`), how many bills that covers (`remainingPeriods`) and the
most one bill may charge (`maxPerPeriod`). `lastBilledAt`, `nextBillingAt` and `cancellableAt` are
absent when they don't apply; `metadata` is your own data, copied from its checkout.

<!-- docs:snippet subscriptions-get -->
```ts
// Any status, cancelled included. Before its checkout completes, it is a 404.
const subscription = await client.subscriptions.get(subscriptionUuid);
console.log(`${subscription.uuid}: ${subscription.status}`);
console.log(`paid until ${subscription.currentPeriodEnd ?? '—'}`);
```
<!-- /docs:snippet -->

The past-due ones with their dunning, and every bill of one:

```ts
const page = await client.subscriptions.list({ status: SubscriptionStatus.PastDue });
for (const s of page.items) {
	if (s.dunning) console.log(s.uuid, s.dunning.remainingAttempts, 'attempts left');
}

// Every bill, newest first: the iterator fetches the pages lazily.
for await (const bill of client.subscriptions.iterateBills(subscriptionUuid)) {
	if (bill.periodEnd) console.log(`${bill.uuid}: ${bill.amountUsd} USD, paid until ${bill.periodEnd}`);
}
```

- `subscriptions.getByReference` reads one by your checkout's `reference` (the list's
  `?reference=` filter; a `NotFoundError` when none); `getBill` one bill (`sub-hist@…`). Bills
  carry no metadata: read the subscription's.
- `subscriptions.update` (`PATCH`) changes its `metadata` only, merged (a key set to `''` deletes
  it), and resolves to the subscription. It is never retried automatically:

<!-- docs:snippet subscriptions-update -->
```ts
// Metadata is merged into the subscription's: '' deletes a key, keys not named are kept. It
// is the only thing a merchant edits on a subscription; webhooks carry it.
const updated = await client.subscriptions.update(subscriptionUuid, {
	metadata: { plan: 'pro', coupon: '' },
});
console.log(updated.metadata.plan);
```
<!-- /docs:snippet -->

- Before its checkout completes, `subscriptions.get` is a 404: read the checkout session instead.
- With an organization key acting for itself, `subscriptions.get(uuid, { includeMembers: true })`
  and `subscriptions.getBill(billUuid, { includeMembers: true })` read a member's subscription or
  bill from the organization's space (or act `onBehalfOf` the member).

### Cancel

`cancel` cancels without the customer signing. By default it is immediate (`cancelled`, reason
`merchant`); `{ immediate: false }` stops it now and cancels it at the end of the period paid for.

<!-- docs:snippet subscriptions-cancel -->
```ts
// immediate: false stops it now (never billed again) and cancels it at the end of the period
// paid for. A ConflictError when it is already stopped or inactive.
const { subscription, pending } = await client.subscriptions.cancel(subscriptionUuid, {
	immediate: false,
});
if (pending) {
	// HTTP 202: the on-chain cancellation is still confirming. It goes on regardless:
	// subscription.statusChanged tells the end.
	console.log('cancellation confirming');
} else {
	console.log(`now ${subscription.status}`); // stopped
}
```
<!-- /docs:snippet -->

`cancel` answers 200 when done and 202 (`pending: true`) while confirming on-chain. A
`ConflictError` `subscription_already_stopped_or_inactive`, or a 404 once cancelled. A trial is
cancelled immediately only (`immediate: false`: a 400). It is never retried automatically.

### Test billing

In test mode a subscription is billed only when you ask, with live's statuses and webhooks.
`testBill` resolves once the attempt settled: a `TestBill` with the bill's `sub-hist@…` id
(`billUuid`), its `stage` and, once done, its `outcome` (a live subscription: a `BadRequestError`
`test_mode_only`; a bill not due: a `ConflictError` `payment_not_due`):

<!-- docs:snippet subscriptions-test-bill -->
```ts
// Test mode only: runs the next billing now, with live's statuses and webhooks. A ConflictError
// payment_not_due before nextBillingAt; a BadRequestError test_mode_only for a live one.
const bill = await client.subscriptions.testBill(subscriptionUuid);
// billUuid is sub-hist@…: the id its subscription.billed carries once paid.
console.log(bill.billUuid, bill.stage, bill.outcome ?? 'running', bill.failureCode ?? '');
```
<!-- /docs:snippet -->

Walk the timeline once in test mode: a 5-minute frequency, pay from a test wallet, trigger the
bill, then empty the wallet and trigger it again to see `subscription.billingFailed` and
`pastDue`.

## Refunds

<!-- docs:snippet refunds-list -->
```ts
// The active ones: pending, waiting for an answer (no status: every status).
const page = await client.refunds.list({ status: [RefundStatus.Pending] });
for (const refund of page.items) {
	const { uuid, txUuid, initiatedBy, reason, amount, currency } = refund;
	console.log(`${uuid} of ${txUuid} (${initiatedBy}): ${amount} ${currency.symbol}, ${reason}`);
}
```
<!-- /docs:snippet -->

`status` takes up to 5 statuses (left out: every status); `txUuid` finds the refund of one
transaction. From the organization's space the members' refunds are included by default:
`{ includeMembers: false }` leaves them out. The answered ones come page by page:

```ts
for await (const r of client.refunds.iterate({
	status: [RefundStatus.Approved, RefundStatus.Rejected],
})) {
	console.log(r.uuid, r.status, r.explorerUrl);
}
```

`refunds.get` reads one refund by its `refund@…` id:

<!-- docs:snippet refunds-get -->
```ts
const refund = await client.refunds.get(refundUuid); // refund@…
// pending (a customer's request), approved or rejected.
const { uuid, status, refundPercent, amount, currency } = refund;
console.log(`${uuid}: ${status}, ${refundPercent}% = ${amount} ${currency.symbol}`);
```
<!-- /docs:snippet -->

Refunds are read only here: there is no create. A refund is **requested by the customer** (the
refund page; you approve or reject it in the dashboard) or **sent by you from the dashboard**,
signed from the wallet that was paid. Yours exists only once its transfer confirmed: it is recorded
`approved`, and `refund.approved` (with `initiatedBy` `merchant`) is the first and only event about
it. `refund.requested` is always a customer's request.

`refundPercent` is a percent string (`'100'`: all of it) of everything the customer paid (`paid`,
network fee included); `amount` / `amountMinUnits` / `amountUsd` is what it sends back. There is
one refund per transaction, whatever it became: `payment.refundable` / `notRefundableReason` say
whether one would be accepted now.

A refund is `pending` (a customer's request waiting for your answer), `approved` or `rejected`
(both final). `initiatedBy` is `customer` or `merchant`.

## Marketplaces

A marketplace is an organization whose sellers are its **members**. You invite them, sell for
them with your organization key and `onBehalfOf`, take a commission on their payments, and may
hold their funds until you trust them. QBitFlow stays non-custodial: money goes from the customer's
wallet to the seller's (and your commission to yours) in one transaction.

**1. Invite the seller.** The SDK always invites members (`role: user`); the team is invited from
the dashboard. `holdFunds` is required (always sent); the commission is a percent string, `'0'` to
`'50'`, at most 2 decimals.

<!-- docs:snippet members-invite -->
```ts
const created = await client.invitations.create({
	email: 'seller@example.com',
	holdFunds: true, // hold their payments until you trust them (always sent)
	organizationFeePercent: '10', // your commission on their payments: '0' to '50' %
	redirectUrl: 'https://shop.example.com/sellers/welcome',
});
// The link is also emailed. They are a member once they accepted (the member.joined webhook).
console.log(`invitation ${created.uuid}: ${created.link}`);
```
<!-- /docs:snippet -->

The answer is a `CreatedInvitation`: the invitation's fields and its `link` (only here).
`sendEmail: false` creates the invitation without emailing it: share `link` in your own
onboarding (signing up through it still emails the person a confirmation). A `ConflictError`
`already_joined` for a member; a `RateLimitError` beyond 50 invitations an hour, emailed or not
(raised at once: the wait is over the SDK's 60 s retry cap).

**2. Wait for `member.joined`.** The seller exists once they accepted: store the event's
`userUuid` and match `invitationUuid` to your invitation. Never trust the redirect's
`?invitationUuid=` (anyone can open it).

```ts
if (event.type === 'member.joined') {
	console.log('invitation', event.data.invitationUuid, 'accepted by', event.data.userUuid);
}
```

**3. Sell for them.** The seller adds their receiving wallet in their QBitFlow dashboard (only
they can, not needed while you hold their funds). Check they can be paid:

```ts
const currencies = await client.wallets.listAcceptedCurrencies({ userUuid: memberUuid });
if (currencies.length === 0) {
	throw new Error('the seller cannot be paid yet: their checkouts would answer 409 merchant_not_ready');
}
```

Then act in their space with [`client.onBehalfOf(memberUuid)`](#on-behalf-of-acting-in-a-members-space):
`seller.checkoutSessions.createPayment(…)` opens a checkout that pays them (a
`PermissionDeniedError` `policy_disabled` when your policies don't let members do this).

While you hold a seller's funds (`Member.trustedAt` absent), they sell **one-time payments only**:
a subscription checkout in their space answers a `ConflictError` `merchant_not_ready` with
`details.reason` `fundsHeld` (`MerchantNotReadyReason.FundsHeld`) until you trust them
(`members.trust`), and their subscription products' links open nothing.

**4. Hear of every sale.** An organization webhook endpoint receives every seller's events by
default; the event's `userUuid` names the seller. Use it as `onBehalfOf` for follow-up reads.

**5. Commission and held funds.** Each payment records your fee in `settlement.organizationFee`
and `settlement.split.organization`. While you hold a seller's funds (`holdFunds` true,
`Member.trustedAt` absent), their payments go to your wallet and the net is owed to them
(`HeldFunds.totalUsd`, each `LedgerEntry` with what it counts for: `owed`, `owedMinUnits`,
`owedUsd`, negative on a refund line):

<!-- docs:snippet members-held-funds -->
```ts
// What the organization holds for its members (their payments while untrusted), the longest
// held first.
const all = await client.members.listHeldFunds();
for (const owed of all) {
	console.log(`${owed.userUuid}: ${owed.totalUsd} USD owed over ${owed.count} lines`);
}

const held = await client.members.getHeldFunds(memberUuid);
for (const ledger of held.ledgers) {
	// owed: what the line counts for in a release (negative for a refund).
	console.log(
		`  ${ledger.type} ${ledger.owed} ${ledger.currency.symbol} (${ledger.owedUsd} USD)`
	);
}
console.log(`held for this member: ${held.totalUsd} USD`);
```
<!-- /docs:snippet -->

Trust them, and their new payments go to their own wallets. What is held stays held until you
release it from the dashboard (`heldFunds.released` tells you):

<!-- docs:snippet members-trust -->
```ts
// Their new payments go to their own wallets directly. What is already held stays held
// until you release it from the dashboard (heldFunds.released tells you).
const trusted = await client.members.trust(memberUuid);
console.log(`trusted since ${trusted.trustedAt}`);
```
<!-- /docs:snippet -->

Change the commission (a checkout already created keeps its fee):

<!-- docs:snippet members-update -->
```ts
// A percent string ('0' to '50'). Applies to their new checkouts: one already created keeps
// its fee.
const updated = await client.members.update(memberUuid, { organizationFeePercent: '10' });
console.log(`fee now ${updated.organizationFeePercent} %`);
```
<!-- /docs:snippet -->

- `members.list` / `iterate` / `get` (`firstName`, `lastName`, `organizationFeePercent`, the
  `acceptedCurrencies` their checkouts take now), `members.listHeldFunds` (every member owed, the
  longest held first, an array), and `seller.members.getOwnHeldFunds()` (the seller's side)
  complete the reads.
- `members.remove` ends a seller's membership in the key's mode: their keys stop working and their
  checkouts close (`204`). It is a `409 held_funds_pending` while you hold their live funds:
  release them first.
- `invitations.list` / `iterate` (by `status`; member invitations only, the team's being managed
  from the dashboard) and `invitations.revoke` (`204`, resolves to `void`) manage the invitations.
- A seller who already uses QBitFlow joins with the same account: accepting while it belongs to
  another organization succeeds like any acceptance (it keeps its other memberships, and
  `member.joined` comes as usual). Test-mode sellers are real accounts that accept from a real
  inbox.

## Wallets

Wallets are added and removed in the dashboard, by their owner only. The SDK reads them; every
wallet list is short and returned as an array.

```ts
const wallets = await client.wallets.list({ withBalances: true });
for (const w of wallets) {
	console.log(w.currency.chain, w.address);
	for (const tw of w.tokenWallets) {
		// balance is absent when the chain couldn't be read
		if (tw.balance) console.log(`  ${tw.currency.code}: ${tw.balance.amount} (${tw.balance.amountUsd ?? '?'} USD)`);
	}
}
```

`wallets.listForMember(userUuid)` reads a member's wallets (organization key), and
`wallets.listAcceptedCurrencies` the currencies a space's checkouts accept now (`userUuid`: a
member's, organization key): none means its checkouts answer `409 merchant_not_ready`.

## Accounting export

Every payment, bill, refund and fee between two dates (`YYYY-MM-DD`, both included), as JSON rows
(`accounting.exportJson(from, to)`) or as CSV text (`exportCsv`). The SDK checks the dates and
`from <= to` before sending. **The API allows at most 92 days per export, both days included**
(a `ValidationError` `validation_failed` on `to` beyond, `details.max` 92): `exportJsonRange(from,
to)` and `exportCsvRange(from, to)` take any range, split it into consecutive windows of at most 92
days (`[from, from + 91 d]`, the next one starting the day after, on calendar dates in UTC), request
them in order and concatenate the result (one list; for CSV the header line once, then every
window's rows, line endings as sent): see [the yearly export](#a-yearly-accounting-export). A range
of 92 days or less is one request; `2026-01-01` to `2026-12-31` is four: `[01-01, 04-02]`,
`[04-03, 07-03]`, `[07-04, 10-03]`, `[10-04, 12-31]`. Rows are typed `payment`, `bill`, `refund`,
`organizationFee` or `referralFee`; a value a row doesn't have (a fee that doesn't apply) is
absent, never `'0'`.

- **Dates** are the transactions' (the day their block was mined, in UTC: `txTimeUtc`), so
  consecutive exports never miss nor repeat an event. Rows are ordered by `txTimeUtc`, `type`,
  then `txUuid`; a refund names what it refunds in `relatedTxUuid` and `relatedReference`.
- **Amounts** are in the currency's units (`'7.5'` USDC, not `'7500000'`), as decimal strings,
  next to `currencyDecimals`, each with its on-chain twin (`grossAmountMinUnits`, …). USD amounts
  (`grossAmountUsd`, …) and rates (`platformFeePercent`, …) are decimal strings too. `currency` names what was paid as markets do (`USDC`, or the
  chain's native currency: `ETH`, `SOL`), and `currencyPriceUsd` is the USD price the amounts
  were converted at. `grossAmount = platformFee + organizationFee + netAmount` exactly; a
  refund's net is the refunded amount, negative.
- **Network fees are never part of the net.** `networkFeesPaidBy` (`NetworkFeesPayer`) says whose
  wallet paid them: `payer` (a payment or a bill: on top of the amount, in its currency),
  `merchant` (a refund your space sent) or `organization` (a refund of a payment the organization
  held for its member). Book `networkFees` (in `networkFeesCurrency`, the chain's native currency
  on a refund) apart for `merchant` and `organization`.
- **CSV columns** are `AccountingEvent`'s JSON keys in its field order (what happened, the USD
  amounts, the same amounts in the currency, the network fees, the rates, the on-chain proof, the
  ids): read them by header name, not position. Amounts are plain numbers there, an absent value
  an empty cell, and a cell starting with `=`, `+`, `-`, `@`, a tab or a CR gets a leading `'`.
- A `referralFee` row only has what the referrer earned (its type, time, chain, block, currency
  and the referral fee): every other field is absent.

## Webhooks

QBitFlow posts an **event** to your endpoints when something happens: a payment confirmed, a
subscription billed, a member joined.

### 1. Create an endpoint and store its secret

<!-- docs:snippet webhook-endpoint-create -->
```ts
const endpoint = await client.webhooks.endpoints.create({
	url: 'https://shop.example.com/webhooks/qbitflow',
	// Left out: every type, including the ones added later.
	events: [
		EventType.PaymentCompleted,
		EventType.CheckoutExpired,
		EventType.SubscriptionStatusChanged,
	],
	description: 'Order fulfilment',
});
// The whsec_… signing secret is returned only this once: store it now.
await storeSecret('QBITFLOW_WEBHOOK_SECRET', endpoint.secret);
console.log(`endpoint ${endpoint.uuid} created`);
```
<!-- /docs:snippet -->

Up to 10 endpoints per space and mode; live endpoints need `https` and a public host. An
organization endpoint also receives its members' events unless created with
`includeMembers: false`. `endpoints.list` / `iterate` (paginated), `get`, `update` (`PATCH`:
`{ enabled: false }` pauses it, `{ enabled: true }` enables it again, `{ description: '' }` clears
it, `{ events: [] }` receives every type) and `delete` (`204`) manage them. An endpoint's secret is
shown and rotated in the dashboard only. A replay of the create's `Idempotency-Key` within 24 hours
returns the same endpoint and secret.

### 2. Handle the deliveries with the router

A router is built with the endpoint's secret (`webhooks` is usable without a client: a receiver
needs only the secret; `client.webhooks.router(secret)` is the same). Register a handler per event
type with `on(type, (data, event) => …)`: `data` is typed to the type's model. `onUnknown(event =>
…)` runs for the types newer than this SDK, `onAny(event => …)` for every event, after the type's
handlers. Handlers may be async: they are awaited one after the other. Each method returns the
router.

```ts
import { hasAccess, webhooks } from 'qbitflow';

const processed = new Set<string>(); // stands for your database: deliveries are at least once

const router = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!, {
		// Every 400 (event null) and 500: the adapters answer without the details.
		onError: (event, err) => console.error(`webhook ${event?.id ?? '(unparsed)'}:`, err.message),
	})
	.on('payment.completed', async (payment, event) => {
		if (processed.has(event.id)) return; // a retry of an event already handled
		console.log(`fulfil order "${payment.reference ?? ''}": ${payment.amountUsd} USD`, payment.metadata);
		processed.add(event.id);
	})
	.on('checkout.expired', (session) => {
		if (!webhooks.isSubscriptionSession(session)) console.log('release order', session.reference);
	})
	.on('subscription.statusChanged', (sub) => {
		console.log(`${sub.uuid}: ${sub.previousStatus} -> ${sub.status}, access: ${hasAccess(sub)}`);
	})
	.onUnknown((event) => console.log('a type newer than this SDK:', String(event.type)))
	.onAny((event) => console.log('received', event.id, event.type));
```

Serve it with the adapter of your framework ([recipes](#a-webhook-endpoint-in-your-framework)), or
call `handle` yourself:

| | For |
|---|---|
| `router.fetchHandler()` | `(request: Request) => Promise<Response>`: Next.js route handlers, Hono (`c.req.raw`), Bun, Deno, Cloudflare Workers |
| `router.nodeHandler()` | `(req, res) => Promise<void>`: `node:http`, Express (with `express.raw({ type: 'application/json' })`, or no body parser, on the route). It reads the raw body, or uses `req.body` when it is a `Buffer` or a string |
| `await router.handle(rawBody, signatureHeader)` | anything else: returns `{ status, event, error }`; answer `status` |

| The delivery | `status` | Adapters' JSON body |
|---|---|---|
| handled, or no handler for its type (unknown types included) | 200 | `{"received":true}` |
| bad, missing or stale signature (`error`: a `WebhookSignatureError`); no handler runs | 400 | `{"error":"invalid signature"}` |
| not a v2 event (`error`: a `ValidationError`); no handler runs | 400 | `{"error":"invalid event"}` |
| a handler threw or rejected (`error`: its error); the remaining handlers are skipped, QBitFlow retries | 500 | `{"error":"internal error"}` |
| not a `POST` (adapters) | 405 | `{"error":"method not allowed"}` |
| a body above 1 MiB, read or declared by `Content-Length` (adapters) | 413 | `{"error":"body too large"}` |
| the body cannot be read (adapters) | 400 | `{"error":"cannot read the body"}` |
| `req.body` already parsed into an object, e.g. by `express.json()` (`nodeHandler`) | 500 | a message saying to use `express.raw` |

The adapters read `QBitFlow-Signature` whatever its case, and never echo the secret or an error's
details: log them with `onError`, called for every 400 and 500 (with `event` `null` when the body
could not be parsed), not for 405 and 413. The router's options are `tolerance` (seconds, default 300),
`now` (tests) and `onError`. When `nodeHandler` answers 413 while the body is still arriving, it
discards the rest so that the sender reads the answer: at most 4 MiB more, within 10 seconds,
beyond which it drops the connection.

**Test your handlers** with `webhooks.sign(rawBody, secret, timestamp?)`, which returns the header
QBitFlow would send (`t=<unix seconds>,v1=<hex>`):

```ts
const body = JSON.stringify({
	id: 'evt_test_1',
	type: 'payment.completed',
	version: 'v2', // every delivery is a v2 event
	createdAt: new Date().toISOString(),
	test: true,
	data: { uuid: 'pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f', reference: 'order-1', amountUsd: '4.99' },
});
const result = await router.handle(body, webhooks.sign(body, secret));
console.log(result.status, result.event?.type); // 200 payment.completed
```

### Lower level: `verify`, `constructEvent`, `parseEvent`

The router is built on these. `webhooks.constructEvent(rawBody, signatureHeader, secret, options?)`
verifies the `QBitFlow-Signature` header over the **raw body** (the bytes as received: never
`JSON.parse` and re-serialize them) and parses it; checking `event.type` (an `if` or a `switch`)
then narrows `event.data`:

<!-- docs:snippet webhook-verify -->
```ts
const secret = process.env.QBITFLOW_WEBHOOK_SECRET!;
try {
	// rawBody: the body exactly as received; signatureHeader: its QBitFlow-Signature header.
	const event = webhooks.constructEvent(rawBody, signatureHeader, secret);
	if (event.type === 'payment.completed') {
		console.log(`fulfil order ${event.data.reference}`); // event.data is a PaymentCompleted
	}
	return 200; // acknowledge every event, the types you ignore included
} catch (err) {
	if (err instanceof WebhookSignatureError) {
		console.log(`rejected: ${err.reason}`); // e.g. noMatchingSignature
		return 400;
	}
	if (err instanceof ValidationError) {
		console.log(`not a v2 event: ${err.message}`);
		return 400;
	}
	throw err;
}
```
<!-- /docs:snippet -->

`webhooks.verify(rawBody, signatureHeader, secret, options?)` only verifies (it returns nothing, or
throws a `WebhookSignatureError`), and `webhooks.parseEvent(rawBody)` only parses: use it on a body
already verified. `rawBody` is a `string`, a `Buffer` or a `Uint8Array`; the header may be a
string, Node's `string[]` or `undefined` (a `missingHeader` failure). With these, your code answers
QBitFlow itself: 2xx for every event it accepts, the ignored types included.

- **At least once.** The same event can arrive more than once: **deduplicate on `event.id`** (also
  in the `QBitFlow-Event-Id` header, `webhooks.EVENT_ID_HEADER`) and make the handler idempotent.
  `QBitFlow-Event-Type` (`webhooks.EVENT_TYPE_HEADER`) carries the type, for routing before parsing.
- **Answer 2xx fast**, within 30 seconds, **including to the types you ignore** (the router does):
  anything else is retried (for 3 days in live mode), and an endpoint failing for 3 days is
  disabled. Keep handlers short: store the event, answer, then process it in the background.
- **Order is per publication, never per subscription.** The events published together (a
  `subscription.created` and its first `subscription.billed`) reach an endpoint in that order,
  each once the previous one is delivered or abandoned; meanwhile the event log shows the waiting
  one `pending` with `waitingFor` the earlier event ([The event log](#the-event-log)). Nothing
  waits across publications: a renewal's `subscription.billed` never waits for an earlier event
  your endpoint is failing. Order those by `createdAt` and the resources' own timestamps.
- **Secret rotation** needs nothing on your side: for 24 hours after a rotation the header carries
  two `v1=` signatures, the new secret's and the previous one's, and either secret verifies. Switch
  your secret within the day.
- **Timestamps** more than 5 minutes from your clock are refused (replays): `{ tolerance }` (in
  seconds) changes it, `{ now }` (a `Date`, or a function returning one) sets the clock in tests.
- **Members' events** carry the member in `event.userUuid`: read their resources with
  `client.onBehalfOf(event.userUuid)`.
- **No fixed source IPs**: verify the signature, never allow-list addresses.
- **v2 only.** Every endpoint receives v2 events; a body that is not one is refused by
  `parseEvent` (a `ValidationError`).
- **Headers:** `QBitFlow-Signature`, `QBitFlow-Event-Id` and `QBitFlow-Event-Type`
  (`webhooks.SIGNATURE_HEADER`, `EVENT_ID_HEADER`, `EVENT_TYPE_HEADER`).
- Not holding the secret? `await client.webhooks.verifyRemote(endpointUuid, rawBody, header)` has
  the API check it (a `WebhookSignatureError` with reason `invalidSignature` when it does not
  match), then `webhooks.parseEvent` parses the body.

`Event` is a discriminated union on `type`: the router's `on(type, …)` hands each handler its
type's `data`, and a `switch` or an `if` on `event.type` narrows `event.data` the same way. A type this SDK does not know yet arrives as an
`UnknownEvent` (its `data` is `unknown`) and lands in the `default` branch:
`webhooks.isUnknownEvent(event)` tells it, and `String(event.type)` reads its type (typed `never`
so that it does not get in the way of the narrowing). `webhooks.isEventType(event, type)` narrows
like a comparison, and `webhooks.eventData(event, type)` returns the typed data (a
`ValidationError` for another type).

| `event.type` | `event.data` |
|---|---|
| `payment.completed` | the `Payment` + `managementPageLink` |
| `subscription.created` | the `Subscription` (`active` or `trial`, its `managementPageLink` included) |
| `subscription.billed` | `{ bill, subscription }`: the `Bill` paid (until `bill.periodEnd`) and the `Subscription` as it leaves it (`subscription.status`, `.reference`, `.metadata`) |
| `subscription.statusChanged` | the `Subscription` + `previousStatus` |
| `subscription.actionRequiredChanged` | the `Subscription` + `previousActionRequired` |
| `subscription.billingFailed` | the `Subscription` + `reason`, `billUuid`, `amountUsd` (a string), `attempt`, `remainingAttempts`, `nextAttemptAt` |
| `subscription.upcomingBill` | the `Subscription` + `billingAt`, `amountUsd` (a string), `trialEnding`, `balanceSufficient`, `allowanceSufficient` |
| `refund.requested` / `.approved` / `.rejected` | the `Refund` (`refund.approved` and `refund.rejected` were `refund.completed` and `refund.denied`) |
| `member.joined` | the `Member` + `invitationUuid` |
| `member.removed` | the `Member` |
| `heldFunds.released` | the transfer paid to the member (`amount`, `amountUsd`, `settlement.transaction`) + the `ledgers` it settled |
| `checkout.expired` | the session: `PaymentSessionData`, or `SubscriptionSessionData` (`webhooks.isSubscriptionSession`) |
| `webhook.test` | `endpointUuid`, `message` (the dashboard's test) |
| any other | `unknown` (the raw JSON value) |

Webhook data never carries what only API reads return (`customer`,
`refund`/`refundable`/`notRefundableReason`, a subscription's `dunning`, a refund's `approval`,
`customerUuid` and `productName`); it carries your `metadata` and the `settlement`.

### The event log

Every event of the space, newest first, each exactly as it was delivered (kept at least 90 days;
`webhooks.events.iterate` walks every page). `type` is sent as is, not checked against this SDK's
types (newer ones appear), and the cursor is opaque (never an event id):

<!-- docs:snippet events-list -->
```ts
// Newest first, each exactly as delivered; one page (iterate walks them all).
const page = await client.webhooks.events.list({ type: EventType.PaymentCompleted, limit: 10 });
for (const event of page.items) {
	console.log(`${event.id} ${event.type} at ${event.createdAt}`);
}
if (page.hasMore) {
	console.log(`more: pass ${page.nextCursor} as cursor`); // opaque, never an event id
}
```
<!-- /docs:snippet -->

`events.get(id)` returns one event with its deliveries:

```ts
const detail = await client.webhooks.events.get(eventId); // evt_…
for (const d of detail.deliveries) {
	if (d.delivered) console.log(d.url, `delivered after ${d.attempts.length} attempts`);
	else if (d.nextAttemptAt) console.log(d.url, `failed, retried at ${d.nextAttemptAt}`);
	else if (d.waitingFor) console.log(d.url, `queued behind ${d.waitingFor}`); // no attempt yet
	else if (d.pending) console.log(d.url, 'about to start'); // no attempt yet
	else console.log(d.url, `not delivered, gave up after ${d.attempts.length} attempts`);
}
```

`pending` is true while QBitFlow still attempts the event on its own: `nextAttemptAt` is set while
it is retried after a failed attempt, `waitingFor` (an `evt_…`) while it is queued behind an earlier
event of the same publication, and neither while its delivery is about to start (within a minute).
**A queued or starting delivery has no `attempts` yet**: check `d.attempts.length` before reading
the last one. Once `pending` is false nothing more happens on its own, and `delivered: false` means
it was abandoned after its retries (3 days in live mode, 3 hours in test mode) or the endpoint was
disabled or deleted. If QBitFlow can't read a delivery's progress at that moment, `pending` comes
from the attempts: true while the retry schedule still attempts the event again (a delivery being
retried never reads as abandoned), without `nextAttemptAt`; a delivery queued with no attempt yet
isn't listed until its progress can be read: read the event again a moment later.

## Currencies

<!-- docs:snippet currencies-list -->
```ts
// A public route limited to 60 requests a minute per IP: cache the list at start-up. One bounded
// list (an array): the live currencies; test: true, the test networks'; main: true, the chains'
// native coins only.
const currencies = await client.currencies.list();
for (const { id, code, name, chain, decimals } of currencies) {
	console.log(`${id}: ${code} (${name} on ${chain}), ${decimals} decimals`);
}
```
<!-- /docs:snippet -->

`currencies.list` returns the catalog as an array (`{ test: true }`: the test networks'
currencies; `{ main: true }`: only the chains' native coins), and `get` one by id (a token's
`mainCurrencyId`). A `Currency` has its `code` (what requests name it by: `BASE:USDC`, or `ETH` for
a native coin), `symbol`, `name`, `chain`, `decimals`, and `address` (absent on a native coin).
These routes are public and **limited to 60 requests a minute per IP: cache the list** at start-up
instead of reading it per request. Every response that names a currency carries this object
(`payment.currency`, `member.acceptedCurrencies`, …).

## Pagination and iterators

Paginated lists return a `Page<T>`: `items`, `hasMore` (another page follows), and `nextCursor`
(present iff `hasMore`: the value to pass back as the params' `cursor`, verbatim; it is opaque,
never an id to build or parse, at most 200 characters).

<!-- docs:snippet customers-list -->
```ts
const page = await client.customers.list({ limit: 10 });
for (const customer of page.items) {
	console.log(`${customer.uuid} ${customer.email}`);
}
if (page.hasMore) {
	// Pass it back, verbatim, as the cursor param for the next page.
	console.log(`next cursor: ${page.nextCursor}`);
}
```
<!-- /docs:snippet -->

To walk the pages yourself, pass `page.nextCursor` back as `cursor` and list again while
`page.hasMore`. Each paginated list has an `iterate…` twin returning an `AsyncIterableIterator<T>`:
it fetches one page at a time, only as you consume it, keeps your filters and page size, and stops
when you `break`, after the page whose `hasMore` is `false` (a full last page answers `false`:
there is never an extra empty request), or defensively on a page that claims more without a new
`nextCursor` or with no items. An error is thrown from the `for await` loop and ends it.

<!-- docs:snippet pagination-iterate -->
```ts
// Every payment of the last 30 days: the iterator fetches the pages one at a time, as the loop
// consumes them, and stops when you break (or after the page whose hasMore is false).
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
let count = 0;
for await (const payment of client.payments.iterate({ createdAfter: since, limit: 50 })) {
	count++;
	console.log(payment.uuid, payment.amountUsd, 'USD');
}
console.log(`${count} payments over the last 30 days`);
```
<!-- /docs:snippet -->

| Method | Iterator | Page size: default / max |
|---|---|---|
| `products.list`, `customers.list` | `iterate` | 20 / 100 |
| `payments.list`, `transactions.list`, `failures.list` | `iterate` | 20 / 100 |
| `subscriptions.list`, `subscriptions.listBills` | `iterate`, `iterateBills` | 20 / 100 |
| `refunds.list` | `iterate` | 20 / 100 |
| `members.list`, `invitations.list` | `iterate` | 20 / 100 |
| `webhooks.endpoints.list`, `webhooks.events.list` | `iterate` | 20 / 100 |

`limit` is clamped by the API (0 or less: 20; above 100: 100). The bounded lists answer one page
and return its items as a plain array: `currencies.list`, `wallets.list`, `wallets.listForMember`,
`wallets.listAcceptedCurrencies`, `members.listHeldFunds` and `accounting.exportJson` (should one
ever claim more, the SDK follows its `nextCursor`, so it is never cut short silently).

## Errors

Every error the SDK throws is a `QBitFlowError`; each class below extends `ApiError`, which
extends `QBitFlowError`. Match them with `instanceof` (it works across the CommonJS and ES module
builds, even with two copies of the package installed):

| Class | When | Codes and properties worth knowing |
|---|---|---|
| `ValidationError` | 400 `validation_failed`, or input the SDK refused **before sending** (`status` `undefined`) | `fieldErrors`: each failing input by its wire name, dotted when nested (`frequency.unit`) |
| `BadRequestError` | any other 400 | `foreign_key_violation` (`details.field`), `test_mode_only`, `sender_is_receiver` |
| `AuthenticationError` | 401 | a missing, unknown, expired or revoked key (a removed member's keys too) |
| `PermissionDeniedError` | 403 | `forbidden` (no details): the key's role may not do it (an admin method with a member's key or `onBehalfOf`), or the resource is another's. `policy_disabled`: a member's key doing what its organization's policy doesn't allow; `details.policy` names the policy, and `details.field` the request field it governs (a checkout's `successUrl` / `cancelUrl` under `members.checkoutRedirects`) |
| `NotFoundError` | 404 | unknown, deleted, or outside the request's space; also a `getByReference` that found nothing (code `not_found`, the list's `requestId`) |
| `ConflictError` | 409 | `unique_violation` (`details.field`), `tx_already_sent`, `merchant_not_ready` (`details.reason`), `held_funds_pending`, `already_joined`, `payment_not_due`, `subscription_already_stopped_or_inactive`, `idempotency_key_in_use`, `conflict` |
| `GoneError` | 410 | `merchant_closed`: a removed member's or a closed organization's space |
| `IdempotencyError` | 422 `idempotency_key_reused` | an `Idempotency-Key` reused for another request: a bug, never retried |
| `RateLimitError` | 429 | `retryAfter` (seconds), `limit`, `periodSeconds` |
| `ServerError` | 5xx (503 `network_unavailable`, 504 `timeout`), an unexpected 3xx (redirects are never followed), a 2xx whose body is not the expected JSON | |
| `NetworkError` | no response: DNS, connection, TLS, timeout, an aborted `signal` | `cause`: the underlying error or the signal's reason |
| `WebhookSignatureError` | a webhook signature refused, locally or by `verifyRemote` | `reason`: `missingHeader`, `malformedHeader`, `timestampOutsideTolerance`, `noMatchingSignature`, `invalidSignature` |
| `ApiError` | any other HTTP error (e.g. 413 `request_too_large`, 405 `method_not_allowed`) | |

Every `ApiError` carries `status` (`undefined` when no response was received), `code` (branch on
it, never on the message; `''` when absent), `rawMessage` (the API's own message), `details`
(never `null`, and raw: money in it is a string, `details.max === '5'`, but the accounting window's
`max` is the number 92), `requestId` (quote it to support), `fieldErrors`, `rawBody` (the error response as
received, `''` without one) and `cause`. Its `message` reads
`"<message> (status <status>, code <code>, request <requestId>)"`, followed by
`"; <field>: <message>"` for each field error, and its `name` is the class name.

<!-- docs:snippet errors-handling -->
```ts
try {
	const payment = await client.payments.getByReference('order-1042');
	console.log(`order-1042 paid: ${payment.amountUsd} USD`);
} catch (err) {
	if (err instanceof NotFoundError) {
		console.log('no payment for order-1042 yet');
	} else if (err instanceof ValidationError) {
		// Refused before sending (status undefined) or by the API (400).
		for (const f of err.fieldErrors) console.log(`${f.field}: ${f.message}`);
	} else if (err instanceof ApiError) {
		// Branch on status and code, never on the message. Quote requestId to support.
		console.log(`QBitFlow error ${err.status} ${err.code} (request ${err.requestId})`);
		if (isRetryable(err)) console.log('transient: try again later');
	} else {
		throw err;
	}
}
```
<!-- /docs:snippet -->

**Client-side validation** runs before every request: names and texts (lengths in characters, no
markup characters), references (`A-Z a-z 0-9 . _ : @ -`, 1 to 100, never `.` or `..` alone, on
creates, `productReference`, `customerReference`, the `reference` filters and `getByReference`), emails (the customers' `email` filter too), phone
numbers, absolute `http(s)` URLs, USD amounts (decimal strings with at most 2 decimals, above 0, at
most 1,000,000), percents (decimal strings, at most 2 decimals: `organizationFeePercent` 0 to 50),
metadata (keys, values, at most 50 keys), durations (a frequency between 1 unit and 1 year), UUIDs
and transaction ids, dates, cursors (at most 200 characters), the
checkout's product choice, the enum filters (refund `status`, transaction `type`, failure `kind`
and `category`, invitation `status`), and exclusive filters. A failure is a `ValidationError` with
`status` `undefined`, `code` `''`, its message `validation failed` followed by the field list, and
nothing is sent. What depends on the key's mode or on stored data is left to the API: the `'5'` USD
test-mode cap, `https`-only live URLs, the live subscription minimum (`'0.25'`), the frequency
minimum (1 hour live, 5 minutes test), the 92-day export window, the 50-key cap on merged metadata,
uniqueness.

## Retries and idempotency

| | |
|---|---|
| Retried methods | every read (GET), and the 6 creates: `checkoutSessions.createPayment`, `checkoutSessions.createSubscription`, `products.create`, `customers.create`, `webhooks.endpoints.create`, `invitations.create` |
| Never retried | every other write: updates (`subscriptions.update` included), deletes, `checkoutSessions.expire`, `subscriptions.cancel`, `subscriptions.testBill`, `members.trust`, `members.remove`, `invitations.revoke`, `webhooks.verifyRemote`; a 429 on them is thrown, not retried |
| Retried on | a network error or timeout, a 5xx, a 429, a 409 `idempotency_key_in_use` |
| Not retried on | any other 4xx (422 `idempotency_key_reused` included), a 3xx, an unusable response |
| Attempts | 3 retries by default (`maxRetries`; `0` disables them) |
| Back-off | 1 s, 2 s, 4 s…; a 429 waits for its `Retry-After` if longer. A wait above 60 s is not made: the `RateLimitError` is thrown at once |

`isRetryable(err)` says whether an error is of a transient kind. `timeout` bounds each attempt;
pass a `signal` to bound or cancel the whole call, retries and waits included (an abort is a
`NetworkError` whose `cause` is the signal's reason):

```ts
try {
	const page = await client.payments.list({ limit: 50 }, { signal: AbortSignal.timeout(20_000) });
	console.log(page.items.length);
} catch (err) {
	if (!isRetryable(err)) throw err;
	console.log('QBitFlow is unreachable for now: try again later'); // the SDK's retries are spent
}
```

**Idempotency keys.** Each call of a create sends a fresh `Idempotency-Key` (a UUID v4) and reuses it
on every retry of that call: a create retried after a timeout answers the first result instead of
opening a second checkout. To retry **across processes** (a queue re-running a job after a crash),
pass your own stable key, derived from the order:

<!-- docs:snippet retries-idempotency -->
```ts
// Reads and the 6 creates are retried on network errors, 5xx and 429, waiting 1 s, 2 s, 4 s…
// (default: 3 retries; 0 turns them off). timeout bounds each attempt, in milliseconds.
const client = QBitFlow.fromEnv({ maxRetries: 5, timeout: 15_000 });

// Each create sends an Idempotency-Key, the same on its retries. A key derived from the order
// also covers a job re-run after a crash: the same key returns the first session instead of
// opening a second one.
const orderId = 'order-1042';
const session = await client.checkoutSessions.createPayment(
	{ productName: 'T-shirt', description: 'Blue, size M', priceUsd: '4.99', reference: orderId },
	{ idempotencyKey: `checkout-${orderId}` }
);
console.log(`Redirect the customer to ${session.link}`);
```
<!-- /docs:snippet -->

Reusing a key with other params is an `IdempotencyError` (422 `idempotency_key_reused`): a bug,
never retried. A key is 1 to 255 printable ASCII characters without spaces, and only successful answers are kept
(24 hours): after a 4xx, the same key runs the request again. A `409 idempotency_key_in_use` (the
first request still running) is retried automatically. Other methods ignore the option. Retry
the other writes yourself only after reading the resource's state (a 504 may have done the work).

## Configuration

```ts
const client = new QBitFlow({
	apiKey: process.env.QBITFLOW_API_KEY ?? '',
	timeout: 10_000, // ms, per attempt
	maxRetries: 5,
	// Any fetch-compatible function: a proxy agent, tracing, a test double. Never log the headers:
	// they carry the API key.
	fetch: (url, init) => {
		console.debug(init.method, url);
		return fetch(url, init);
	},
});
console.log(client.webhooks !== undefined);
```

`new QBitFlow(apiKey)`, `new QBitFlow(apiKey, options)` and `new QBitFlow({ apiKey, ...options })`
are equivalent. `QBitFlow.fromEnv(config?)` reads `QBITFLOW_API_KEY` (required: a `ValidationError`
naming it), `QBITFLOW_BASE_URL` and `QBITFLOW_ON_BEHALF_OF` (values are trimmed; a blank variable counts as unset);
`config` overrides them and adds the other options.

| Client option | Default | |
|---|---|---|
| `baseUrl` | `https://api.qbitflow.app/v2` (`DEFAULT_BASE_URL`) | an absolute `http(s)` URL, without credentials, query or fragment; a trailing `/` is stripped |
| `timeout` | `30000` ms (`DEFAULT_TIMEOUT`) | per attempt, in milliseconds, through the last byte of the answer's body; positive |
| `maxRetries` | `3` (`DEFAULT_MAX_RETRIES`) | `0` disables retries; a negative or fractional value is refused |
| `onBehalfOf` | none | every request acts in that member's space (a member's `userUuid`) |
| `fetch` | the global `fetch` | `(url, init) => Promise<{ status, headers.get(), text() }>`; called with `redirect: 'manual'` and a `signal`: an injected `fetch` must not follow redirects either (the `X-API-Key` header would go to the redirect's host) |

| Request option (any method, last argument) | |
|---|---|
| `onBehalfOf` | acts in that member's space for this call; `''` forces the organization's (no header) |
| `idempotencyKey` | the 6 creates only: your own `Idempotency-Key` |
| `requestId` | sends `X-Request-Id` (1 to 128 of `A-Z a-z 0-9 - _ . :`) |
| `signal` | an `AbortSignal` cancelling the call, its retries and its waits |

| Webhook option (`webhooks.verify`, `webhooks.constructEvent`, `webhooks.router`) | Default |
|---|---|
| `tolerance` | 300 seconds (`webhooks.DEFAULT_TOLERANCE`); `0` or less keeps the default |
| `now` | the current time: a `Date`, or a function returning one |
| `onError` (router only) | none: called with the event (`null` when unparsed) and the error of every 400 and 500 |

A bad option makes the constructor throw a `ValidationError`. A client's configuration never
changes after construction; `client.onBehalfOf` derives clients that share it. Every request sends
`User-Agent: qbitflow-js/3.1.0` (`VERSION`).

## What the SDK doesn't cover

The SDK covers what integrator code does with an API key. These are done in the
[QBitFlow dashboard](https://qbitflow.app) instead: your space's settings (checkout defaults,
emails, branding) and your members' policies; API keys; wallets (added by their owner only);
sending a refund, and answering a customer's refund request; releasing held funds; rotating a
webhook secret, and sending a test event. Their effects reach your code through the API and the
webhooks (`refund.approved`, `heldFunds.released`, `webhook.test`, …).

## Migrating from 2.x

3.0.0 is a rewrite for API v2: base URL `/v2`, REST routes, a `checkoutSessions` service, UUID
ids, money as decimal strings, members and invitations instead of users and claims, a new webhook
signature, typed errors, no `axios` or `ws` dependency. **[MIGRATION-v3.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/MIGRATION-v3.md)**
maps every 2.x method and type to its replacement, with before/after code for the common tasks.

## Examples

Runnable TypeScript programs in [`examples/`](https://github.com/QBitFlow/qbitflow-js-sdk/tree/main/examples)
(see its [README](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/README.md)). They are also the source of this README's code blocks
and of the snippets on [qbitflow.app/docs](https://qbitflow.app/docs) (see
[CONTRIBUTING.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/CONTRIBUTING.md)).

| Example | Shows |
|---|---|
| [`client-setup.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/client-setup.ts) | a client from the constructor and `me()`, and from the environment |
| [`checkout.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/checkout.ts) | a payment checkout, its status, `waitForCompletion`, expiry |
| [`catalog.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/catalog.ts) | a product, the products and customers lists, a checkout for a catalog product |
| [`payments.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/payments.ts) | a page of payments, one by id and by reference, the iterator, `formatAmount` |
| [`subscriptions.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/subscriptions.ts) | a subscription checkout with a trial, `hasAccess`, bills, its metadata, a test bill, cancel at period end |
| [`refunds.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/refunds.ts) | the pending refunds, a refund by id |
| [`marketplace.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/marketplace.ts) | invitations, members, `onBehalfOf`, wallets, held funds, fee, trust, removal |
| [`webhooks.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/webhooks.ts) | a webhook endpoint and its secret, the event log |
| [`webhook-handler.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/webhook-handler.ts) | a `node:http` receiver built on the webhook router, with deduplication and typed handlers |
| [`webhook-verify.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/webhook-verify.ts) | `constructEvent` on signed sample deliveries (offline) |
| [`errors-and-retries.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/errors-and-retries.ts) | retries, idempotency keys from the order, error classes, `isRetryable` |
| [`accounting.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/accounting.ts) | a yearly accounting export as JSON and CSV |
| [`currencies.ts`](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/examples/currencies.ts) | the currencies customers can pay with |

## Testing

```bash
npm ci
npm run build && npm run lint && npm test && npm run smoke
```

`npm test` type-checks the sources and the tests, then runs the offline suites against a local
test server: no account or network needed. Two suites of the maintainers' conformance suite (the
vectors shared by the official SDKs, and the website snippets) are skipped outside the
maintainers' workspace. See [tests/README.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/tests/README.md) and
[CONTRIBUTING.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/CONTRIBUTING.md). The live suite needs an API key **and** an explicit base
URL:

```bash
QBITFLOW_API_KEY=sk_… QBITFLOW_BASE_URL=https://… npm run test:live
```

The read-only checks only read; the write checks also need `QBITFLOW_LIVE_WRITES=1` and a test-mode
key (`QBITFLOW_ALLOW_LIVE_MODE_WRITES=1` allows a live-mode key, for a disposable server only).

## License

Licensed under the Mozilla Public License 2.0: see [LICENSE](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/LICENSE). See also how the SDK
handles data, [COMPLIANCE.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/COMPLIANCE.md), and the
[trademark policy](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/TRADEMARKS.md).

## Support

- Documentation: [qbitflow.app/docs](https://qbitflow.app/docs)
- Email: [support@qbitflow.app](mailto:support@qbitflow.app)
- Bugs and feature requests: [GitHub issues](https://github.com/QBitFlow/qbitflow-js-sdk/issues)

## Changelog

See [CHANGELOG.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/CHANGELOG.md).

## Security

Report a vulnerability privately to security@qbitflow.app, never in a public issue: see
[SECURITY.md](https://github.com/QBitFlow/qbitflow-js-sdk/blob/main/SECURITY.md) for what to include, the supported versions and the SDK's
security properties.
