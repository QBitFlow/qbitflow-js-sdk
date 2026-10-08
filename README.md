# QBitFlow JavaScript/TypeScript SDK

[![npm version](https://img.shields.io/npm/v/qbitflow.svg)](https://www.npmjs.com/package/qbitflow)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](#installation)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)

The official JavaScript/TypeScript SDK for [QBitFlow](https://qbitflow.app), non-custodial crypto
payments: hosted checkouts, one-time payments, subscriptions, refunds, marketplaces with
commissions and held funds, accounting exports and signed webhooks. Customers pay from their own
wallets, on Ethereum, Base and Solana, straight to yours.

- **API v2**, every integrator route: 13 services, 60 routes, one `QBitFlow` client.
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

> Coming from 2.x? Read [MIGRATION-v3.md](MIGRATION-v3.md): 3.0.0 targets API v2 and changes the
> services, the ids, the errors and the webhooks.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Integration recipes](#integration-recipes)
- [Authentication and acting for a member](#authentication-and-acting-for-a-member)
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
key to a browser.

## Quick start

```ts
import { QBitFlow } from 'qbitflow';

// One client per API key, shared by the whole program.
// A blank key, or one not starting with sk_, throws a ValidationError (nothing is sent).
const client = new QBitFlow(process.env.QBITFLOW_API_KEY ?? '');

// The recommended start-up check: what is this key, and which mode is it in?
const me = await client.me(); // an AuthenticationError for an unknown or revoked key
if (me.space) {
	console.log(`${me.space.organizationName}, role ${me.role}, test mode ${me.space.test}`);
}

// A hosted checkout for a one-time payment of 4.99 USD.
const session = await client.checkoutSessions.createPayment({
	productName: 'Premium access',
	price: 4.99,
	reference: 'order-1042',
	successUrl: 'https://shop.example.com/thanks?session={{UUID}}',
	cancelUrl: 'https://shop.example.com/cart',
});
console.log('Send the customer to', session.link);
```

Then fulfil the order when the [`payment.completed` webhook](#webhooks) arrives for
`session.uuid`, never on the customer's redirect to your success page.

### Conventions

- **Every method** returns a `Promise`, takes its params as one object, and accepts
  [request options](#configuration) as its last argument (`onBehalfOf`, `idempotencyKey`,
  `requestId`, `signal`).
- **Ids are strings.** Resources are named by UUIDs; transactions by prefixed ids (`pay@…` a
  payment, `sub@…` a subscription, `sub-hist@…` a bill, `refund@…` a refund) that you pass back
  verbatim. Only currencies keep numeric ids.
- **Optional response fields** are typed `field?: T` (absent: `undefined`); a field typed
  `T | null` is always present. A required field the API leaves out decodes to its zero value
  (`''`, `0`, `false`, `[]`), never to an error; a value of the wrong JSON type is a `ServerError`.
- **Amounts:** USD amounts are numbers (`amount`, `amountUsd`); exact amounts in a token's smallest
  unit, and a few USD prices, are decimal **strings** (`amountMinUnits`, `priceUsd`, `allowance`),
  never parsed or rounded. Fee rates are percents: `feePercent: 1.5` is 1.5 %.
- **Enums** are string-literal unions with a `const` object listing the known values
  (`SubscriptionStatus.PastDue === 'pastDue'`). A value this SDK does not know yet is kept as is:
  give every `switch` a `default` branch.
- **Times** are ISO 8601 strings, exactly as the API sent them (its offset, e.g. `+02:00`, and its
  microseconds included): use `Date.parse(value)` to compare. Date filters (`createdAfter`,
  `createdBefore`) take a `Date` or an RFC 3339 string.
- **Path segments** you pass (references, emails, ids) are percent-encoded. A value that is
  exactly `.` or `..` is refused with a `ValidationError`: `fetch` would normalise it away.

## Integration recipes

A typical integration is three steps: open a checkout, receive the webhook, grant access. The
helpers below make each one a few lines; the sections after them document every method.

### A webhook endpoint in your framework

`webhooks.router(secret)` verifies each delivery's signature over the raw body, parses it, runs the
handlers registered for its type and answers QBitFlow: 200 when handled (or ignored), 400 for a
bad signature, 500 when a handler throws (QBitFlow retries it later). See
[Webhooks](#2-handle-the-deliveries-with-the-router) for the details.

**Next.js** (App Router, `app/api/webhooks/qbitflow/route.ts`, the default Node.js runtime): a
route handler receives the raw body, nothing to configure.

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

```ts
import { createServer } from 'node:http';
import { webhooks } from 'qbitflow';

const handleWebhook = webhooks
	.router(process.env.QBITFLOW_WEBHOOK_SECRET!)
	.on('payment.completed', (payment, event) => fulfilOrder(payment.reference, event.id))
	.nodeHandler();

createServer((req, res) => {
	if (req.url === '/webhooks/qbitflow') void handleWebhook(req, res);
	else res.writeHead(404).end();
}).listen(8080);
```

### Checkout, success page, and waiting in scripts

```ts
const client = QBitFlow.fromEnv();
const session = await client.checkoutSessions.createPayment({
	productName: 'Premium access',
	price: 4.99,
	reference: 'order-1042',
	// QBitFlow fills the placeholders in on the redirect (never URL-encoded by the SDK).
	successUrl: `https://shop.example.com/thanks?session=${Placeholders.UUID}`,
	cancelUrl: 'https://shop.example.com/cart',
});
console.log('Send the customer to', session.link);

// The success page may show the status, but never fulfils: the payment.completed webhook does
// (anyone can open the success URL).
const shown = await client.checkoutSessions.getStatus(session.uuid);
console.log(shown.status);
```

In a script, a test or a back-office job, `waitForCompletion` polls the status until the session
is `completed` or `expired` (every 3 s, for 10 minutes by default). When the timeout comes first it
returns the last status seen: check it.

```ts
const final = await client.checkoutSessions.waitForCompletion(session.uuid, {
	timeout: 5 * 60_000, // ms
	interval: 5_000, // ms, at least 1000
});
if (final.status === 'completed') console.log('paid, tx', final.txHash);
else console.log('not paid:', final.status); // expired, or still open at the timeout
```

### Access control

Grant access while `now < currentPeriodEnd`, whatever the subscription's status: `hasAccess`
does exactly that.

```ts
const subscription = await client.subscriptions.getByReference('user-42');
if (hasAccess(subscription)) {
	console.log('serve the premium content');
}
// The subscription.* webhooks carry the subscription: hasAccess(event.data) works there too.
console.log(hasAccess(subscription, new Date('2027-01-01'))); // at a given time
```

### Money display

Exact amounts in a token's smallest unit are decimal strings: convert them with `formatAmount` and
`parseAmount` (string arithmetic, never floats).

```ts
const payment = await client.payments.get('pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f');
if (payment.currency) {
	const amount = formatAmount(payment.amountMinUnits, payment.currency.decimals);
	console.log(`${amount} ${payment.currency.symbol}`); // e.g. 1.5 USDC
}
console.log(formatAmount('1500000', 6), parseAmount('1.5', 6)); // 1.5 1500000
```

### A yearly accounting export

The API exports at most 95 days at a time; the range helpers split any range into windows,
request them in order and concatenate the result (the CSV header once).

```ts
import { writeFile } from 'node:fs/promises';

const csv = await client.accounting.exportCsvRange('2026-01-01', '2026-12-31'); // 4 requests
await writeFile('qbitflow-2026.csv', csv, { mode: 0o600 });
const rows = await client.accounting.exportJsonRange('2026-01-01', '2026-12-31');
console.log(rows.length, 'rows');
```

### Configuration from the environment

```ts
// QBITFLOW_API_KEY (required), QBITFLOW_BASE_URL and QBITFLOW_ON_BEHALF_OF when set.
const client = QBitFlow.fromEnv();
// Explicit options override the environment and add the others.
const patient = QBitFlow.fromEnv({ timeout: 60_000, maxRetries: 5 });
console.log(client !== patient);
```

## Authentication and acting for a member

Every request sends your API key in `X-API-Key`. Keys are created in the QBitFlow dashboard; each
belongs to one **space** (your organization's, or one of its members') and one **mode** (test or
live). The constructor only checks the key's shape (non-blank, starting with `sk_`) and sends
nothing: call `me()` to check it online.

```ts
const me = await client.me();
if (!me.space?.test) {
	throw new Error('this job must run with a test-mode key');
}
console.log('acting as', me.role, 'in', me.space.organizationName); // admin: an organization key
```

Keep the key in a secret store or an environment variable, never in code. Keys issued before API v2
(`sk_<digits>_…`) still work; rotate them in the dashboard to the `sk_<uuid>_…` format.

### `On-Behalf-Of`: acting in a member's space

A marketplace's **organization key** can act in any of its members' spaces: create their products
and checkouts, read their payments. Name the member by their **user UUID** (`Member.userUuid`,
also in the `member.joined` webhook). A non-member, an owner or admin of the team, or a member of
the other mode answers 404.

```ts
const memberUuid = '0192f1c2-7b3a-7c4d-9e5f-6a7b8c9d0e1f'; // Member.userUuid

// A client acting in the member's space. It shares the configuration of client.
const seller = client.onBehalfOf(memberUuid);
const products = await seller.products.list();
console.log(products.length, 'products in the seller space');

// One request only: the request option wins over the client's.
const page = await client.payments.list({}, { onBehalfOf: memberUuid });
console.log(page.items.length, 'payments of the seller');

// '' forces the organization's own space for one request of the seller's client.
const own = await seller.products.list({}, { onBehalfOf: '' });
console.log(own.length, 'products of the organization');
```

`onBehalfOf` is also a client option: `new QBitFlow(key, { onBehalfOf: memberUuid })`. A value
that is not a UUID (or the nil UUID) throws a `ValidationError` at once, from `client.onBehalfOf()`
and from the constructor; as a request option it fails that call before anything is sent.

## Checkout sessions

A checkout session is a hosted payment page. Create it, send your customer to its `link`, and act
on the webhook. The session's id (`pay@…` or `sub@…`) is also the id of the payment or the
subscription it creates once the customer's transaction is confirmed.

Name the product with **exactly one** of `productUuid`, `productReference`, or an inline product
(`productName` + `price`, `description` optional):

```ts
const session = await client.checkoutSessions.createPayment({
	productUuid: '0192f1c2-1111-7c4d-9e5f-6a7b8c9d0e1f', // or productReference: 'tshirt-blue-m'
	reference: 'order-1043', // your order id: unique per space
	customerReference: 'crm-42', // kept on the payment
	successUrl: 'https://shop.example.com/orders/1043?session={{UUID}}&type={{TRANSACTION_TYPE}}',
	cancelUrl: 'https://shop.example.com/cart',
	expiresInMinutes: 30, // 10 to 1440; left out = the default
});
console.log('pay at', session.link, '- session', session.uuid, 'expires', session.expiresAt);
```

A subscription checkout takes the same fields plus its terms, each optional over a subscription
product's:

```ts
const session = await client.checkoutSessions.createSubscription({
	productName: 'Pro plan',
	price: 4.99, // USD per period
	frequency: { value: 1, unit: DurationUnit.Months },
	trialPeriod: { value: 14, unit: 'days' },
	minPeriods: 3, // the customer commits to 3 periods
	successUrl: 'https://app.example.com/billing?subscription={{UUID}}',
});
console.log('subscribe at', session.link);
```

- **Redirect placeholders.** In `successUrl` and `cancelUrl`, QBitFlow replaces `{{UUID}}` with the
  session's id and `{{TRANSACTION_TYPE}}` with `payment` or `createSubscription`
  (`Placeholders.UUID`, `Placeholders.TRANSACTION_TYPE`; the SDK sends them as they are). In live mode both
  URLs must be `https`. A redirect proves nothing (anyone can open the URL): fulfil on the
  webhook, or on `getStatus`.
- **Errors to expect:** a `ConflictError` `merchant_not_ready` (`details.reason`) when the space's
  wallets accept no currency; `unique_violation` when another payment or open session holds the
  `reference`; a `ValidationError` above 5 USD in test mode (`details.max`); a `NotFoundError` for
  an unknown product or customer.

### Status

```ts
const status = await client.checkoutSessions.getStatus(session.uuid);
switch (status.status) {
	case CheckoutSessionStatusValue.Completed:
		console.log('paid, tx', status.txHash);
		break;
	case CheckoutSessionStatusValue.Expired:
		console.log('expired unpaid:', status.message);
		break;
	case CheckoutSessionStatusValue.WaitingConfirmation:
		console.log('sent, waiting for the network');
		break;
	default: // created, or a status this SDK does not know
		if (status.lastAttempt) {
			console.log('last attempt failed:', status.lastAttempt.code); // the customer may try again
		}
}
```

| `status` | Meaning | Final |
|---|---|---|
| `created` | Waiting for the customer. With `lastAttempt` set, their last attempt failed (`lastAttempt.code` says why) | no |
| `waitingConfirmation` | A transaction was sent; waiting for the network. It may last: the transaction can still land | no |
| `completed` | Confirmed and recorded: the `Payment` or `Subscription` exists, with the session's id | yes |
| `expired` | Expired unpaid (`checkout.expired` was sent). Read some days later, an expired session is a 404 | yes |

**Never cancel an order on `lastAttempt`:** a failed attempt is not final, and the customer can pay
from the same checkout until it expires. Release what the order holds on `checkout.expired`.

`checkoutSessions.waitForCompletion(uuid, { timeout?, interval?, signal? })` polls `getStatus`
until `completed` or `expired` and returns that status; when `timeout` (ms, default 10 minutes; 0
or less: the default) elapses first, it returns the last status seen, after one final poll at the
deadline. `interval` is in ms (default 3000, at least 1000); the request options (`onBehalfOf`,
`requestId`) apply to each poll; `getStatus`'s errors propagate (a 404 included). It is meant for scripts, tests and back-office
jobs: [fulfil orders on the webhook](#integration-recipes).

### Expire

End a session early (an order cancelled on your side). It answers its status, and
`checkout.expired` follows. Once the customer paid or is paying it is a `ConflictError`
`tx_already_sent`.

```ts
const expired = await client.checkoutSessions.expire(session.uuid);
console.log(expired.status); // expired
```

## Products and customers

Products are optional (a checkout can name an inline product) and give you a reusable catalog
with payment links. A subscription product carries its terms.

```ts
let product = await client.products.create({
	name: 'Pro plan',
	description: 'Everything, billed monthly',
	price: 4.99,
	reference: 'pro-monthly', // unique per space; generated when left out
	subscription: { frequency: { value: 1, unit: DurationUnit.Months } },
});

// Only the fields given change. A new price applies to new checkouts and subscribers only.
product = await client.products.update(product.uuid, {
	price: 5.99,
	isActive: false, // hidden from products.list
});

const all = await client.products.list({ includeHidden: true, subscription: true });
console.log(product.paymentLink, all.length);
```

`products.get`, `getByReference` and `delete` complete the set. Deleting a product does not stop
its subscriptions: cancel them with `subscriptions.cancel` if the product is gone for good.

```ts
let customer = await client.customers.create({
	name: 'Ada',
	lastName: 'Lovelace',
	email: 'ada@example.com',
	reference: 'crm-42',
});

// '' clears phoneNumber or address; a field left out is unchanged.
customer = await client.customers.update(customer.uuid, { phoneNumber: '' });

const byEmail = await client.customers.getByEmail('ada@example.com');
console.log(customer.uuid === byEmail.uuid);
```

`customers.get`, `getByReference`, `list` / `iterate` (by `email` or `verified`) and `delete`
complete the set. A checkout given `customerUuid` or `customerReference` asks the customer
nothing (`customerReference` is kept on the payment, and links your customer with that reference
if there is one); without either, the checkout asks what your `checkout.customerDetails` setting
says (the full details by default).

## Payments and failures

A `Payment` exists once its transaction is confirmed, with its checkout session's `pay@…` id.

```ts
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
const page = await client.payments.list({
	createdAfter: since,
	includeMembers: true, // organization key: the members' payments too
	limit: 50,
});
for (const p of page.items) {
	const merchant = p.metadata.txAmounts.usd.merchant;
	console.log(`${p.uuid} "${p.reference ?? ''}": ${p.amount} USD (${p.explorerUrl}), merchant got ${merchant} USD`);
}

const payment = await client.payments.get('pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f');
const byRef = await client.payments.getByReference('order-1042');
console.log(payment.txHash, byRef.uuid, payment.refundable === true);
```

- **Filters** (`PaymentListParams`): `customerUuid`, `productUuid`, `createdAfter` / `createdBefore`
  (both excluded), `refunded`, and, with an organization key acting for itself, `includeMembers`
  (every member's rows, each naming its `userUuid`) or `userUuid` (one member's). The last two
  exclude each other.
- **Reading a member's row** from the organization's space: `payments.get(id, { includeMembers:
  true })`, or `onBehalfOf` the member.
- **The combined feed** of one-time payments and subscription bills, newest first:
  `payments.listCombined` / `iterateCombined`, with the same filters plus `source`
  (`CombinedPaymentSource.Payment`, `CombinedPaymentSource.SubscriptionHistory`) and
  `subscriptionUuid`.
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
| `stopped` | Cancelled during its period: never billed again, `cancelled` at `nextBillingDate` |
| `cancelled` | Over (`cancellationReason` says why). Final |

**Access rule: grant access while `now < currentPeriodEnd`, whatever the status.** A `stopped` or
`paused` subscription has paid for its period; a `pastDue` one's period has ended.

```ts
import { hasAccess } from 'qbitflow';

console.log(hasAccess(sub)); // currentPeriodEnd set and now < currentPeriodEnd
console.log(hasAccess(sub, new Date('2027-01-01'))); // at a given time
```

`actionRequired` says what the customer must do (`topUpAllowance`, `raiseMaximum`,
`confirmTrial`; absent: nothing): point them to the `managementPageLink` the subscription
webhooks carry.

```ts
const page = await client.subscriptions.list({ status: SubscriptionStatus.PastDue });
for (const s of page.items) {
	if (s.dunning) console.log(s.uuid, s.dunning.remainingAttempts, 'attempts left');
}

const sub = await client.subscriptions.get('sub@0192f1c2-3333-7c4d-9e5f-6a7b8c9d0e1f'); // cancelled ones too
console.log(sub.status, sub.priceUsd, 'USD per period');

// Every bill, newest first: the iterator fetches the pages lazily.
for await (const bill of client.subscriptions.iterateBills(sub.uuid)) {
	if (bill.periodEnd) console.log(`${bill.uuid}: ${bill.amount} USD, paid until ${bill.periodEnd}`);
}
```

- `subscriptions.getByReference` reads one by your checkout's `reference`; `getBill` one bill
  (`sub-hist@…`).
- `subscriptions.getPublicHistory` returns the 10 latest bills as the customer's page shows them.
  It is a public route: the fields only the merchant sees (`metadata`, `customerUuid`,
  `customerReference`, `userUuid`, `paidMinUnits`, `refund`, …) are empty there. Use `listBills`
  for full bills.
- Before its checkout completes, `subscriptions.get` is a 404: read the checkout session instead.

### Cancel

`cancel` cancels without the customer signing. By default it is immediate (`cancelled`, reason
`merchant`); `{ immediate: false }` stops it now and cancels it at the end of the period paid for.

```ts
const { subscription, pending } = await client.subscriptions.cancel(sub.uuid, { immediate: false });
// A ConflictError subscription_already_stopped_or_inactive, or a 404 once cancelled.
if (pending) {
	// HTTP 202: the on-chain cancellation is still confirming and the status is not updated yet.
	// It goes on regardless; subscription.statusChanged tells the end.
	console.log('cancellation confirming');
} else {
	console.log('now', subscription.status); // stopped
}
```

`cancel` answers 200 when done and 202 (`pending: true`) while confirming on-chain. It is never
retried automatically.

### Test billing

In test mode a subscription is billed only when you ask, with live's statuses and webhooks:

```ts
// A ConflictError payment_not_due before nextBillingDate; a 400 for a live subscription.
const state = await client.subscriptions.executeTestBilling(sub.uuid);
console.log(state.stage, state.outcome, state.failureCode);
```

Walk the timeline once in test mode: a 5-minute frequency, pay from a test wallet, trigger the
bill, then empty the wallet and trigger it again to see `subscription.billingFailed` and
`pastDue`.

## Refunds

```ts
// Refunds waiting for an answer. From the organization's space the members' are included by
// default: includeMembers false leaves them out.
const pending = await client.refunds.list({ includeMembers: false });
for (const r of pending) {
	console.log(r.uuid, r.txUuid, r.initiatedBy, r.reason, r.amountUsd);
}

// Answered refunds (approved or rejected), page by page.
for await (const r of client.refunds.iterateInactive()) {
	console.log(r.uuid, r.status, r.explorerUrl);
}
```

`refunds.initiate` starts a refund of a payment (`pay@…`) or a bill (`sub-hist@…`) of the space.
**It creates a pending refund: no money moves until you sign the transfer in the dashboard**,
from the wallet that was paid. `refund.completed` tells you when it is sent.

```ts
try {
	const refund = await client.refunds.initiate({
		txUuid: 'pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f',
		refundPercent: 50, // of everything the customer paid, network fee included; left out = 100
		reason: 'Damaged in transit',
		merchantMessage: 'Sorry about that: half of your payment is on its way back.',
	});
	console.log(refund.uuid, refund.status); // pending
} catch (err) {
	if (err instanceof ConflictError && err.code === 'refund_already_exists') {
		console.log('already refunded:', err.details.refundUuid); // one refund per transaction
	} else {
		throw err;
	}
}
```

A refund is `pending`, `approved` or `rejected`; `initiatedBy` is `customer` (a request you answer
in the dashboard) or `merchant`. A held seller's payment already released to them can no longer be
refunded (`409 held_funds_released`).

## Marketplaces

A marketplace is an organization whose sellers are its **members**. You invite them, sell for
them with your organization key and `onBehalfOf`, take a commission on their payments, and may
hold their funds until you trust them. QBitFlow stays non-custodial: money goes from the customer's
wallet to the seller's (and your commission to yours) in one transaction.

**1. Invite the seller.** The SDK always invites members (`role: user`); the team is invited from
the dashboard.

```ts
const created = await client.invitations.create({
	email: 'seller@example.com',
	trustLayer: true, // hold their payments until members.trust
	organizationFeePercent: 5, // your commission: 0 to 50 %, at most 2 decimals
	redirectUrl: 'https://market.example.com/welcome',
});
// A ConflictError already_joined for a member; a RateLimitError beyond 50 invitations an hour.
console.log(created.invitation.uuid, created.link); // the link is also emailed
```

**2. Wait for `member.joined`.** The seller exists once they accepted: store the event's
`userUuid` and match `invitationUuid` to your invitation. Never trust the redirect's
`?invitationUuid=` (anyone can open it).

```ts
if (event.type === 'member.joined') {
	console.log('invitation', event.data.invitationUuid, 'accepted by', event.data.userUuid);
}
```

**3. Sell for them.** The seller adds their receiving wallet in their QBitFlow dashboard (only
they can, not needed while you hold their funds). Then act in their space:

```ts
const currencies = await client.wallets.listSupportedCurrencies({ userUuid: memberUuid });
if (currencies.length === 0) {
	throw new Error('the seller cannot be paid yet: their checkouts would answer 409 merchant_not_ready');
}

const seller = client.onBehalfOf(memberUuid);
const session = await seller.checkoutSessions.createPayment({
	productName: 'Handmade mug',
	price: 4.5,
	successUrl: 'https://market.example.com/orders/{{UUID}}',
}); // a PermissionDeniedError policy_disabled when your policies don't let members do this
console.log(session.link);
```

**4. Hear of every sale.** An organization webhook endpoint receives every seller's events by
default; the event's `userUuid` names the seller. Use it as `onBehalfOf` for follow-up reads.

**5. Commission and held funds.** Each payment records your fee in `metadata.organizationFee` and
`metadata.txAmounts`. While you hold a seller's funds (`trustLayer` true, `Member.trustedAt`
`null`), their payments go to your wallet and the net is owed to them:

```ts
const held = await client.members.getHeldFunds(memberUuid);
console.log(`owed to the seller: ${held.totalAmount} USD over ${held.ledgers.length} lines`);

// Their new payments go to their own wallets from now on. What is held stays held until you
// release it from the dashboard (heldFunds.released tells you).
const member = await client.members.trust(memberUuid);
console.log('trusted since', member.trustedAt);

// Change the commission (a checkout already created keeps its fee).
await client.members.update(memberUuid, { organizationFeePercent: 7.5 });
```

- `members.list` / `iterate` / `get`, `members.listHeldFunds` (every member owed), and
  `seller.members.getOwnHeldFunds()` (the seller's side) complete the reads.
- `members.remove` ends a seller's membership in the key's mode: their keys stop working and their
  checkouts close. It is a `409 held_funds_pending` while you hold their live funds: release them
  first.
- `invitations.list` / `iterate` (by `status`) and `invitations.revoke` manage the invitations.
- Today a seller whose account already belongs to another organization cannot accept (no
  `member.joined` comes), and test-mode sellers are real accounts that accept from a real inbox.

## Wallets

Wallets are added and removed in the dashboard, by their owner only. The SDK reads them.

```ts
const wallets = await client.wallets.list({ withBalances: true });
for (const w of wallets) {
	console.log(w.currency.symbol, w.publicKey);
	for (const tw of w.tokenWallets) {
		if (tw.balance) console.log(`  ${tw.token.symbol}: ${tw.balance.balance} (${tw.balance.balanceUsd} USD)`);
	}
}
```

`wallets.listForMember(userUuid)` reads a member's wallets (organization key), and
`wallets.listSupportedCurrencies` the currencies a space's checkouts accept: none means its
checkouts answer `409 merchant_not_ready`.

## Accounting export

Every payment, bill, refund and fee between two dates (`YYYY-MM-DD`, both included), as JSON rows
or as CSV text:

```ts
import { writeFile } from 'node:fs/promises';

const events = await client.accounting.exportJson('2026-09-01', '2026-09-30');
for (const e of events) {
	console.log(e.type, e.paymentUuid, e.txTimeUtc, e.tokenSymbol, e.grossAmount, e.netAmount);
}

const csv = await client.accounting.exportCsv('2026-09-01', '2026-09-30');
await writeFile('qbitflow-2026-09.csv', csv, { mode: 0o600 });
```

The SDK checks the dates and `from <= to` before sending. **The API allows at most 95 days per
export** and answers 400 beyond: `exportJsonRange(from, to)` and `exportCsvRange(from, to)` take
any range, split it into consecutive windows of at most 95 days (calendar dates, UTC), request them
in order and concatenate the result (one list; for CSV the header line once, then every window's
rows, line endings as sent):

```ts
const year = await client.accounting.exportJsonRange('2026-01-01', '2026-12-31'); // 4 requests
console.log(year.length);
```
 Rows are typed `payment`,
`subscriptionHistory`, `refund`, `organizationFee` or `referralFee`; amounts in a token's smallest
unit are decimal strings, and the empty fields of a row are left out.

## Webhooks

QBitFlow posts an **event** to your endpoints when something happens: a payment confirmed, a
subscription billed, a member joined.

### 1. Create an endpoint and store its secret

```ts
const created = await client.webhooks.endpoints.create({
	url: 'https://shop.example.com/webhooks/qbitflow',
	events: [
		// left out: every type, including the ones added later
		EventType.PaymentCompleted,
		EventType.CheckoutExpired,
		EventType.SubscriptionStatusChanged,
	],
	description: 'Order fulfilment',
});
// The whsec_… secret is shown only this once: put it in your secret store now.
console.log(created.uuid, created.secret);
```

Up to 10 endpoints per space and mode; live endpoints need `https` and a public host. An
organization endpoint also receives its members' events unless created with
`includeMembers: false`. `endpoints.list`, `get`, `update` (`{ enabled: false }` pauses it,
`{ enabled: true }` enables it again) and `delete` manage them. An endpoint's secret is shown and
rotated in the dashboard only.

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
		console.log(`fulfil order "${payment.reference ?? ''}": ${payment.amount} USD`);
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
`now` (tests) and `onError`.

**Test your handlers** with `webhooks.sign(rawBody, secret, timestamp?)`, which returns the header
QBitFlow would send (`t=<unix seconds>,v1=<hex>`):

```ts
const body = JSON.stringify({
	id: 'evt_test_1',
	type: 'payment.completed',
	version: 'v2',
	createdAt: new Date().toISOString(),
	test: true,
	data: { uuid: 'pay@0192f1c2-2222-7c4d-9e5f-6a7b8c9d0e1f', reference: 'order-1', amount: 4.99 },
});
const result = await router.handle(body, webhooks.sign(body, secret));
console.log(result.status, result.event?.type); // 200 payment.completed
```

### Lower level: `verify`, `constructEvent`, `parseEvent`

The router is built on these. `webhooks.constructEvent(rawBody, signatureHeader, secret, options?)`
verifies the `QBitFlow-Signature` header over the **raw body** (the bytes as received: never
`JSON.parse` and re-serialize them) and parses it; a `switch` on `event.type` then narrows
`event.data`:

```ts
try {
	const event = webhooks.constructEvent(rawBody, signatureHeader, secret, { tolerance: 600 });
	switch (event.type) {
		case 'payment.completed': // event.data is a PaymentCompleted
			console.log('fulfil', event.data.reference);
			break;
		default:
		// A type you don't handle, or one added after this SDK: acknowledge it.
	}
} catch (err) {
	if (err instanceof WebhookSignatureError) {
		console.log('rejected:', err.reason); // e.g. noMatchingSignature, timestampOutsideTolerance
	} else if (err instanceof ValidationError) {
		console.log('not a v2 event:', err.message);
	} else {
		throw err;
	}
}
```

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
- **Secret rotation** needs nothing on your side: for 24 hours after a rotation the header carries
  two `v1=` signatures, the new secret's and the previous one's, and either secret verifies. Switch
  your secret within the day.
- **Timestamps** more than 5 minutes from your clock are refused (replays): `{ tolerance }` (in
  seconds) changes it, `{ now }` (a `Date`, or a function returning one) sets the clock in tests.
- **Members' events** carry the member in `event.userUuid`: read their resources with
  `client.onBehalfOf(event.userUuid)`.
- **No fixed source IPs**: verify the signature, never allow-list addresses.
- **v2 only.** An endpoint migrated from API v1 receives v1 bodies, which `parseEvent` refuses
  (a `ValidationError`): move it to v2 in the dashboard, or with
  `client.webhooks.endpoints.update(uuid, { payloadVersion: WebhookPayloadVersion.V2 })`.
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
| `subscription.created` | the `Subscription` (`active` or `trial`) + `managementPageLink` |
| `subscription.billed` | the `Bill` (paid until `periodEnd`) + `subscriptionReference`, `subscriptionStatus` |
| `subscription.statusChanged` | the `Subscription` + `previousStatus` |
| `subscription.actionRequiredChanged` | the `Subscription` + `previousActionRequired` |
| `subscription.billingFailed` | the `Subscription` + `reason`, `billUuid`, `amountUsd` (a string), `attempt`, `remainingAttempts`, `nextAttemptAt` |
| `subscription.upcomingBill` | the `Subscription` + `billingDate`, `amountUsd` (a number), `trialEnding`, `balanceSufficient`, `allowanceSufficient` |
| `refund.requested` / `.completed` / `.denied` | the `Refund` |
| `member.joined` | the `Member` + `invitationUuid` |
| `member.removed` | the `Member` |
| `heldFunds.released` | the transfer paid to the member + the `ledgers` it settled |
| `checkout.expired` | the session: `PaymentSessionData`, or `SubscriptionSessionData` (`webhooks.isSubscriptionSession`) |
| `webhook.test` | `endpointUuid`, `message` (the dashboard's test) |
| any other | `unknown` (the raw JSON value) |

Webhook data never carries what only API reads return (`customer`, `refund`/`refundable`,
`dunning`, `approval`, `productName`).

### The event log

Every event of the space, newest first, with each one's deliveries:

```ts
for await (const event of client.webhooks.events.iterate({ type: EventType.PaymentCompleted })) {
	const detail = await client.webhooks.events.get(event.id);
	for (const d of detail.deliveries) {
		console.log(event.id, d.url, d.delivered, d.attempts.length);
	}
	break; // the first one is enough here: breaking stops the fetching
}
```

## Currencies

```ts
const currencies = await client.currencies.listAvailable({ test: true });
const byId = new Map(currencies.map((c) => [c.id, c])); // e.g. 6-decimal USDC

if (currencies.length > 0) {
	const c = await client.currencies.get(currencies[0].id); // resolve one id
	console.log(c.symbol, c.decimals, byId.size);
}
```

`listAvailable` lists every currency checkouts can take, `listMain` the chains' native coins, and
`get` one by id, to resolve the `currencyId`, `availableCurrencyIds` and `acceptedCurrencyIds`
fields. These routes are public and **limited to 60 requests a minute per IP: cache the list** at
start-up instead of reading it per request. Payments, bills and subscriptions already carry their
`currency`.

## Pagination and iterators

Paginated lists return a `Page<T>`: `items`, `nextCursor` (`null` on the last page, else the value
to pass back as the params' `cursor`, verbatim) and `hasMore` (`nextCursor !== null`).

```ts
const params: CustomerListParams = { limit: 100 };
for (;;) {
	const page = await client.customers.list(params);
	for (const c of page.items) console.log(c.email);
	if (page.nextCursor === null) break;
	params.cursor = page.nextCursor;
}
```

Each paginated list has an `iterate…` twin returning an `AsyncIterableIterator<T>`: it fetches one
page at a time, only as you consume it, keeps your filters and page size, and stops when you
`break`. An error is thrown from the `for await` loop and ends it.

```ts
for await (const c of client.customers.iterate({ verified: true })) {
	console.log(c.uuid, c.email);
}
```

| Method | Iterator | Page size: default / max |
|---|---|---|
| `customers.list` | `iterate` | 10 / 100 |
| `payments.list`, `payments.listCombined` | `iterate`, `iterateCombined` | 10 / 50 |
| `failures.list` | `iterate` | 10 / 50 |
| `subscriptions.list`, `subscriptions.listBills` | `iterate`, `iterateBills` | 20 / 100 |
| `refunds.listInactive` | `iterateInactive` | 10 / 50 |
| `members.list`, `invitations.list` | `iterate` | 20 / 100 |
| `webhooks.events.list` (cursor `evt_…`) | `iterate` | 20 / 100 |

The other lists are short and return a plain array: `products.list`, `refunds.list`,
`wallets.*`, `currencies.*`, `webhooks.endpoints.list` (at most 10), `members.listHeldFunds` and
`subscriptions.getPublicHistory` (the 10 latest bills).

## Errors

Every error the SDK throws is a `QBitFlowError`; each class below extends `ApiError`, which
extends `QBitFlowError`. Match them with `instanceof` (it works across the CommonJS and ES module
builds, even with two copies of the package installed):

| Class | When | Codes and properties worth knowing |
|---|---|---|
| `ValidationError` | 400 `validation_failed`, or input the SDK refused **before sending** (`status` `undefined`) | `fieldErrors`: each failing input by its wire name, dotted when nested (`frequency.unit`) |
| `BadRequestError` | any other 400 | `bad_request`, `foreign_key_violation` (`details.field`) |
| `AuthenticationError` | 401 | a missing, unknown, expired or revoked key (a removed member's keys too) |
| `PermissionDeniedError` | 403 | `forbidden`, `policy_disabled` (`details.policy`), `plan_required` |
| `NotFoundError` | 404 | unknown, deleted, or outside the request's space |
| `ConflictError` | 409 | `unique_violation` (`details.field`), `tx_already_sent`, `merchant_not_ready` (`details.reason`), `refund_already_exists` (`details.refundUuid`), `held_funds_released`, `held_funds_pending`, `already_joined`, `payment_not_due`, `idempotency_key_in_use`, `conflict` |
| `GoneError` | 410 | `merchant_closed`: a removed member's or a closed organization's space |
| `IdempotencyError` | 422 `idempotency_key_reused` | an `Idempotency-Key` reused for another request: a bug, never retried |
| `RateLimitError` | 429 | `retryAfter` (seconds), `limit`, `periodSeconds` |
| `ServerError` | 5xx (503 `network_unavailable`, 504 `timeout`), an unexpected 3xx (redirects are never followed), a 2xx whose body is not the expected JSON | |
| `NetworkError` | no response: DNS, connection, TLS, timeout, an aborted `signal` | `cause`: the underlying error or the signal's reason |
| `WebhookSignatureError` | a webhook signature refused, locally or by `verifyRemote` | `reason`: `missingHeader`, `malformedHeader`, `timestampOutsideTolerance`, `noMatchingSignature`, `invalidSignature` |
| `ApiError` | any other HTTP error (e.g. 413 `request_too_large`) | |

Every `ApiError` carries `status` (`undefined` when no response was received), `code` (branch on
it, never on the message; `''` when absent), `rawMessage` (the API's own message), `details`
(never `null`), `requestId` (quote it to support), `fieldErrors`, `rawBody` (the error response as
received, `''` without one) and `cause`. Its `message` reads
`"<message> (status <status>, code <code>, request <requestId>)"`, followed by
`"; <field>: <message>"` for each field error, and its `name` is the class name.

```ts
try {
	await client.customers.create({ name: 'Ada', email: 'ada@example.com' });
	console.log('created');
} catch (err) {
	if (err instanceof ValidationError) {
		for (const f of err.fieldErrors) console.log(`${f.field}: ${f.message}`); // next to the form field
	} else if (err instanceof ConflictError && err.code === 'unique_violation') {
		console.log('taken:', err.details.field); // email or reference
	} else if (err instanceof RateLimitError) {
		console.log(`slow down, retry in ${err.retryAfter} s`);
	} else if (err instanceof ApiError) {
		console.log(`QBitFlow error ${err.status} ${err.code} (request ${err.requestId})`);
	} else {
		throw err;
	}
}
```

**Client-side validation** runs before every request: names and texts (lengths in characters, no
markup characters), references (`A-Z a-z 0-9 . _ : @ -`, 1 to 100), emails, phone numbers,
absolute `http(s)` URLs, prices above 0, percents (at most 2 decimals), durations (a frequency
between 1 unit and 1 year), UUIDs and transaction ids, dates, the checkout's product choice, and
exclusive filters. A failure is a `ValidationError` with `status` `undefined`, its message
`validation failed` followed by the field list, and nothing is sent. What depends on the key's mode
or on stored data is left to the API: the 5 USD test-mode cap, `https`-only live URLs, the
frequency minimum (1 hour live, 5 minutes test), the 95-day export window, uniqueness.

## Retries and idempotency

| | |
|---|---|
| Retried methods | every read (GET), and the 7 creates: `checkoutSessions.createPayment`, `checkoutSessions.createSubscription`, `products.create`, `customers.create`, `webhooks.endpoints.create`, `invitations.create`, `refunds.initiate` |
| Never retried | every other write: updates, deletes, `checkoutSessions.expire`, `subscriptions.cancel`, `subscriptions.executeTestBilling`, `members.trust`, `members.remove`, `invitations.revoke`, `webhooks.verifyRemote` |
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
pass your own stable key:

```ts
const orderId = 'order-1044';
try {
	const session = await client.checkoutSessions.createPayment(
		{ productName: 'T-shirt', price: 4.99, reference: orderId },
		{
			idempotencyKey: `checkout-${orderId}`, // the same key returns the same session
			requestId: 'job-7781', // sent as X-Request-Id, echoed in errors
		}
	);
	console.log(session.link);
} catch (err) {
	if (err instanceof IdempotencyError) {
		throw new Error('this key was already used with other params'); // 422 idempotency_key_reused
	}
	throw err;
}
```

A key is 1 to 255 printable ASCII characters without spaces, and only successful answers are kept
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
naming it), `QBITFLOW_BASE_URL` and `QBITFLOW_ON_BEHALF_OF` (an empty variable counts as unset);
`config` overrides them and adds the other options.

| Client option | Default | |
|---|---|---|
| `baseUrl` | `https://api.qbitflow.app/v2` (`DEFAULT_BASE_URL`) | an absolute `http(s)` URL; a trailing `/` is stripped |
| `timeout` | `30000` ms (`DEFAULT_TIMEOUT`) | per attempt, in milliseconds; positive |
| `maxRetries` | `3` (`DEFAULT_MAX_RETRIES`) | `0` disables retries; a negative or fractional value is refused |
| `onBehalfOf` | none | every request acts in that member's space (a member's `userUuid`) |
| `fetch` | the global `fetch` | `(url, init) => Promise<{ status, headers.get(), text() }>`; called with `redirect: 'manual'` and a `signal` |

| Request option (any method, last argument) | |
|---|---|
| `onBehalfOf` | acts in that member's space for this call; `''` forces the organization's |
| `idempotencyKey` | the 7 creates only: your own `Idempotency-Key` |
| `requestId` | sends `X-Request-Id` (1 to 128 of `A-Z a-z 0-9 - _ . :`) |
| `signal` | an `AbortSignal` cancelling the call, its retries and its waits |

| Webhook option (`webhooks.verify`, `webhooks.constructEvent`, `webhooks.router`) | Default |
|---|---|
| `tolerance` | 300 seconds (`webhooks.DEFAULT_TOLERANCE`); `0` or less keeps the default |
| `now` | the current time: a `Date`, or a function returning one |
| `onError` (router only) | none: called with the event (`null` when unparsed) and the error of every 400 and 500 |

A bad option makes the constructor throw a `ValidationError`. A client's configuration never
changes after construction; `client.onBehalfOf` derives clients that share it. Every request sends
`User-Agent: qbitflow-js/3.0.0` (`VERSION`).

## Migrating from 2.x

3.0.0 is a rewrite for API v2: base URL `/v2`, a `checkoutSessions` service, UUID ids, members and
invitations instead of users and claims, a new webhook signature, typed errors, no `axios` or `ws`
dependency. **[MIGRATION-v3.md](MIGRATION-v3.md)** maps every 2.x method and type to its
replacement, with before/after code for the common tasks.

## Examples

Runnable TypeScript programs in [`examples/`](examples) (see its [README](examples/README.md)):

| Example | Shows |
|---|---|
| [`checkout.ts`](examples/checkout.ts) | a payment checkout, its status, expiry |
| [`subscriptions.ts`](examples/subscriptions.ts) | a subscription checkout with a trial, filtered lists, bills, cancel at period end |
| [`marketplace.ts`](examples/marketplace.ts) | invite a seller, sell `onBehalfOf`, held funds, trust |
| [`webhook-handler.ts`](examples/webhook-handler.ts) | a `node:http` receiver built on the webhook router, with deduplication and typed handlers |
| [`errors-and-retries.ts`](examples/errors-and-retries.ts) | error classes, `isRetryable`, idempotency keys across processes |

## Testing

```bash
npm run build && npm run lint && npm test
```

`npm test` type-checks the sources and the tests, then runs the offline suites against a stubbed
`fetch`, including the cross-SDK vectors the four QBitFlow SDKs share (see
[tests/README.md](tests/README.md)). The live suite needs an API key **and** an explicit base URL:

```bash
QBITFLOW_API_KEY=sk_… QBITFLOW_BASE_URL=https://… npm run test:live
```

The read-only checks only read; the write checks also need `QBITFLOW_LIVE_WRITES=1` and a test-mode
key (`QBITFLOW_ALLOW_LIVE_MODE_WRITES=1` allows a live-mode key, for a disposable server only).

## License

This project is licensed under the MPL-2.0 License: see the [LICENSE](LICENSE) file. See also
[COMPLIANCE.md](COMPLIANCE.md) and the [trademark policy](TRADEMARKS.md).

## Support

- 📖 [Documentation](https://qbitflow.app/docs)
- 📧 [Email Support](mailto:support@qbitflow.app)
- 🐛 [Issue Tracker](https://github.com/qbitflow/qbitflow-js-sdk/issues)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Security

For security issues, please email security@qbitflow.app instead of using the issue tracker (see
[SECURITY.md](SECURITY.md)).
