/**
 * Default configuration for the QBitFlow SDK
 */

/** Production API base URL. Override with `QBitFlowConfig.baseUrl` (e.g. for a local server). */
export const DEFAULT_BASE_URL = 'https://api.qbitflow.app/v1';
/** Per-request timeout, in milliseconds. */
export const DEFAULT_TIMEOUT = 30000; // 30 seconds
/** Retry budget for idempotent (GET) requests that fail with a network error or a 5xx. */
export const DEFAULT_MAX_RETRIES = 3;
/**
 * Base delay of the exponential back-off between retries, in milliseconds. Attempt `n`
 * (zero-based) waits `DEFAULT_RETRY_DELAY * 2^n`: 1 s, 2 s, 4 s.
 */
export const DEFAULT_RETRY_DELAY = 1000; // 1 second
