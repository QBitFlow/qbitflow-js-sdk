# QBitFlow SDK examples

Runnable TypeScript programs for the QBitFlow JavaScript/TypeScript SDK 3.0.0 (API v2). Each one
imports from `'qbitflow'` and reads its configuration from the environment: never hardcode a key.

| File | Shows |
|---|---|
| [`client-setup.ts`](client-setup.ts) | a client from the constructor, checked with `me()`; clients from the environment (`QBitFlow.fromEnv`) |
| [`checkout.ts`](checkout.ts) | a payment checkout with an inline product, its status (`getStatus`), `waitForCompletion`, its expiry |
| [`catalog.ts`](catalog.ts) | a product (`tshirt-blue-m`), the products and one page of customers, a checkout for the product by its reference |
| [`payments.ts`](payments.ts) | a page of payments with a filter, one by id and by reference, every payment with `for await`, `formatAmount` / `parseAmount` |
| [`subscriptions.ts`](subscriptions.ts) | a subscription checkout with a trial, a subscription and `hasAccess`, its bills with `for await`, test billing, cancel at period end |
| [`refunds.ts`](refunds.ts) | a partial refund of a payment, the active refunds |
| [`marketplace.ts`](marketplace.ts) | invite a seller, the members and invitations, revoke one; for a member: `onBehalfOf`, wallets, held funds, fee, trust, removal |
| [`webhooks.ts`](webhooks.ts) | a webhook endpoint and its signing secret, the event log |
| [`webhook-handler.ts`](webhook-handler.ts) | a `node:http` receiver built on `webhooks.router`: typed handlers per event type, `onUnknown`, `onError`, deduplication on `event.id`, `hasAccess`, `formatAmount` |
| [`webhook-verify.ts`](webhook-verify.ts) | the lower level: `webhooks.constructEvent` on deliveries signed with `webhooks.sign` (offline) |
| [`errors-and-retries.ts`](errors-and-retries.ts) | retries and an idempotency key derived from the order, the error classes with `instanceof`, `isRetryable`, an `AbortSignal` |
| [`accounting.ts`](accounting.ts) | the year 2026 exported as JSON and as CSV, over the 95-day limit |
| [`currencies.ts`](currencies.ts) | the currencies customers can pay with |

The `// docs:start <id>` … `// docs:end <id>` regions of these programs are the code snippets of
[qbitflow.app/docs](https://qbitflow.app/docs) and of the SDK's README; `snippets.manifest.json`
maps each snippet id to its program. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Running them

The examples use the SDK of this repository (`"qbitflow": "file:.."`): build it first.

```bash
npm install && npm run build      # in the repository root
cd examples
npm install
export QBITFLOW_API_KEY=sk_…      # a test-mode key; QBITFLOW_BASE_URL=… for another server
npm run checkout                  # or: npx tsx checkout.ts
```

They use the documentation's sample values (order `order-1042`, product `tshirt-blue-m`,
`https://shop.example.com/…` URLs): run them with a test-mode key. A program that creates
something with a fixed reference handles the conflict of a second run, or expires its checkout.

| Script | Environment |
|---|---|
| `npm run client-setup` | `QBITFLOW_API_KEY`; `QBITFLOW_ON_BEHALF_OF` optional. The constructor example uses the default base URL: it is skipped when `QBITFLOW_BASE_URL` is set |
| `npm run checkout` | `QBITFLOW_API_KEY`; `WAIT=1` to wait for the payment (up to 10 minutes) before expiring the checkout |
| `npm run catalog` | `QBITFLOW_API_KEY` (it creates the product once, and opens then expires a checkout for it) |
| `npm run payments` | `QBITFLOW_API_KEY`; `PAYMENT_UUID` (`pay@…`), else the first payment listed |
| `npm run subscriptions` | `QBITFLOW_API_KEY`; `SUBSCRIPTION_UUID` (`sub@…`), else the first active one; `TEST_BILL=1` to bill it now (test mode); `CANCEL=1` to stop it at the end of its period |
| `npm run refunds` | `QBITFLOW_API_KEY`; `PAYMENT_UUID` (`pay@…`) to refund half of that payment |
| `npm run marketplace` | an organization key in `QBITFLOW_API_KEY`. Without `MEMBER_UUID`: lists members and invitations, `INVITE=1` invites `seller@example.com`, `REVOKE_INVITATION_UUID` revokes an invitation. With `MEMBER_UUID` (a member's `userUuid`): reads them and acts for them; `SET_FEE=1`, `TRUST=1`, `REMOVE=1` change them |
| `npm run webhooks` | `QBITFLOW_API_KEY`; `CREATE_ENDPOINT=1` to register an endpoint and write its secret to `./qbitflow-webhook-secret` |
| `npm run webhook-handler` | `QBITFLOW_WEBHOOK_SECRET` (the `whsec_…` secret `webhooks.endpoints.create` returned); `QBITFLOW_API_KEY` for the follow-up reads. Listens on `:8080`, `POST /webhooks/qbitflow` |
| `npm run webhook-verify` | `QBITFLOW_WEBHOOK_SECRET` (any `whsec_…` value: it runs offline) |
| `npm run errors-and-retries` | `QBITFLOW_API_KEY` (it opens then expires a checkout, and creates then deletes a customer) |
| `npm run accounting` | `QBITFLOW_API_KEY` (writes `./qbitflow-2026.csv`) |
| `npm run currencies` | `QBITFLOW_API_KEY` |

Every script that calls the API also honours `QBITFLOW_BASE_URL` (default
`https://api.qbitflow.app/v2`), except the constructor example of `client-setup.ts`.

`npm run typecheck` type-checks every program. To receive webhooks on your machine, expose port
8080 with a tunnel and create an endpoint for its public `https` URL (a test-mode endpoint also
accepts `http`).

## With Express

`webhook-handler.ts` uses `node:http` to stay dependency-free. With Express, give the webhook route
the raw body, and register it before any `app.use(express.json())` (a parsed body can no longer be
verified: the router answers 500 and says so):

```ts
app.post('/webhooks/qbitflow', express.raw({ type: 'application/json' }), router.nodeHandler());
```

With Next.js (App Router), Hono, Bun, Deno or Cloudflare Workers, use `router.fetchHandler()`, a
`(request: Request) => Promise<Response>`: `export const POST = router.fetchHandler();`.
