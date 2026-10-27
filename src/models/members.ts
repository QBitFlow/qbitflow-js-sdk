/**
 * The current key (`me`), members, held funds and invitations.
 *
 * @module
 */

import type { InvitationStatus, LedgerEntryType, Role } from '../enums.js';
import type { Currency, PageParams, Settlement } from './common.js';

/** What the API key is, and where the request acts (`client.me()`). */
export interface Me {
	/** The key's id. */
	apiKeyUuid?: string;
	/**
	 * What the request may do in the space: `admin` (an organization key) or `user` (a member's
	 * key, or an organization key acting `onBehalfOf` a member).
	 */
	role?: Role;
	/**
	 * The member an organization key acts as (`On-Behalf-Of`): the space is that member's. Absent
	 * otherwise.
	 */
	onBehalfOfUserUuid?: string;
	/** The space the request reads and writes in (`space.test` says the mode). */
	space?: MeSpace;
}

/**
 * The space a request acts in: one organization's data in one mode, the organization's shared
 * space or a member's personal space.
 */
export interface MeSpace {
	/** The space's id. */
	uuid: string;
	/** Its organization. */
	organizationUuid: string;
	/** Its organization's name. */
	organizationName: string;
	/** The member whose space it is; absent for the organization's own space. */
	userUuid?: string;
	/** The space's mode: `true` for test, `false` for live. */
	test: boolean;
	/** The key's role in the organization: `admin` (an organization key) or `user` (a member's key). */
	role: Role;
	/** Names the member whose space it is; absent for the organization's own space. */
	member?: MeMember;
	/**
	 * The organization's fee on the member's payments in this space, a percent string (`"0"`:
	 * none); absent for the organization's own space.
	 */
	organizationFeePercent?: string;
	/**
	 * When the organization started paying the member directly; absent while it holds their funds
	 * (always set on the organization's own space).
	 */
	trustedAt?: string;
	/** When the space was created. */
	createdAt: string;
}

/** Names the member whose space a request acts in. */
export interface MeMember {
	/** The member (as `members.list` lists them). */
	userUuid: string;
	/** The first name. */
	firstName: string;
	/** The last name; absent when the account has none. */
	lastName?: string;
	/** The email. */
	email: string;
}

/** A member of the organization (a seller of a marketplace), in one mode: their personal space there. */
export interface Member {
	/** The member's id: what `onBehalfOf` (the client's, `client.onBehalfOf`, a request's) takes. */
	userUuid: string;
	/** The first name. */
	firstName: string;
	/** The last name; absent when the account has none. */
	lastName?: string;
	/** The email. */
	email: string;
	/** The mode. */
	test: boolean;
	/** The organization's fee on the member's payments in this mode, a percent string (`"0"`: none). */
	organizationFeePercent: string;
	/**
	 * When the organization started paying them directly; absent while it holds their funds (held
	 * funds).
	 */
	trustedAt?: string;
	/** When they joined in this mode. */
	joinedAt: string;
	/**
	 * The currencies a checkout of the member can be paid in now: those their wallets accept,
	 * always within the organization's (the organization's own while it holds their funds). `[]`:
	 * a checkout of theirs answers 409 `merchant_not_ready`.
	 */
	acceptedCurrencies: Currency[];
	/** Their personal space in this mode. */
	spaceUuid: string;
}

/** What the organization holds for a member in one mode (held funds). */
export interface HeldFunds {
	/**
	 * The lines not settled yet, oldest first: the payments held (positive), and the refunds sent
	 * of them (negative, type `refund`). `[]` when nothing is held.
	 */
	ledgers: LedgerEntry[];
	/**
	 * What the organization owes the member, in USD, a decimal string: the sum of the lines'
	 * `owedUsd`. A release pays it, converted at the release's price. `"0"` or negative when
	 * refunds cancel out the payments (nothing to send: the held funds are closed instead).
	 */
	totalUsd: string;
}

/**
 * A line of a member's held funds: a payment made to them while the organization held their
 * funds (it adds what the organization owes them), or a refund of one (it takes off what the
 * refund sent back to the customer).
 */
export interface LedgerEntry {
	/** The line's transaction: the payment (`pay@…`) or the refund (`refund@…`). */
	txUuid: string;
	/** `payment` or `refund`. */
	type: LedgerEntryType;
	/** What the line is, in words (`Payment pay@…`). */
	description: string;
	/** On a refund line, the payment it refunds; absent on the others. */
	refundedTxUuid?: string;
	/**
	 * What the customer paid (a payment), or what a refund sent back (positive: `owedUsd` is its
	 * negative), in USD, a decimal string.
	 */
	amountUsd: string;
	/**
	 * A payment's fees and split (the member was owed `settlement.split.merchant`); absent on a
	 * refund line.
	 */
	settlement?: Settlement;
	/** The currency paid (and refunded). */
	currency: Currency;
	/**
	 * What the line counts for in a release, in the currency's units, exact: a payment's merchant
	 * share, or minus what a refund sent back (negative). In `heldFunds.released`: what it counted
	 * for in that release.
	 */
	owed: string;
	/** The same in the currency's smallest unit (negative for a refund). */
	owedMinUnits: string;
	/** The same in USD, at the payment's time (negative for a refund). */
	owedUsd: string;
	/** When the line was recorded. */
	createdAt: string;
}

/** What the organization owes one member (`members.listHeldFunds`). */
export interface MemberHeldFunds {
	/** The member (a removed member still owed too). */
	userUuid: string;
	/**
	 * What the organization owes them, in USD, a decimal string (`"0"` or negative when refunds
	 * cancel out the payments).
	 */
	totalUsd: string;
	/** Their lines not settled: payments held, refunds of them. */
	count: number;
	/** Their oldest line not settled: how long the organization has held funds for them. */
	oldestAt: string;
}

/** Changes a member's terms in the key's mode (`members.update`). */
export interface UpdateMemberParams {
	/**
	 * Required: the organization's fee on the member's payments from now on, a percent
	 * **string** from `"0"` to `"50"` with at most 2 decimals. A checkout already created keeps
	 * its fee; a running subscription's next bills take the new one.
	 */
	organizationFeePercent: string;
}

/** Pages `members.list`. */
export type MemberListParams = PageParams;

/**
 * An invitation to the organization: to be a member in one mode (role `user`), or to its team
 * (role `admin`, from the dashboard: mode-free, so `test`, `holdFunds` and
 * `organizationFeePercent` are absent).
 */
export interface Invitation {
	/** The invitation's id. */
	uuid: string;
	/** A member invitation's mode; absent for a team invitation. */
	test?: boolean;
	/** The invited address. */
	email: string;
	/** `admin` (the team) or `user` (a member). */
	role: Role;
	/**
	 * For a member, `true` when the organization holds their payments until it trusts them
	 * (`members.trust`), `false` when they are paid directly; absent for the team.
	 */
	holdFunds?: boolean;
	/**
	 * For a member, the organization's fee on their payments, a percent string (`"0"`: none);
	 * absent for the team.
	 */
	organizationFeePercent?: string;
	/** Where the person goes once they accepted (with `?invitationUuid=<uuid>`); absent when none. */
	redirectUrl?: string;
	/** When it expires. */
	expiresAt: string;
	/** The account that accepted it; absent until accepted. */
	acceptedByUserUuid?: string;
	/** When it was accepted; absent until then. */
	acceptedAt?: string;
	/** When it was revoked (or replaced by a newer one); absent unless revoked. */
	revokedAt?: string;
	/** When it was created. */
	createdAt: string;
	/** `pending`, `accepted`, `revoked` or `expired` (computed when read). */
	status: InvitationStatus;
}

/**
 * An invitation just created (`invitations.create`): the invitation's fields and its link, only
 * returned here.
 */
export interface CreatedInvitation extends Invitation {
	/**
	 * The link to accept it, also emailed to the person unless `sendEmail` was `false`: share it
	 * in your own onboarding if you prefer.
	 */
	link: string;
}

/**
 * Invites a member (`invitations.create`). The SDK always sends role `user`: team invitations
 * are made from the dashboard.
 */
export interface CreateInvitationParams {
	/** Required: the person to invite, at most 254 characters. */
	email: string;
	/**
	 * Required (always sent): `true` holds the member's payments until the organization trusts
	 * them (`members.trust`); `false` pays them directly.
	 */
	holdFunds: boolean;
	/**
	 * The organization's fee on their payments, a percent **string** from `"0"` to `"50"` with at
	 * most 2 decimals (absent or `''` = `"0"`).
	 */
	organizationFeePercent?: string;
	/**
	 * Where the person goes once they accepted (with `?invitationUuid=<uuid>`): a convenience,
	 * confirm with the `member.joined` event.
	 */
	redirectUrl?: string;
	/**
	 * Whether QBitFlow emails the link to the person (absent = `true`). `false` sends no
	 * invitation email: share the returned `link` yourself. Signing up through the link still
	 * emails the person a confirmation.
	 */
	sendEmail?: boolean;
}

/** Filters `invitations.list`. */
export interface InvitationListParams extends PageParams {
	/** Only the invitations with this status (`pending`, `accepted`, `revoked`, `expired`). */
	status?: InvitationStatus;
}
