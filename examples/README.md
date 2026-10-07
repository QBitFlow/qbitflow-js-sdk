# QBitFlow SDK examples

Runnable TypeScript programs for the QBitFlow JavaScript/TypeScript SDK 3.0.0 (API v2). Each one
imports from `'qbitflow'` and reads its configuration from the environment: never hardcode a key.

| File | Shows |
|---|---|
| [`checkout.ts`](checkout.ts) | a payment checkout with an inline product, its status (`getStatus`), its expiry |
| [`subscriptions.ts`](subscriptions.ts) | a subscription checkout with a trial, filtered lists, the access rule, bills with `for await`, cancel at period end |
| [`marketplace.ts`](marketplace.ts) | invite a seller, then act `onBehalfOf` them: a product, a checkout, held funds, trust |
| [`webhook-handler.ts`](webhook-handler.ts) | a `node:http` receiver: raw body, `webhooks.constructEvent`, deduplication on `event.id`, typed events, 2xx to every type |
| [`errors-and-retries.ts`](errors-and-retries.ts) | the error classes with `instanceof`, `isRetryable`, an `AbortSignal`, idempotency keys across processes |

## Running them

The examples use the SDK of this repository (`"qbitflow": "file:.."`): build it first.

```bash
npm install && npm run build      # in the repository root
cd examples
npm install
export QBITFLOW_API_KEY=sk_…      # a test-mode key; QBITFLOW_BASE_URL=… for another server
npm run checkout                  # or: npx tsx checkout.ts
```

| Script | Environment |
|---|---|
| `npm run checkout` | `QBITFLOW_API_KEY` |
| `npm run subscriptions` | `QBITFLOW_API_KEY`; `CANCEL=1` to stop the first active subscription at the end of its period |
| `npm run marketplace` | an organization key in `QBITFLOW_API_KEY`, and `SELLER_EMAIL` (to invite) or `MEMBER_UUID` (a member's `userUuid`, to act for them); `TRUST=1` to trust them |
| `npm run webhook-handler` | `QBITFLOW_WEBHOOK_SECRET` (the `whsec_…` secret `webhooks.endpoints.create` returned); `QBITFLOW_API_KEY` for the follow-up reads. Listens on `:8080`, `POST /webhooks/qbitflow` |
| `npm run errors-and-retries` | `QBITFLOW_API_KEY` (it creates, then deletes, a customer) |

Every script also honours `QBITFLOW_BASE_URL` (default `https://api.qbitflow.app/v2`).

`npm run typecheck` type-checks the five programs. To receive webhooks on your machine, expose port
8080 with a tunnel and create an endpoint for its public `https` URL (a test-mode endpoint also
accepts `http`).

## With Express

`webhook-handler.ts` uses `node:http` to stay dependency-free. With Express, keep the body raw on
the webhook route (a JSON body parser would re-serialize it and break the signature):

```ts
app.post('/webhooks/qbitflow', express.raw({ type: 'application/json' }), (req, res) => {
	try {
		const event = webhooks.constructEvent(req.body, req.headers['qbitflow-signature'], secret);
		// … deduplicate on event.id, handle it …
		res.sendStatus(200);
	} catch {
		res.sendStatus(400);
	}
});
```
