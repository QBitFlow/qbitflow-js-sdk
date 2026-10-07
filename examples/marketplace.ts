/**
 * Walks the marketplace flow with an organization API key: invite a seller, act in their space
 * once they joined (a product and a checkout of theirs), trust them, and read the funds the
 * organization holds for them.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] SELLER_EMAIL=seller@example.com npx tsx marketplace.ts
 *     QBITFLOW_API_KEY=sk_… MEMBER_UUID=<a member's userUuid> [TRUST=1] npx tsx marketplace.ts
 */
import { ConflictError, QBitFlow } from 'qbitflow';

function newClient(): QBitFlow {
	const apiKey = process.env.QBITFLOW_API_KEY;
	if (!apiKey) throw new Error('set QBITFLOW_API_KEY (an organization key)');
	return new QBitFlow(apiKey, { baseUrl: process.env.QBITFLOW_BASE_URL || undefined });
}

/** Invites a seller. They exist in the organization once they accepted. */
async function invite(client: QBitFlow): Promise<void> {
	const email = process.env.SELLER_EMAIL;
	if (!email)
		throw new Error('set SELLER_EMAIL (to invite) or MEMBER_UUID (to act for a member)');
	try {
		const created = await client.invitations.create({
			email,
			trustLayer: true, // hold their payments until members.trust
			organizationFeePercent: 5, // the organization keeps 5 % of the seller's payments
			redirectUrl: 'https://market.example.com/welcome',
		});
		console.log(`invitation ${created.invitation.uuid} sent; link: ${created.link}`);
	} catch (err) {
		if (err instanceof ConflictError && err.code === 'already_joined') {
			console.log(`${email} is already a member`);
			return;
		}
		throw err;
	}
	// Then wait for the member.joined webhook (see webhook-handler.ts):
	//
	//   if (webhooks.isEventType(event, 'member.joined')) {
	//     // event.data.invitationUuid === created.invitation.uuid; store event.data.userUuid,
	//     // then run this program with MEMBER_UUID=<event.data.userUuid>.
	//   }
}

/** Acts in a member's space: onBehalfOf sends On-Behalf-Of on every request. */
async function sellAs(client: QBitFlow, memberUuid: string): Promise<void> {
	const member = await client.members.get(memberUuid);
	console.log(`member ${member.name} ${member.lastName}, trusted: ${member.trustedAt !== null}`);

	// Is the seller ready to be paid? Their checkouts need a wallet accepting a currency.
	const currencies = await client.wallets.listSupportedCurrencies({ userUuid: memberUuid });
	if (currencies.length === 0) {
		console.log(
			'the seller has no wallet yet: their checkouts would answer 409 merchant_not_ready'
		);
		return;
	}

	const seller = client.onBehalfOf(memberUuid); // throws a ValidationError for a non-UUID
	const product = await seller.products.create({
		name: 'Handmade mug',
		price: 4.5,
		reference: `mug-${Date.now()}`,
	}); // a PermissionDeniedError policy_disabled if your policies don't let members do this
	const session = await seller.checkoutSessions.createPayment({
		productUuid: product.uuid,
		successUrl: 'https://market.example.com/orders/{{UUID}}',
	});
	console.log(`the buyer pays at ${session.link}`);

	// What the organization holds for the seller (their payments while untrusted).
	const held = await client.members.getHeldFunds(memberUuid);
	console.log(`held for them: ${held.totalAmount} USD over ${held.ledgers.length} payments`);
	// From the seller's side (their key, or onBehalfOf): the same total.
	const own = await seller.members.getOwnHeldFunds();
	console.log(`as seen by the seller: ${own.totalAmount} USD`);

	// Trust them: their new payments go to their wallets directly. What is held stays held until
	// released in the dashboard.
	if (member.trustedAt === null && process.env.TRUST === '1') {
		const trusted = await client.members.trust(memberUuid);
		console.log(`trusted since ${trusted.trustedAt ?? '—'}`);
	}
}

const client = newClient();
const memberUuid = process.env.MEMBER_UUID;
if (memberUuid) await sellAs(client, memberUuid);
else await invite(client);
