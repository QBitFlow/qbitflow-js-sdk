/**
 * Integration helpers usable without a client: subscription access, exact amount conversions and
 * the redirect placeholders.
 *
 * @module
 */

import { fieldError } from './errors.js';
import type { Subscription } from './models/subscriptions.js';

/**
 * The placeholders `successUrl` and `cancelUrl` may carry: QBitFlow replaces them on the
 * customer's redirect (literally: the SDK never URL-encodes them).
 *
 * ```ts
 * successUrl: `https://shop.example.com/thanks?session=${Placeholders.UUID}`
 * ```
 */
export const Placeholders = {
	/** The checkout session's id (`pay@…` or `sub@…`). */
	UUID: '{{UUID}}',
	/** The transaction's type: `payment` or `createSubscription`. */
	TRANSACTION_TYPE: '{{TRANSACTION_TYPE}}',
} as const;

/**
 * Whether a subscription grants access at `at` (default now): its `currentPeriodEnd` is set and
 * `at` is before it, whatever its status (a cancelled subscription keeps the period paid for).
 * Works on every model carrying `currentPeriodEnd` (a `Subscription`, the data of the
 * `subscription.*` events).
 */
export function hasAccess(
	subscription: Pick<Subscription, 'currentPeriodEnd'>,
	at: Date = new Date()
): boolean {
	const end = subscription?.currentPeriodEnd;
	if (typeof end !== 'string' || end === '') return false;
	const endMs = Date.parse(end);
	const atMs = at instanceof Date ? at.getTime() : Number.NaN;
	return Number.isFinite(endMs) && Number.isFinite(atMs) && atMs < endMs;
}

/** The largest number of decimals accepted (a uint256 has 78 digits). */
const MAX_DECIMALS = 77;

function checkDecimals(decimals: unknown): asserts decimals is number {
	if (
		typeof decimals !== 'number' ||
		!Number.isInteger(decimals) ||
		decimals < 0 ||
		decimals > MAX_DECIMALS
	) {
		throw fieldError('decimals', `must be an integer between 0 and ${MAX_DECIMALS}`);
	}
}

/** Leading zeros removed (`''` → `'0'`). */
const trimLeadingZeros = (digits: string): string => digits.replace(/^0+/, '') || '0';

/**
 * An amount in a token's smallest unit as a decimal string: `formatAmount('1500000', 6)` is
 * `'1.5'`. Exact (string arithmetic, never floats): the fraction's trailing zeros and the leading
 * zeros are trimmed, and there is no exponent. Pass the currency's `decimals`
 * (`formatAmount(payment.amountMinUnits, payment.currency.decimals)`). A `minUnits` that is not
 * `-?[0-9]+`, or `decimals` outside 0–77, is a `ValidationError`.
 */
export function formatAmount(minUnits: string, decimals: number): string {
	if (typeof minUnits !== 'string' || !/^-?[0-9]+$/.test(minUnits)) {
		throw fieldError(
			'minUnits',
			'must be an integer in min units (digits, optionally negative)'
		);
	}
	checkDecimals(decimals);
	const negative = minUnits.startsWith('-');
	const digits = trimLeadingZeros(negative ? minUnits.slice(1) : minUnits);
	if (digits === '0') return '0';
	const padded = digits.padStart(decimals + 1, '0');
	const whole = padded.slice(0, padded.length - decimals);
	const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '');
	return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`;
}

/**
 * A decimal amount converted to a token's smallest unit: `parseAmount('1.5', 6)` is `'1500000'`.
 * Exact (string arithmetic). It accepts `-?[0-9]+(\.[0-9]+)?` only (no exponent, no grouping);
 * more fractional digits than `decimals`, or `decimals` outside 0–77, is a `ValidationError`.
 */
export function parseAmount(amount: string, decimals: number): string {
	const m = typeof amount === 'string' ? /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(amount) : null;
	if (!m) throw fieldError('amount', 'must be a decimal number (e.g. 1.5)');
	checkDecimals(decimals);
	const [, sign, whole, fraction = ''] = m;
	if (fraction.length > decimals) {
		throw fieldError('amount', `has more than ${decimals} decimals`);
	}
	const digits = trimLeadingZeros(whole + fraction.padEnd(decimals, '0'));
	return digits === '0' ? '0' : `${sign}${digits}`;
}
