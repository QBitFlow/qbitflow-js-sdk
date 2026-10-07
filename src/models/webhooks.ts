/**
 * Webhook endpoints and the event log.
 *
 * @module
 */

import type { EndpointDisabledReason, EventType, WebhookPayloadVersion } from '../enums.js';
import type { Event } from './events.js';

/** A webhook endpoint of a space. */
export interface WebhookEndpoint {
	/** The endpoint's id. */
	uuid: string;
	/** True in test mode. */
	test: boolean;
	/** Where the events are posted. */
	url: string;
	/** The event types it receives; empty: every type. */
	events: EventType[];
	/** True for an organization endpoint that also receives its members' events. */
	includeMembers: boolean;
	/** `v2` (the event envelope), or `v1` for an endpoint migrated from v1. */
	payloadVersion: WebhookPayloadVersion;
	/** A note for the dashboard. */
	description: string;
	/** When it was created. */
	createdAt: string;
	/** When its secret last changed. */
	rotatedAt?: string;
	/** When it was disabled; absent while enabled. */
	disabledAt?: string;
	/** Why: `failing`, `owner` or `closed`. */
	disabledReason?: EndpointDisabledReason;
	/** When its deliveries started failing. */
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
	/** True when it was not posted (a member's endpoint with `members.webhooks` off). */
	skipped?: boolean;
	/** The endpoint's answer; absent when it didn't answer. */
	statusCode?: number;
	/** Why it wasn't delivered. */
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
	/** The event types to receive (at most 20, not `webhook.test`); absent or empty: every type. */
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
	/** The new URL. */
	url?: string;
	/** Replaces the event types; `[]` means every type. */
	events?: EventType[];
	/** Whether an organization endpoint receives its members' events. */
	includeMembers?: boolean;
	/** The new note; `''` clears it. */
	description?: string;
	/** `v2` moves an endpoint migrated from v1 to the event envelope (never back). */
	payloadVersion?: WebhookPayloadVersion;
	/** `false` pauses the endpoint; `true` enables it again. */
	enabled?: boolean;
}

/** Filters `webhooks.events.list` (page size: server default 20, max 100). */
export interface EventListParams {
	/** The page size (0 or absent = the server's default). */
	limit?: number;
	/** The previous page's `nextCursor` (`evt_…`); absent for the first page. */
	cursor?: string;
	/** Only the events of this type. */
	type?: EventType;
	/** Add the members' events (organization space only). */
	includeMembers?: boolean;
}
