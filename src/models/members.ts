/**
 * The current key (`me`), members, held funds and invitations.
 *
 * @module
 */

import type { Credential, InvitationStatus, LedgerEntryType, Role } from '../enums.js';
import type { PaymentMetadata } from './common.js';

/** What the API key is (`client.me()`). */
export interface Me {
	/** `apiKey` for an API key. */
	credential: Credential;
	/** The key's id. */
	apiKeyUuid?: string;
	/** Who signed in, for a session (absent for an API key). */
	userUuid?: string;
	/** `admin` (organization key) or `user` (a member's key, or `onBehalfOf`). */
	role?: Role;
	/** The member an organization key acts as (`On-Behalf-Of`); absent otherwise. */
	onBehalfOf?: string;
	/** The space the request reads and writes in. */
	space?: MeSpace;
}

/** The space a request acts in. */
export interface MeSpace {
	/** The space's id. */
	uuid: string;
	/** Its organization. */
	organizationUuid: string;
	/** Its organization's name. */
	organizationName: string;
	/** The member whose space it is; absent for the organization's own space. */
	userUuid?: string;
	/** Names that member; absent for the organization's own space. */
	member?: MeMember;
	/** The space's mode: `true` for test, `false` for live. */
	test: boolean;
}

/** Names the member whose space a request acts in. */
export interface MeMember {
	/** The member (as `members.list` lists them). */
	userUuid: string;
	/** The first name. */
	name: string;
	/** The last name. */
	lastName: string;
	/** The email. */
	email: string;
}

/** A member of the organization (a seller of a marketplace), in one mode. */
export interface Member {
	/** The member's id: what `onBehalfOf` takes. */
	userUuid: string;
	/** The first name. */
	name: string;
	/** The last name. */
	lastName: string;
	/** The email. */
	email: string;
	/** The mode. */
	test: boolean;
	/** The organization's fee on the member's payments, in percent. */
	organizationFeePercent: number;
	/** When the organization started paying them directly; `null` while it holds their funds (trust layer). */
	trustedAt: string | null;
	/** When they joined in this mode. */
	joinedAt: string;
	/** The currencies their wallets accept. */
	acceptedCurrencyIds: number[];
	/** Their personal space in this mode. */
	spaceUuid: string;
}

/** What the organization holds for a member (trust layer). */
export interface HeldFunds {
	/** The lines not settled yet, oldest first: payments and bills held (positive), and the refunds sent of them (negative). */
	ledgers: LedgerEntry[];
	/** What the organization owes the member, in USD (may be 0 or less). */
	totalAmount: number;
}

/** One held-funds line. */
export interface LedgerEntry {
	/** The line's transaction: `pay@…`, `sub-hist@…` or `refund@…`. */
	txUuid: string;
	/** `payment`, `subscriptionHistory` or `refund`. */
	type: LedgerEntryType;
	/** What the line is, in words. */
	description: string;
	/** On a refund line, the payment or bill it refunds. */
	refundedTxUuid?: string;
	/** What the customer paid (a payment or bill), or what a refund sent back, in USD. */
	amount: number;
	/** A payment's or bill's fees and split; `null` on refund lines. */
	metadata: PaymentMetadata | null;
	/** The currency paid (and refunded). */
	currencyId: number;
	/** What the line counts for in a release, in min units (a decimal string, negative on refunds). */
	owedMinUnits: string;
	/** The same in USD. */
	owedUsd: number;
	/** When the line was recorded. */
	createdAt: string;
}

/** One member's held funds, in the organization's overview. */
export interface MemberHeldFundsSummary {
	/** The member (a removed member still owed too). */
	userUuid: string;
	/** What the organization owes them, in USD. */
	totalAmount: number;
	/** Their lines not settled. */
	count: number;
	/** Their oldest line not settled. */
	oldestAt: string;
}

/** Changes a member's terms (`members.update`). */
export interface UpdateMemberParams {
	/** The organization's fee on the member's payments from now on: 0 to 50, at most 2 decimals. */
	organizationFeePercent: number;
}

/** Pages `members.list` (page size: server default 20, max 100). */
export interface MemberListParams {
	/** The page size (0 or absent = the server's default). */
	limit?: number;
	/** The previous page's `nextCursor` (a member's `userUuid`); absent for the first page. */
	cursor?: string;
}

/** An invitation to join the organization. */
export interface Invitation {
	/** The invitation's id. */
	uuid: string;
	/** A member invitation's mode; `null` for a team invitation. */
	test: boolean | null;
	/** The invited address. */
	email: string;
	/** `admin` (the team) or `user` (a member). */
	role: Role;
	/** True when the organization holds the member's payments until it trusts them; `null` for the team. */
	trustLayer: boolean | null;
	/** The organization's fee on the member's payments, in percent. */
	organizationFeePercent: number;
	/** Where the person goes once they accepted (with `?invitationUuid=<uuid>`). */
	redirectUrl?: string;
	/** When it expires. */
	expiresAt: string;
	/** The account that accepted it. */
	acceptedByUserUuid?: string;
	/** When it was accepted; `null` until then. */
	acceptedAt: string | null;
	/** When it was revoked; `null` unless revoked. */
	revokedAt: string | null;
	/** When it was created. */
	createdAt: string;
	/** `pending`, `accepted`, `revoked` or `expired`. */
	status: InvitationStatus;
}

/** `invitations.create`'s answer. */
export interface InvitationCreated {
	/** The invitation. */
	invitation: Invitation;
	/** The link to accept it, also emailed to the person. */
	link: string;
}

/**
 * Invites a member (`invitations.create`). The SDK always sends role `user`: team invitations
 * are made from the dashboard.
 */
export interface CreateInvitationParams {
	/** Required: the person to invite. */
	email: string;
	/**
	 * Required (always sent): `true` holds the member's payments until the organization trusts
	 * them (`members.trust`); `false` pays them directly.
	 */
	trustLayer: boolean;
	/** The organization's fee on their payments: 0 to 50, at most 2 decimals (absent = 0). */
	organizationFeePercent?: number;
	/** Where the person goes once they accepted (with `?invitationUuid=<uuid>`). */
	redirectUrl?: string;
}

/** Filters `invitations.list` (page size: server default 20, max 100). */
export interface InvitationListParams {
	/** The page size (0 or absent = the server's default). */
	limit?: number;
	/** The previous page's `nextCursor`; absent for the first page. */
	cursor?: string;
	/** Only the invitations with this status. */
	status?: InvitationStatus;
}
