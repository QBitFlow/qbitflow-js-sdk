import { createHmac } from 'node:crypto';

import { QBitFlow } from '../src/client';
import { ValidationError, WebhookSignatureError } from '../src/errors';
import { webhooks } from '../src/index';
import { constructEvent, verify, type VerifyOptions } from '../src/webhooks';
import { thrown } from './helpers/server';

// The shared vector (behaviour §7, docs webhooks.md).
const BODY =
	'{"createdAt":"2026-10-01T12:00:00Z","data":{},"id":"evt_3f1c2d4e-5a6b-5c7d-8e9f-0a1b2c3d4e5f","test":false,"type":"webhook.test","version":"v2"}';
const T = 1790856000;
const NEW = '4a158046f55556e922bdec376a917c3ac338ba575b495f825427541a60bd2f4d'; // whsec_new_secret
const OLD = '1cc78a6297ad96dd282d9d0399def50ed42a4e651885ac79f8528194227bc4f5'; // whsec_old_secret
const HEADER = `t=${T},v1=${NEW},v1=${OLD}`;

const at = (offset: number): VerifyOptions => ({ now: new Date((T + offset) * 1000) });
const sign = (secret: string, t: number | string, body: string | Buffer): string =>
	createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');

/** The reason a verification fails with ('' when it passes). */
function reason(fn: () => void): string {
	try {
		fn();
		return '';
	} catch (err) {
		if (err instanceof WebhookSignatureError) {
			expect(err.status).toBeUndefined();
			return err.reason;
		}
		throw err;
	}
}

describe('verify', () => {
	it('matches the docs vector, with a secret rotation', () => {
		expect(sign('whsec_new_secret', T, BODY)).toBe(NEW);
		expect(sign('whsec_old_secret', T, BODY)).toBe(OLD);
		for (const secret of ['whsec_new_secret', 'whsec_old_secret']) {
			expect(reason(() => verify(BODY, HEADER, secret, at(60)))).toBe('');
		}
		for (const secret of ['whsec_other', 'new_secret', 'whsec_new_secret ']) {
			expect(reason(() => verify(BODY, HEADER, secret, at(60)))).toBe('noMatchingSignature');
		}
		for (const secret of ['whsec_new_secret', 'whsec_old_secret', 'whsec_other']) {
			expect(reason(() => verify(BODY, HEADER, secret, at(360)))).toBe(
				'timestampOutsideTolerance'
			);
		}
	});

	it.each<[number, VerifyOptions, boolean]>([
		[0, {}, true],
		[300, {}, true],
		[301, {}, false],
		[-300, {}, true],
		[-301, {}, false],
		[60, { tolerance: 10 }, false],
		[10, { tolerance: 10 }, true],
		[299, { tolerance: 0 }, true],
		[301, { tolerance: -1 }, false],
		[3000, { tolerance: 3600 }, true],
	])('tolerance: offset %d %p → %s', (offset, options, ok) => {
		expect(
			reason(() =>
				verify(BODY, `t=${T},v1=${NEW}`, 'whsec_new_secret', { ...at(offset), ...options })
			)
		).toBe(ok ? '' : 'timestampOutsideTolerance');
	});

	it('refuses a timestamp in the far future', () => {
		expect(
			reason(() => verify(BODY, `t=9223372036854775807,v1=${NEW}`, 'whsec_new_secret', at(0)))
		).toBe('timestampOutsideTolerance');
	});

	it('accepts the clock as a function', () => {
		expect(
			reason(() =>
				verify(BODY, HEADER, 'whsec_new_secret', { now: () => new Date((T + 1) * 1000) })
			)
		).toBe('');
	});

	const ts = String(T);
	it.each<[string, string | string[] | undefined, string]>([
		['rotation', HEADER, ''],
		['new only', `t=${ts},v1=${NEW}`, ''],
		['v1 first', `v1=${NEW},t=${ts}`, ''],
		['spaces around parts', `  t = ${ts} ,  v1 = ${NEW}  `, ''],
		['bad v1 then good', `t=${ts},v1=deadbeef,v1=${NEW}`, ''],
		['good v1 then bad', `t=${ts},v1=${NEW},v1=deadbeef`, ''],
		['unknown scheme ignored', `t=${ts},v0=${NEW},v1=${NEW},v2=x`, ''],
		['parts without =', `t=${ts},junk,v1=${NEW},`, ''],
		['array header (Node)', [`t=${ts}`, `v1=${NEW}`], ''],
		['empty', '', 'missingHeader'],
		['absent', undefined, 'missingHeader'],
		['blank', '   ', 'missingHeader'],
		['no-break spaces only', '  ', 'missingHeader'],
		['garbage', 'garbage', 'malformedHeader'],
		['no t', `v1=${NEW}`, 'malformedHeader'],
		['no v1', `t=${ts}`, 'malformedHeader'],
		['only unknown scheme', `t=${ts},v0=${NEW}`, 'malformedHeader'],
		['sha256 legacy scheme', `sha256=${NEW}`, 'malformedHeader'],
		['t not a number', `t=abc,v1=${NEW}`, 'malformedHeader'],
		['t negative', `t=-${ts},v1=${NEW}`, 'malformedHeader'],
		['t with sign', `t=+${ts},v1=${NEW}`, 'malformedHeader'],
		['t decimal', `t=${ts}.0,v1=${NEW}`, 'malformedHeader'],
		['t empty', `t=,v1=${NEW}`, 'malformedHeader'],
		['t non-ASCII digits', `t=１７９０８５６０００,v1=${NEW}`, 'malformedHeader'],
		['t overflow', `t=99999999999999999999,v1=${NEW}`, 'malformedHeader'],
		['duplicate t', `t=${ts},t=${ts},v1=${NEW}`, 'malformedHeader'],
		['uppercase hex', `t=${ts},v1=${NEW.toUpperCase()}`, 'noMatchingSignature'],
		['truncated hex', `t=${ts},v1=${NEW.slice(0, 63)}`, 'noMatchingSignature'],
		['value with =', `t=${ts},v1=${NEW}=`, 'noMatchingSignature'],
		['empty v1', `t=${ts},v1=`, 'noMatchingSignature'],
		['other t', `t=1790856001,v1=${NEW}`, 'noMatchingSignature'],
		['leading zero t (signed as received)', `t=0${ts},v1=${NEW}`, 'noMatchingSignature'],
	])('header: %s', (_name, header, want) => {
		expect(reason(() => verify(BODY, header, 'whsec_new_secret', at(30)))).toBe(want);
	});

	it('signs the t text as received, leading zeros included', () => {
		const header = `t=0${T},v1=${sign('whsec_new_secret', `0${T}`, BODY)}`;
		expect(reason(() => verify(BODY, header, 'whsec_new_secret', at(0)))).toBe('');
	});

	it('verifies the raw bytes, never a re-serialization', () => {
		const header = `t=${T},v1=${NEW}`;
		for (const body of [
			BODY.replace('"test":false', '"test":true'),
			BODY.replace(',"id"', ', "id"'),
			`${BODY}\n`,
		]) {
			expect(reason(() => verify(body, header, 'whsec_new_secret', at(0)))).toBe(
				'noMatchingSignature'
			);
		}
		for (const body of [
			Buffer.from('{"name":"Zoë – 李小龙 ☃"}'),
			Buffer.from([0xff, 0xfe, 0x7b, 0x7d]),
			Buffer.alloc(0),
		]) {
			const h = `t=${T},v1=${sign('whsec_new_secret', T, body)}`;
			expect(reason(() => verify(body, h, 'whsec_new_secret', at(0)))).toBe('');
			expect(reason(() => verify(new Uint8Array(body), h, 'whsec_new_secret', at(0)))).toBe(
				''
			);
		}
		// The key is the whole secret, whsec_ prefix included.
		const h = `t=${T},v1=${sign('new_secret', T, BODY)}`;
		expect(reason(() => verify(BODY, h, 'whsec_new_secret', at(0)))).toBe(
			'noMatchingSignature'
		);
		// An empty secret is a configuration error.
		expect(thrown(() => verify(BODY, header, '', at(0)))).toBeInstanceOf(ValidationError);
	});
});

describe('constructEvent', () => {
	it('verifies then parses', () => {
		const e = constructEvent(BODY, HEADER, 'whsec_new_secret', at(60));
		expect(e.id).toBe('evt_3f1c2d4e-5a6b-5c7d-8e9f-0a1b2c3d4e5f');
		expect(e.type).toBe('webhook.test');
		expect(e.version).toBe('v2');
		expect(e.test).toBe(false);
		expect(e.createdAt).toBe('2026-10-01T12:00:00Z');
		expect(e.userUuid).toBeUndefined();
		expect(reason(() => constructEvent(BODY, HEADER, 'whsec_other', at(60)))).toBe(
			'noMatchingSignature'
		);
	});

	it('is the same through the namespace and the client', () => {
		expect(webhooks.constructEvent(BODY, HEADER, 'whsec_old_secret', at(60)).type).toBe(
			'webhook.test'
		);
		const c = new QBitFlow('sk_x');
		expect(() => c.webhooks.verify(BODY, HEADER, 'whsec_old_secret', at(60))).not.toThrow();
		expect(c.webhooks.constructEvent(BODY, HEADER, 'whsec_old_secret', at(60)).type).toBe(
			'webhook.test'
		);
		expect(c.webhooks.parseEvent(BODY).type).toBe('webhook.test');
		expect(webhooks.SIGNATURE_HEADER).toBe('QBitFlow-Signature');
		expect(webhooks.EVENT_ID_HEADER).toBe('QBitFlow-Event-Id');
		expect(webhooks.EVENT_TYPE_HEADER).toBe('QBitFlow-Event-Type');
	});

	it('refuses a v1 body even when signed', () => {
		const v1 = '{"uuid":"pay@x","txType":"payment","status":{"status":"completed"}}';
		const err = thrown(() =>
			constructEvent(
				v1,
				`t=${T},v1=${sign('whsec_new_secret', T, v1)}`,
				'whsec_new_secret',
				at(0)
			)
		) as ValidationError;
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fieldErrors[0].field).toBe('version');
	});
});
