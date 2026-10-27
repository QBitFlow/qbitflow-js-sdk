/**
 * Webhook endpoints and the event log.
 *
 * @module
 */

import type { EndpointDisabledReason, EventType } from '../enums.js';
import type { PageParams } from './common.js';
import type { Event } from './events.js';

/** A webhook endpoint of a space. */
export interface WebhookEndpoint {
	/** The endpoint's id. */
	uuid: string;
	/** True in test mode. */
	test: boolean;
	/** Where the events are posted. */
	url: string;
	/**
	 * The event types it receives (stored sorted, without duplicates); `[]`: every type, including
	 * types added later.
	 */
	events: EventType[];
	/** True for an organization endpoint that also receives its members' events. */
	includeMembers: boolean;
	/** A note for the dashboard; absent when none. */
	description?: string;
	/** When it was created. */
	createdAt: string;
	/**
	 * When it was disabled (it receives nothing): after 3 days without a successful delivery
	 * (live mode only), or by its owner; absent while enabled. `update` with `enabled: true`
	 * enables it again.
	 */
	disabledAt?: string;
	/**
	 * Why: `failing` (live mode only: a test-mode endpoint is never disabled for failing), `owner`
	 * or `closed`.
	 */
	disabledReason?: EndpointDisabledReason;
	/** When its deliveries started failing (live mode: failing for 3 days, it is disabled). */
	failingSince?: string;
	/** Its last successful delivery. */
	lastDeliveredAt?: string;
}

/** `webhooks.endpoints.create`'s answer: the endpoint and its secret. */
export interface WebhookEndpointCreated extends WebhookEndpoint {
	/** The secret (`whsec_…`) that verifies its deliveries' signature. Shown once: store it. */
	secret: string;
}

/** An event of the log with its deliveries (`webhooks.events.get`). */
export type EventDetail = Event & {
	/** Its deliveries to the space's endpoints. */
	deliveries: EndpointDelivery[];
};

/** An event's deliveries to one endpoint. */
export interface EndpointDelivery {
	/** The endpoint. */
	endpointUuid: string;
	/** The endpoint's URL now. */
	url: string;
	/** True when one attempt was answered with a 2xx. */
	delivered: boolean;
	/** Its attempts, oldest first. */
	attempts: DeliveryAttempt[];
}

/** One attempt to deliver an event to an endpoint. */
export interface DeliveryAttempt {
	/** The attempt's id. */
	uuid: string;
	/** The event (`evt_…`). */
	eventId: string;
	/** The event's type. */
	eventType: EventType;
	/** The endpoint. */
	endpointUuid: string;
	/** 1 for the first, then one more per retry or resend. */
	attempt: number;
	/** True when the endpoint answered with a 2xx. */
	delivered: boolean;
	/**
	 * True when it was not posted: a member's endpoint while the organization's `members.webhooks`
	 * policy was off for them (never retried; not counted against the endpoint's health). The API
	 * leaves it out when false.
	 */
	skipped: boolean;
	/** The endpoint's HTTP status; absent when it didn't answer, or nothing was posted (`skipped`). */
	statusCode?: number;
	/** Why it wasn't delivered (for a skipped attempt: the policy is off); absent when delivered. */
	error?: string;
	/** How long it took, in milliseconds. */
	durationMs: number;
	/** When it was made. */
	attemptedAt: string;
}

/** Creates a webhook endpoint (`webhooks.endpoints.create`). */
export interface CreateWebhookEndpointParams {
	/** Required: where the events are posted (https and a public host in live mode). */
	url: string;
	/**
	 * The event types to receive (at most 20, not `webhook.test`; an unknown type is the API's
	 * 400); absent or `[]`: every type, including types added later.
	 */
	events?: EventType[];
	/**
	 * Make an organization endpoint receive its members' events too (absent: `true` for an
	 * organization endpoint, `false` for a member's).
	 */
	includeMembers?: boolean;
	/** A note for the dashboard (at most 200 characters). */
	description?: string;
}

/** Updates a webhook endpoint (`webhooks.endpoints.update`): fields left out are unchanged. */
export interface UpdateWebhookEndpointParams {
	/** The new URL (absent or `''` = unchanged). */
	url?: string;
	/**
	 * Replaces the event types (at most 20, not `webhook.test`): absent leaves them unchanged,
	 * `[]` means every type.
	 */
	events?: EventType[];
	/** Changes whether an organization endpoint receives its members' events. */
	includeMembers?: boolean;
	/** The new note; `''` clears it, absent leaves it unchanged. */
	description?: string;
	/**
	 * `false` pauses the endpoint (it receives nothing, deliveries in progress stop); `true`
	 * enables it again, also after it was disabled for failing.
	 */
	enabled?: boolean;
}

/** Pages `webhooks.endpoints.list`. */
export type EndpointListParams = PageParams;

/** Filters `webhooks.events.list`. */
export interface EventListParams extends PageParams {
	/**
	 * Only the events of this type. Not checked against the SDK's known types (newer ones appear
	 * over time); an unknown type is the API's 400.
	 */
	type?: EventType;
	/** Add the members' events (organization space only; 400 from a member's). */
	includeMembers?: boolean;
}
