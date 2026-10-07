import { type Core, path } from '../core.js';
import { list } from '../decode.js';
import { encodeBody } from '../encode.js';
import {
	BadRequestError,
	CODE_INVALID_SIGNATURE,
	fieldError,
	WebhookSignatureError,
} from '../errors.js';
import type { Page } from '../models/common.js';
import type { Event } from '../models/events.js';
import type {
	CreateWebhookEndpointParams,
	EventDetail,
	EventListParams,
	UpdateWebhookEndpointParams,
	WebhookEndpoint,
	WebhookEndpointCreated,
} from '../models/webhooks.js';
import { iteratePages } from '../pagination.js';
import { createWebhookEndpointBody, eventListQuery, updateWebhookEndpointBody } from '../params.js';
import {
	EventDetailSchema,
	EventSchema,
	page,
	WebhookEndpointCreatedSchema,
	WebhookEndpointSchema,
} from '../schemas.js';
import type { RequestOptions } from '../transport.js';
import { checkPathRequired, checkPathUUID } from '../validate.js';
import {
	constructEvent,
	parseEvent,
	type RawBody,
	SIGNATURE_HEADER,
	type SignatureHeader,
	verify,
	type VerifyOptions,
} from '../webhooks.js';

/** The largest webhook body `verifyRemote` sends (the API's own limit): 1 MiB. */
const MAX_WEBHOOK_BODY = 1 << 20;

/** Manages the webhook endpoints (`/webhooks/endpoints…`). Reach it as `client.webhooks.endpoints`. */
export class WebhookEndpointsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * The space's webhook endpoints (`GET /webhooks/endpoints`; at most 10, not paginated). A
	 * member's key needs the organization's `members.webhooks` policy (403 `policy_disabled`), as
	 * every endpoints and events method.
	 */
	async list(options?: RequestOptions): Promise<WebhookEndpoint[]> {
		return this.core.call(
			list(WebhookEndpointSchema),
			{ method: 'GET', path: '/webhooks/endpoints' },
			options
		);
	}

	/**
	 * Adds a webhook endpoint to the space (`POST /webhooks/endpoints`, 201). The answer carries
	 * the endpoint's `secret` (`whsec_…`), shown only this once: store it to verify the
	 * deliveries. Sends an `Idempotency-Key` and is retried on transient failures.
	 *
	 * Errors: 400 `validation_failed` (live mode needs https and a public host); 409 `conflict`
	 * beyond 10 endpoints per space and mode.
	 */
	async create(
		params: CreateWebhookEndpointParams,
		options?: RequestOptions
	): Promise<WebhookEndpointCreated> {
		const body = createWebhookEndpointBody(params);
		return this.core.call(
			WebhookEndpointCreatedSchema,
			{ method: 'POST', path: '/webhooks/endpoints', body, idempotent: true },
			options
		);
	}

	/** A webhook endpoint (`GET /webhooks/endpoints/:uuid`). Its secret is never returned again. */
	async get(uuid: string, options?: RequestOptions): Promise<WebhookEndpoint> {
		checkPathUUID('uuid', uuid);
		return this.core.call(
			WebhookEndpointSchema,
			{ method: 'GET', path: path('/webhooks/endpoints/:', ['uuid', uuid]) },
			options
		);
	}

	/**
	 * Changes a webhook endpoint (`PUT /webhooks/endpoints/:uuid`): only the fields given change.
	 * `enabled: false` pauses it, `true` enables it again; `payloadVersion: 'v2'` moves an endpoint
	 * migrated from v1 to the event envelope. Not retried.
	 */
	async update(
		uuid: string,
		params: UpdateWebhookEndpointParams,
		options?: RequestOptions
	): Promise<WebhookEndpoint> {
		checkPathUUID('uuid', uuid);
		const body = updateWebhookEndpointBody(params);
		return this.core.call(
			WebhookEndpointSchema,
			{ method: 'PUT', path: path('/webhooks/endpoints/:', ['uuid', uuid]), body },
			options
		);
	}

	/** Deletes a webhook endpoint (`DELETE /webhooks/endpoints/:uuid`). Not retried. */
	async delete(uuid: string, options?: RequestOptions): Promise<void> {
		checkPathUUID('uuid', uuid);
		await this.core.callVoid(
			{ method: 'DELETE', path: path('/webhooks/endpoints/:', ['uuid', uuid]) },
			options
		);
	}
}

/** Reads the webhook event log (`/webhooks/events…`). Reach it as `client.webhooks.events`. */
export class WebhookEventsService {
	/** @internal */
	constructor(private readonly core: Core) {}

	/**
	 * One page of the space's event log (`GET /webhooks/events`; newest first, page size 20 by
	 * default, at most 100), optionally by `type`; `includeMembers` adds the members' events
	 * (organization key). The cursor is an event id (`evt_…`). Each event's `data` is typed.
	 */
	async list(params?: EventListParams, options?: RequestOptions): Promise<Page<Event>> {
		const query = eventListQuery(params);
		return this.core.call(
			page(EventSchema) as unknown as import('../decode.js').Schema<Page<Event>>,
			{ method: 'GET', path: '/webhooks/events', query },
			options
		);
	}

	/** Walks every event `list` returns, lazily, keeping the filters and the page size. */
	iterate(params?: EventListParams, options?: RequestOptions): AsyncIterableIterator<Event> {
		return iteratePages(params?.cursor, (cursor) => this.list({ ...params, cursor }, options));
	}

	/** An event of the log with its deliveries to the space's endpoints (`GET /webhooks/events/:id`; `evt_…`). */
	async get(id: string, options?: RequestOptions): Promise<EventDetail> {
		checkPathRequired('id', id);
		return this.core.call(
			EventDetailSchema as unknown as import('../decode.js').Schema<EventDetail>,
			{ method: 'GET', path: path('/webhooks/events/:', ['id', id]) },
			options
		);
	}
}

/**
 * Verifies webhook deliveries and manages the endpoints and the event log. Reach it as
 * `client.webhooks`. `verify`, `constructEvent` and `parseEvent` are also available without a
 * client: `import { webhooks } from 'qbitflow'`.
 */
export class WebhooksService {
	/** The webhook endpoints. */
	readonly endpoints: WebhookEndpointsService;
	/** The event log. */
	readonly events: WebhookEventsService;

	/** @internal */
	constructor(private readonly core: Core) {
		this.endpoints = new WebhookEndpointsService(core);
		this.events = new WebhookEventsService(core);
	}

	/** Checks a webhook delivery's signature locally (see `webhooks.verify`). */
	verify(
		rawBody: RawBody,
		signatureHeader: SignatureHeader,
		secret: string,
		options?: VerifyOptions
	): void {
		verify(rawBody, signatureHeader, secret, options);
	}

	/** Verifies and parses a webhook delivery (see `webhooks.constructEvent`). */
	constructEvent(
		rawBody: RawBody,
		signatureHeader: SignatureHeader,
		secret: string,
		options?: VerifyOptions
	): Event {
		return constructEvent(rawBody, signatureHeader, secret, options);
	}

	/** Parses a webhook body without verifying it (see `webhooks.parseEvent`). */
	parseEvent(rawBody: RawBody): Event {
		return parseEvent(rawBody);
	}

	/**
	 * Has the API check a webhook delivery's signature (`POST /webhooks/verify`): `endpointUuid`
	 * is the endpoint that received it, `rawBody` the body exactly as received, `signatureHeader`
	 * its `QBitFlow-Signature` header. The same check as `verify`, made server side with the
	 * endpoint's current secret (useful when you do not store it). Not retried.
	 *
	 * It resolves when the signature is valid. A mismatch, a malformed header, or a timestamp more
	 * than 5 minutes from the server's clock (400 `invalid_signature`) is a
	 * `WebhookSignatureError` with reason `invalidSignature`; an empty header is one with reason
	 * `missingHeader` (nothing is sent). Other errors are thrown as usual. Parse the verified body
	 * with `parseEvent`.
	 */
	async verifyRemote(
		endpointUuid: string,
		rawBody: RawBody,
		signatureHeader: string,
		options?: RequestOptions
	): Promise<void> {
		checkPathUUID('endpointUuid', endpointUuid);
		let body: string;
		let size: number;
		if (typeof rawBody === 'string') {
			body = rawBody;
			size = Buffer.byteLength(rawBody, 'utf8');
		} else if (rawBody instanceof Uint8Array) {
			size = rawBody.byteLength;
			try {
				body = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
			} catch (err) {
				throw fieldError('body', 'must be valid UTF-8', err);
			}
		} else {
			throw fieldError('body', 'is required');
		}
		if (size === 0) throw fieldError('body', 'is required');
		if (size > MAX_WEBHOOK_BODY) throw fieldError('body', 'must be at most 1 MiB');
		if (typeof signatureHeader !== 'string' || signatureHeader === '') {
			throw new WebhookSignatureError({
				message: `missing ${SIGNATURE_HEADER} header`,
				reason: 'missingHeader',
			});
		}
		const payload = { endpointUuid, body, signature: signatureHeader };
		encodeBody(payload); // a body that is not valid Unicode is refused before sending
		try {
			await this.core.callVoid(
				{ method: 'POST', path: '/webhooks/verify', body: payload },
				options
			);
		} catch (err) {
			if (err instanceof BadRequestError && err.code === CODE_INVALID_SIGNATURE) {
				throw new WebhookSignatureError({
					message: err.rawMessage,
					status: err.status,
					code: err.code,
					details: err.details,
					requestId: err.requestId,
					fieldErrors: err.fieldErrors,
					rawBody: err.rawBody,
					reason: 'invalidSignature',
				});
			}
			throw err;
		}
	}
}
