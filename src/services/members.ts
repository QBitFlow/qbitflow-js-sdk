import { type Core, path } from '../core.js';
import { list } from '../decode.js';
import type { Page } from '../models/common.js';
import type {
	CreateInvitationParams,
	HeldFunds,
	Invitation,
	InvitationCreated,
	InvitationListParams,
	Member,
	MemberHeldFundsSummary,
	MemberListParams,
	UpdateMemberParams,
} from '../models/members.js';
import { iteratePages } from '../pagination.js';
import {
	createInvitationBody,
	invitationListQuery,
	memberListQuery,
	updateMemberBody,
} from '../params.js';
import {
	HeldFundsSchema,
	InvitationCreatedSchema,
	InvitationSchema,
	MemberHeldFundsSummarySchema,
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
	 * One page of the organization's members in the key's mode (`GET /members`; by user UUID,
	 * page size 20 by default, at most 100). Organization key only (403 otherwise, also with
	 * `onBehalfOf`).
	 */
	async list(params?: MemberListParams, options?: RequestOptions): Promise<Page<Member>> {
		const query = memberListQuery(params);
		return this.core.call(
			page(MemberSchema),
			{ method: 'GET', path: '/members', query },
			options
		);
	}

	/** Walks every member `list` returns, lazily, keeping the page size. */
	iterate(params?: MemberListParams, options?: RequestOptions): AsyncIterableIterator<Member> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/**
	 * A member by their user UUID (`GET /members/:userUuid`; `member.userUuid`, the value
	 * `onBehalfOf` takes). Someone who is not a member in the key's mode is a `NotFoundError`.
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
	 * Changes a member's organization fee in the key's mode (`PUT /members/:userUuid`). A
	 * checkout already created keeps the fee it was created with. Not retried.
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
			{ method: 'PUT', path: path('/members/:', ['userUuid', userUuid]), body },
			options
		);
	}

	/**
	 * Removes a member from the key's mode (`DELETE /members/:userUuid`): their API keys stop
	 * working at once and their checkouts stop taking payments; their data stays with the
	 * organization. Not retried. Errors: 409 `held_funds_pending` while the organization holds
	 * live funds for them.
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
	 * organization already holds for them stays held until released. Not retried.
	 */
	async trust(userUuid: string, options?: RequestOptions): Promise<Member> {
		checkPathUUID('userUuid', userUuid);
		return this.core.call(
			MemberSchema,
			{ method: 'POST', path: path('/members/:/trust', ['userUuid', userUuid]) },
			options
		);
	}

	/** What the organization holds for each member in the key's mode (`GET /members/held-funds`). */
	async listHeldFunds(options?: RequestOptions): Promise<MemberHeldFundsSummary[]> {
		return this.core.call(
			list(MemberHeldFundsSummarySchema),
			{ method: 'GET', path: '/members/held-funds' },
			options
		);
	}

	/**
	 * What the organization holds for one member in the key's mode, a removed member's too
	 * (`GET /members/:userUuid/held-funds`): the lines not paid out yet, oldest first, and their
	 * total in USD.
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
	 * What the organization holds for the request's space (`GET /user/held-funds`): call it with
	 * a member's key, or `onBehalfOf` a member. Empty for the organization's own space.
	 */
	async getOwnHeldFunds(options?: RequestOptions): Promise<HeldFunds> {
		return this.core.call(
			HeldFundsSchema,
			{ method: 'GET', path: '/user/held-funds' },
			options
		);
	}
}

/** Invites members to the organization (organization key). Reach it as `client.invitations`. */
export class InvitationsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * Invites someone to join the organization as a member in the key's mode
	 * (`POST /invitations`, 201) and returns the invitation and its link (also emailed). The SDK
	 * always sends role `user`. Sends an `Idempotency-Key` and is retried on transient failures.
	 * Rate limited (50 an hour per organization).
	 *
	 * The person exists in the organization once they accepted: act on the `member.joined`
	 * webhook (`data.invitationUuid`). Errors: 409 `already_joined`.
	 */
	async create(
		params: CreateInvitationParams,
		options?: RequestOptions
	): Promise<InvitationCreated> {
		const body = createInvitationBody(params);
		return this.core.call(
			InvitationCreatedSchema,
			{ method: 'POST', path: '/invitations', body, idempotent: true },
			options
		);
	}

	/** One page of the organization's invitations (`GET /invitations`; page size 20 by default, at most 100), optionally by `status`. */
	async list(params?: InvitationListParams, options?: RequestOptions): Promise<Page<Invitation>> {
		const query = invitationListQuery(params);
		return this.core.call(
			page(InvitationSchema),
			{ method: 'GET', path: '/invitations', query },
			options
		);
	}

	/** Walks every invitation `list` returns, lazily, keeping the filter and the page size. */
	iterate(
		params?: InvitationListParams,
		options?: RequestOptions
	): AsyncIterableIterator<Invitation> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/** Revokes an invitation (`DELETE /invitations/:uuid`) and returns it. Not retried. */
	async revoke(uuid: string, options?: RequestOptions): Promise<Invitation> {
		checkPathUUID('uuid', uuid);
		return this.core.call(
			InvitationSchema,
			{ method: 'DELETE', path: path('/invitations/:', ['uuid', uuid]) },
			options
		);
	}
}
