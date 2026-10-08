/**
 * Walks the marketplace flow with an organization API key: invite a seller and manage the
 * invitations; once they joined, read them, act in their space, read their wallets and the funds
 * held for them, and change their fee, trust them or remove them.
 *
 *     QBITFLOW_API_KEY=sk_… [QBITFLOW_BASE_URL=…] [INVITE=1] [REVOKE_INVITATION_UUID=…] npx tsx marketplace.ts
 *     QBITFLOW_API_KEY=sk_… MEMBER_UUID=<a member's userUuid> [SET_FEE=1] [TRUST=1] [REMOVE=1] npx tsx marketplace.ts
 */
import { ConflictError, InvitationStatus, QBitFlow } from 'qbitflow';

/** Invites seller@example.com. They exist in the organization once they accepted. */
async function invite(client: QBitFlow): Promise<void> {
	// docs:start members-invite
	const created = await client.invitations.create({
		email: 'seller@example.com',
		trustLayer: true, // hold their payments until you trust them
		organizationFeePercent: 10, // your commission on their payments
		redirectUrl: 'https://shop.example.com/sellers/welcome',
	});
	// The link is also emailed. They are a member once they accepted (the member.joined webhook).
	console.log(`invitation ${created.invitation.uuid}: ${created.link}`);
	// docs:end members-invite
}

/** Lists the members and the pending invitations; revokes one when asked. */
async function listAll(client: QBitFlow): Promise<void> {
	{
		// docs:start members-list
		const page = await client.members.list({ limit: 20 });
		for (const member of page.items) {
			console.log(`${member.email}: fee ${member.organizationFeePercent} %`);
		}
		// docs:end members-list
	}
	{
		// docs:start invitations-list
		const page = await client.invitations.list({ status: InvitationStatus.Pending });
		for (const invitation of page.items) {
			console.log(`${invitation.uuid} ${invitation.email}, expires ${invitation.expiresAt}`);
		}
		// docs:end invitations-list
	}

	const invitationUuid = process.env.REVOKE_INVITATION_UUID;
	if (invitationUuid) {
		// docs:start invitations-revoke
		// Only before it is accepted: the link stops working.
		const invitation = await client.invitations.revoke(invitationUuid);
		console.log(`invitation for ${invitation.email}: ${invitation.status}`); // revoked
		// docs:end invitations-revoke
	}
}

/** Reads the funds held for the member the client acts as (their key, or onBehalfOf). */
async function ownHeldFunds(client: QBitFlow): Promise<void> {
	// docs:start members-own-held-funds
	// With a member's key, or a client.onBehalfOf(memberUuid) client. Empty for the organization.
	const held = await client.members.getOwnHeldFunds();
	console.log(`held for me: ${held.totalAmount} USD over ${held.ledgers.length} payments`);
	// docs:end members-own-held-funds
}

/** Reads a member, acts in their space, and manages them. */
async function manage(client: QBitFlow, memberUuid: string): Promise<void> {
	// docs:start members-get
	const member = await client.members.get(memberUuid);
	console.log(`${member.name} ${member.lastName} <${member.email}>`);
	console.log(`fee ${member.organizationFeePercent} %, trusted: ${member.trustedAt ?? 'no'}`);
	// docs:end members-get

	// docs:start client-on-behalf-of
	// An organization key acting in a member's space: every request of seller sends
	// On-Behalf-Of. It shares client's configuration.
	const seller = client.onBehalfOf(memberUuid);
	const products = await seller.products.list();
	console.log(`${products.length} products in the seller's space`);
	// docs:end client-on-behalf-of

	// docs:start members-wallets
	// Where the member is paid. Without a wallet, their checkouts answer 409 merchant_not_ready.
	const wallets = await client.wallets.listForMember(memberUuid);
	for (const wallet of wallets) {
		console.log(`${wallet.currency.symbol}: ${wallet.publicKey}`);
	}
	// docs:end members-wallets

	// docs:start members-held-funds
	// What the organization holds for its members (their payments while untrusted).
	const all = await client.members.listHeldFunds();
	for (const summary of all) {
		console.log(`${summary.userUuid}: ${summary.totalAmount} USD owed`);
	}

	const held = await client.members.getHeldFunds(memberUuid);
	for (const ledger of held.ledgers) {
		console.log(`  ${ledger.type} ${ledger.amount} USD`);
	}
	console.log(`held for this member: ${held.totalAmount} USD`);
	// docs:end members-held-funds

	await ownHeldFunds(seller); // the same total, from the seller's side

	if (process.env.SET_FEE === '1') {
		// docs:start members-update
		// Applies to their new checkouts: one already created keeps its fee.
		const updated = await client.members.update(memberUuid, { organizationFeePercent: 10 });
		console.log(`fee now ${updated.organizationFeePercent} %`);
		// docs:end members-update
	}

	if (process.env.TRUST === '1') {
		// docs:start members-trust
		// Their new payments go to their own wallets directly. What is already held stays held
		// until you release it from the dashboard (heldFunds.released tells you).
		const trusted = await client.members.trust(memberUuid);
		console.log(`trusted since ${trusted.trustedAt}`);
		// docs:end members-trust
	}

	if (process.env.REMOVE === '1') {
		// docs:start members-remove
		// Ends their membership: their keys stop working and their checkouts close.
		try {
			await client.members.remove(memberUuid);
			console.log('member removed');
		} catch (err) {
			if (!(err instanceof ConflictError && err.code === 'held_funds_pending')) throw err;
			console.log('funds are still held for them: release them first');
		}
		// docs:end members-remove
	}
}

const client = QBitFlow.fromEnv(); // an organization key
const memberUuid = process.env.MEMBER_UUID;
if (memberUuid) {
	await manage(client, memberUuid);
} else {
	if (process.env.INVITE === '1') {
		try {
			await invite(client);
		} catch (err) {
			if (!(err instanceof ConflictError && err.code === 'already_joined')) throw err;
			console.log('seller@example.com is already a member');
		}
	}
	await listAll(client);
}
