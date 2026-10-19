/**
 * Every service method by its surface name (`products.create`, `webhooks.events.list`, `me`),
 * called with the shared vectors' `args` (path parameters by their spec name, the params under
 * `params`).
 */

import type { QBitFlow } from '../../src/client';
import type { RequestOptions } from '../../src/transport';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Args = Record<string, any>;
type Call = (c: QBitFlow, a: Args, o?: RequestOptions) => Promise<unknown>;

export const METHODS: Record<string, Call> = {
	me: (c, _a, o) => c.me(o),

	'products.list': (c, a, o) => c.products.list(a.params, o),
	'products.create': (c, a, o) => c.products.create(a.params, o),
	'products.get': (c, a, o) => c.products.get(a.uuid, o),
	'products.getByReference': (c, a, o) => c.products.getByReference(a.reference, o),
	'products.update': (c, a, o) => c.products.update(a.uuid, a.params, o),
	'products.delete': (c, a, o) => c.products.delete(a.uuid, o),

	'customers.list': (c, a, o) => c.customers.list(a.params, o),
	'customers.create': (c, a, o) => c.customers.create(a.params, o),
	'customers.get': (c, a, o) => c.customers.get(a.uuid, o),
	'customers.getByReference': (c, a, o) => c.customers.getByReference(a.reference, o),
	'customers.update': (c, a, o) => c.customers.update(a.uuid, a.params, o),
	'customers.delete': (c, a, o) => c.customers.delete(a.uuid, o),

	'currencies.list': (c, a, o) => c.currencies.list(a.params, o),
	'currencies.get': (c, a, o) => c.currencies.get(a.id, o),

	'checkoutSessions.createPayment': (c, a, o) => c.checkoutSessions.createPayment(a.params, o),
	'checkoutSessions.createSubscription': (c, a, o) =>
		c.checkoutSessions.createSubscription(a.params, o),
	'checkoutSessions.get': (c, a, o) => c.checkoutSessions.get(a.uuid, o),
	'checkoutSessions.expire': (c, a, o) => c.checkoutSessions.expire(a.uuid, o),

	'payments.list': (c, a, o) => c.payments.list(a.params, o),
	'payments.get': (c, a, o) => c.payments.get(a.uuid, a.params, o),
	'payments.getByReference': (c, a, o) => c.payments.getByReference(a.reference, o),
	'transactions.list': (c, a, o) => c.transactions.list(a.params, o),
	'failures.list': (c, a, o) => c.failures.list(a.params, o),

	'subscriptions.list': (c, a, o) => c.subscriptions.list(a.params, o),
	'subscriptions.get': (c, a, o) => c.subscriptions.get(a.uuid, a.params, o),
	'subscriptions.getByReference': (c, a, o) => c.subscriptions.getByReference(a.reference, o),
	'subscriptions.update': (c, a, o) => c.subscriptions.update(a.uuid, a.params, o),
	'subscriptions.listBills': (c, a, o) => c.subscriptions.listBills(a.uuid, a.params, o),
	'subscriptions.getBill': (c, a, o) => c.subscriptions.getBill(a.billUuid, a.params, o),
	'subscriptions.cancel': (c, a, o) => c.subscriptions.cancel(a.uuid, a.params, o),
	'subscriptions.testBill': (c, a, o) => c.subscriptions.testBill(a.uuid, o),

	'refunds.list': (c, a, o) => c.refunds.list(a.params, o),
	'refunds.get': (c, a, o) => c.refunds.get(a.uuid, o),
	'refunds.create': (c, a, o) => c.refunds.create(a.params, o),

	'members.list': (c, a, o) => c.members.list(a.params, o),
	'members.get': (c, a, o) => c.members.get(a.userUuid, o),
	'members.update': (c, a, o) => c.members.update(a.userUuid, a.params, o),
	'members.remove': (c, a, o) => c.members.remove(a.userUuid, o),
	'members.trust': (c, a, o) => c.members.trust(a.userUuid, o),
	'members.listHeldFunds': (c, _a, o) => c.members.listHeldFunds(o),
	'members.getHeldFunds': (c, a, o) => c.members.getHeldFunds(a.userUuid, o),
	'members.getOwnHeldFunds': (c, _a, o) => c.members.getOwnHeldFunds(o),

	'invitations.create': (c, a, o) => c.invitations.create(a.params, o),
	'invitations.list': (c, a, o) => c.invitations.list(a.params, o),
	'invitations.revoke': (c, a, o) => c.invitations.revoke(a.uuid, o),

	'wallets.list': (c, a, o) => c.wallets.list(a.params, o),
	'wallets.listForMember': (c, a, o) => c.wallets.listForMember(a.userUuid, o),
	'wallets.listAcceptedCurrencies': (c, a, o) => c.wallets.listAcceptedCurrencies(a.params, o),

	'accounting.exportJson': (c, a, o) => c.accounting.exportJson(a.from, a.to, o),
	'accounting.exportCsv': (c, a, o) => c.accounting.exportCsv(a.from, a.to, o),

	'webhooks.verifyRemote': (c, a, o) =>
		c.webhooks.verifyRemote(a.endpointUuid, a.rawBody, a.signatureHeader, o),
	'webhooks.endpoints.list': (c, a, o) => c.webhooks.endpoints.list(a.params, o),
	'webhooks.endpoints.create': (c, a, o) => c.webhooks.endpoints.create(a.params, o),
	'webhooks.endpoints.get': (c, a, o) => c.webhooks.endpoints.get(a.uuid, o),
	'webhooks.endpoints.update': (c, a, o) => c.webhooks.endpoints.update(a.uuid, a.params, o),
	'webhooks.endpoints.delete': (c, a, o) => c.webhooks.endpoints.delete(a.uuid, o),
	'webhooks.events.list': (c, a, o) => c.webhooks.events.list(a.params, o),
	'webhooks.events.get': (c, a, o) => c.webhooks.events.get(a.id, o),
};

/** Calls `method` on `client` (or on `client.onBehalfOf(clientOpts.onBehalfOf)`). */
export async function invoke(
	client: QBitFlow,
	method: string,
	args: Args,
	options?: RequestOptions,
	clientOpts?: { onBehalfOf?: string }
): Promise<unknown> {
	const call = METHODS[method];
	if (!call) throw new Error(`unknown method ${method}`);
	const target =
		clientOpts && 'onBehalfOf' in clientOpts
			? client.onBehalfOf(clientOpts.onBehalfOf as string)
			: client;
	return call(target, args, options);
}

/** Reads `path` (`items[0].metadata.fee`, `[0].name`, `data.amountUsd`, `''`) on `value`. */
export function probe(value: any, path: string): any {
	if (path === '') return value;
	const tokens = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
	let cur = value;
	for (const t of tokens) {
		if (cur === undefined || cur === null) return undefined;
		cur = t.startsWith('[') ? cur[Number(t.slice(1, -1))] : cur[t];
	}
	return cur;
}
