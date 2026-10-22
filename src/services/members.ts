import { type Core, path } from '../core.js';
import type { Page } from '../models/common.js';
import type {
	CreatedInvitation,
	CreateInvitationParams,
	HeldFunds,
	Invitation,
	InvitationListParams,
	Member,
	MemberHeldFunds,
	MemberListParams,
	UpdateMemberParams,
} from '../models/members.js';
import { iteratePages } from '../pagination.js';
import {
	createInvitationBody,
	invitationListQuery,
	pageQuery,
	updateMemberBody,
} from '../params.js';
import {
	CreatedInvitationSchema,
	HeldFundsSchema,
	InvitationSchema,
	MemberHeldFundsSchema,
	MemberSchema,
	page,
} from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathUUID } from '../validate.js';

/**
 * Manages the organization's members, their trust and their held funds (organization key).
 * Reach it as `client.members`.
 */
export class MembersService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the organization's members in the key's mode (`GET /members`; by when they
	 * joined, page size 20 by default, at most 100). Organization key only (403 otherwise, also
	 * with `onBehalfOf`). {@link iterate} walks every page.
	 */
	async list(params?: MemberListParams, options?: RequestOptions): Promise<Page<Member>> {
		const query = pageQuery(params);
		return this.core.call(
			page(MemberSchema),
			{ method: 'GET', path: '/members', query },
			options
		);
	}

	/**
	 * Walks every member {@link list} returns, fetching the pages lazily and keeping the page
	 * size. An error ends the walk. Organization key only.
	 */
	iterate(params?: MemberListParams, options?: RequestOptions): AsyncIterableIterator<Member> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * A member by their user UUID (`GET /members/:userUuid`; `Member.userUuid`, the value
	 * `onBehalfOf` takes). Organization key only. Someone who is not a member in the key's mode is
	 * a `NotFoundError`.
	 */
	async get(userUuid: string, options?: RequestOptions): Promise<Member> {
		checkPathUUID('userUuid', userUuid);
		return this.core.call(
			MemberSchema,
			{ method: 'GET', path: path('/members/:', ['userUuid', userUuid]) },
			options
		);
	}

	/**
	 * Changes a member's organization fee in the key's mode (`PATCH /members/:userUuid`). A
	 * checkout already created keeps the fee it was created with; a running subscription's next
	 * bills take the new one. Organization key only. Not retried.
	 */
	async update(
		userUuid: string,
		params: UpdateMemberParams,
		options?: RequestOptions
	): Promise<Member> {
		checkPathUUID('userUuid', userUuid);
		const body = updateMemberBody(params);
		return this.core.call(
			MemberSchema,
			{ method: 'PATCH', path: path('/members/:', ['userUuid', userUuid]), body },
			options
		);
	}

	/**
	 * Removes a member from the key's mode (`DELETE /members/:userUuid`, 204): their API keys stop
	 * working at once and their checkouts stop taking payments; their data stays with the
	 * organization. Organization key only. Not retried.
	 *
	 * Errors: 409 `held_funds_pending` while the organization holds live funds for them (release
	 * them in the dashboard first).
	 */
	async remove(userUuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('userUuid', userUuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/members/:', ['userUuid', userUuid]) },
			options
		);
	}

	/**
	 * Makes a member's new payments in the key's mode go to their own wallets
	 * (`POST /members/:userUuid/trust`) and returns the member with `trustedAt` set. What the
	 * organization already holds for them stays held until released (in the dashboard).
	 * Organization key only. Not retried.
	 */
	async trust(userUuid: string, options?: RequestOptions): Promise<Member> {
		checkPathUUID('userUuid', userUuid);
		return this.core.call(
			MemberSchema,
			{ method: 'POST', path: path('/members/:/trust', ['userUuid', userUuid]) },
			options
		);
	}

	/**
	 * What the organization holds for each member in the key's mode, the longest held first
	 * (`GET /members/held-funds`; a bounded list). Organization key only.
	 */
	async listHeldFunds(options?: RequestOptions): Promise<MemberHeldFunds[]> {
		return this.core.callItems(
			MemberHeldFundsSchema,
			{ method: 'GET', path: '/members/held-funds' },
			options
		);
	}

	/**
	 * What the organization holds for one member in the key's mode, a removed member's too
	 * (`GET /members/:userUuid/held-funds`): the lines not paid out yet, oldest first, and their
	 * total in USD. Organization key only.
	 */
	async getHeldFunds(userUuid: string, options?: RequestOptions): Promise<HeldFunds> {
		checkPathUUID('userUuid', userUuid);
		return this.core.call(
			HeldFundsSchema,
			{ method: 'GET', path: path('/members/:/held-funds', ['userUuid', userUuid]) },
			options
		);
	}

	/**
	 * What the organization holds for the request's space (`GET /held-funds`): call it with a
	 * member's key, or `onBehalfOf` a member. Empty for the organization's own space (no
	 * `ledgers`, `totalUsd` `"0"`).
	 */
	async getOwnHeldFunds(options?: RequestOptions): Promise<HeldFunds> {
		return this.core.call(HeldFundsSchema, { method: 'GET', path: '/held-funds' }, options);
	}
}

/** Invites members to the organization (`/invitations…`; organization key). Reach it as `client.invitations`. */
export class InvitationsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * Invites someone to join the organization as a member in the key's mode
	 * (`POST /invitations`, 201) and returns the invitation with its `link` (also emailed, unless
	 * `sendEmail` is `false`). The SDK always sends role `user`: the team is invited from the
	 * dashboard. Sends an `Idempotency-Key` and is retried on transient failures. Organization key
	 * only; rate limited (50 an hour per organization, emailed or not: beyond, a `RateLimitError`
	 * at once, the wait being over the SDK's 60 s retry cap).
	 *
	 * The person exists in the organization once they accepted: act on the `member.joined` webhook
	 * (`MemberJoined.invitationUuid`). Errors: 409 `already_joined` for someone already a member
	 * in that mode.
	 */
	async create(
		params: CreateInvitationParams,
		options?: RequestOptions
	): Promise<CreatedInvitation> {
		const body = createInvitationBody(params);
		return this.core.call(
			CreatedInvitationSchema,
			{ method: 'POST', path: '/invitations', body, idempotent: true },
			options
		);
	}

	/**
	 * One page of the organization's invitations (`GET /invitations`; newest first, page size 20
	 * by default, at most 100), its team's (role `admin`) included, optionally filtered by
	 * `status`. Organization key only. {@link iterate} walks every page.
	 */
	async list(params?: InvitationListParams, options?: RequestOptions): Promise<Page<Invitation>> {
		const query = invitationListQuery(params);
		return this.core.call(
			page(InvitationSchema),
			{ method: 'GET', path: '/invitations', query },
			options
		);
	}

	/**
	 * Walks every invitation {@link list} returns, fetching the pages lazily and keeping the
	 * filter and the page size. An error ends the walk. Organization key only.
	 */
	iterate(
		params?: InvitationListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Invitation> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * Revokes an invitation (`DELETE /invitations/:uuid`, 204): its link no longer works.
	 * Organization key only. Not retried.
	 */
	async revoke(uuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('uuid', uuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/invitations/:', ['uuid', uuid]) },
			options
		);
	}
}
