/**
 * Tests for the client-side validation helpers. Every rule mirrors an API `binding` rule.
 */

import {
	cursorQueryBuilder,
	isAlphanumSpace,
	isBareUuid,
	isBlank,
	isValidEmail,
	prepareCreateCustomerBody,
	prepareCreateProductBody,
	prepareSessionBody,
	prepareUpdateCustomerBody,
	prepareUpdateUserBody,
	requireNonEmpty,
	requirePositiveInt,
	validateAccountingExport,
	validateAlphanumSpace,
	validateCreateCustomer,
	validateCreateProduct,
	validateCreateSession,
	validateCreateUser,
	validateDuration,
	validateEmail,
	validateProductText,
	validateRedirectUrl,
	validateUpdateCustomer,
	validateUpdateProduct,
	validateUpdateUser,
} from '../src/utils';
import { ValidationException } from '../src/exceptions';
import { CreateUserDto, UserRole } from '../src/types';

const ch = (code: number): string => String.fromCodePoint(code);

describe('Identifier guards', () => {
	it('requireNonEmpty rejects empty, blank and non-string values', () => {
		for (const bad of ['', '   ', undefined, null, 42]) {
			expect(() => requireNonEmpty('uuid', bad)).toThrow(ValidationException);
			expect(() => requireNonEmpty('uuid', bad)).toThrow('uuid is required');
		}
		expect(() => requireNonEmpty('uuid', 'pay@abc')).not.toThrow();
	});

	it('requirePositiveInt rejects zero, negatives, floats, unsafe integers and strings', () => {
		for (const bad of [0, -1, 1.5, '1', NaN, undefined, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => requirePositiveInt('id', bad)).toThrow(ValidationException);
		}
		expect(() => requirePositiveInt('id', 1)).not.toThrow();
	});
});

describe('alphanumspace (mirrors the API rule)', () => {
	it("accepts letters (incl. accented), decimal digits, spaces and - _ ' .", () => {
		for (const ok of [
			'John',
			"O'Brien",
			'Jean-Luc',
			'Zoë 2',
			'user_1',
			'J. R.',
			'日本',
			'\u0663\u0664',
		]) {
			expect(isAlphanumSpace(ok)).toBe(true);
		}
	});

	it('accepts a whitespace-only value, as the server does', () => {
		expect(isAlphanumSpace('   ')).toBe(true);
		expect(() => validateAlphanumSpace('name', '   ', 2, 100)).not.toThrow();
	});

	it('rejects markup, punctuation the API rejects, and empty strings', () => {
		for (const bad of ['', '<b>', 'a,b', 'a&b', 'a@b', 'hi!', 'a/b', '(x)']) {
			expect(isAlphanumSpace(bad)).toBe(false);
		}
	});

	it('rejects digits that are not decimal digits (Nd), as the server does', () => {
		for (const bad of ['Jo\u00b2', '\u216b', 'half\u00bd']) {
			expect(isAlphanumSpace(bad)).toBe(false);
			expect(() => validateAlphanumSpace('name', bad, 1, 100)).toThrow(ValidationException);
		}
	});

	it('enforces the length bounds in code points', () => {
		expect(() => validateAlphanumSpace('name', 'A', 2, 100)).toThrow('between 2 and 100');
		expect(() => validateAlphanumSpace('name', 'A'.repeat(101), 2, 100)).toThrow();
		expect(() => validateAlphanumSpace('name', 'Ab', 2, 100)).not.toThrow();
		expect(() => validateAlphanumSpace('name', '日本語の製品', 2, 6)).not.toThrow();
	});
});

describe('validateProductText (mirrors the API producttext rule)', () => {
	it('rejects markup characters', () => {
		for (const bad of [
			'<script>x</script>',
			'a{b}',
			'a[b]',
			'back`tick',
			'pipe|d',
			'semi;colon',
			'ti~lde',
			'ca^ret',
			'dq"uote',
		]) {
			expect(() => validateProductText('productName', bad, 2, 100)).toThrow(
				ValidationException
			);
		}
	});

	it('accepts script-looking text that contains no markup', () => {
		expect(() =>
			validateProductText('productName', 'javascript:alert(1)', 2, 100)
		).not.toThrow();
		expect(() =>
			validateProductText('productName', 'Best coffee & tea, 50% off!', 2, 100)
		).not.toThrow();
	});

	it('accepts accented and non-Latin letters', () => {
		expect(() => validateProductText('productName', 'Café Crème', 2, 100)).not.toThrow();
		expect(() => validateProductText('productName', '日本語の製品', 2, 100)).not.toThrow();
	});

	it('enforces the length bounds by code point', () => {
		expect(() => validateProductText('productName', 'A', 2, 100)).toThrow();
		expect(() => validateProductText('productName', 'A'.repeat(101), 2, 100)).toThrow();
		expect(() => validateProductText('productName', 'AB', 2, 100)).not.toThrow();
		// 60 CJK characters are 180 bytes but 60 code points: the server counts runes.
		expect(() => validateProductText('productName', '製'.repeat(60), 2, 100)).not.toThrow();
	});

	it('rejects blank or whitespace-only values, trimming Unicode whitespace like Go', () => {
		expect(() => validateProductText('productName', '', 2, 100)).toThrow();
		expect(() => validateProductText('productName', '   ', 2, 100)).toThrow();
		expect(() => validateProductText('productName', '\u3000\u00a0\u2003', 2, 100)).toThrow(
			'blank'
		);
		expect(isBlank('\u0085\u2028 \t')).toBe(true);
		expect(isBlank('\ufeff')).toBe(false); // not White_Space in Go
	});

	it('rejects control characters (C0 and C1) but allows newlines and tabs', () => {
		expect(() => validateProductText('description', `a${ch(0x00)}b`, 2, 500)).toThrow();
		expect(() => validateProductText('description', `a${ch(0x1b)}b`, 2, 500)).toThrow();
		expect(() => validateProductText('description', `a${ch(0x7f)}b`, 2, 500)).toThrow();
		expect(() => validateProductText('description', `a${ch(0x85)}b`, 2, 500)).toThrow();
		expect(() => validateProductText('description', `a${ch(0x9f)}b`, 2, 500)).toThrow();
		expect(() =>
			validateProductText('description', 'line1\nline2\ttabbed\r\n', 2, 500)
		).not.toThrow();
	});
});

describe('email rule', () => {
	it('accepts ordinary addresses', () => {
		for (const ok of ['a@b.co', 'john.doe+tag@example.com', 'x@sub.domain.technology']) {
			expect(isValidEmail(ok)).toBe(true);
		}
	});

	it('rejects malformed addresses', () => {
		for (const bad of [
			'',
			'plain',
			'@no-local.com',
			'no-domain@',
			'a@b',
			'two@@at.com',
			'sp ace@x.com',
			'a@.com',
			'a@x.',
		]) {
			expect(isValidEmail(bad)).toBe(false);
			expect(() => validateEmail('email', bad)).toThrow(ValidationException);
		}
	});
});

describe('validateRedirectUrl', () => {
	it('accepts absolute http and https URLs, whatever the scheme case', () => {
		expect(() => validateRedirectUrl('successUrl', 'https://example.com/ok')).not.toThrow();
		expect(() => validateRedirectUrl('successUrl', 'HTTPS://Example.com/ok')).not.toThrow();
		expect(() => validateRedirectUrl('successUrl', 'http://localhost:3000/ok')).not.toThrow();
		expect(() =>
			validateRedirectUrl('successUrl', 'https://checkout-web/success')
		).not.toThrow();
	});

	it('rejects non-web schemes, relative paths and garbage', () => {
		for (const bad of [
			'javascript:alert(1)',
			'/relative/path',
			'ftp://example.com',
			'not a url',
			'https://',
			// Accepted by `new URL()` after silent repair, rejected by the API (live-verified).
			'http:///x',
			' https://example.com/ok',
		]) {
			expect(() => validateRedirectUrl('successUrl', bad)).toThrow(ValidationException);
		}
	});
});

describe('validateDuration', () => {
	it('accepts a positive value with a known unit', () => {
		for (const unit of [
			'seconds',
			'minutes',
			'hours',
			'days',
			'weeks',
			'months',
			'years',
		] as const) {
			expect(() => validateDuration('frequency', { value: 1, unit })).not.toThrow();
		}
	});

	it('rejects zero, negative and fractional values and unknown units', () => {
		expect(() => validateDuration('frequency', { value: 0, unit: 'months' })).toThrow(
			'frequency.value'
		);
		expect(() => validateDuration('frequency', { value: -1, unit: 'months' })).toThrow();
		expect(() => validateDuration('frequency', { value: 1.5, unit: 'months' })).toThrow();
		expect(() => validateDuration('frequency', { value: 1, unit: 'fortnights' })).toThrow(
			'frequency.unit'
		);
		expect(() => validateDuration('frequency', undefined)).toThrow();
	});
});

describe('DTO validators', () => {
	describe('customers', () => {
		it('create requires alphanumspace names (2–100) and a valid email', () => {
			expect(() =>
				validateCreateCustomer({ name: 'John', lastName: 'Doe', email: 'j@d.com' })
			).not.toThrow();
			expect(() =>
				validateCreateCustomer({ name: 'J', lastName: 'Doe', email: 'j@d.com' })
			).toThrow('name');
			expect(() =>
				validateCreateCustomer({ name: 'John', lastName: 'Do<e>', email: 'j@d.com' })
			).toThrow('lastName');
			expect(() =>
				validateCreateCustomer({ name: 'John', lastName: 'Doe', email: 'nope' })
			).toThrow('email');
		});

		it('update validates only the provided, non-empty fields', () => {
			expect(() => validateUpdateCustomer({})).not.toThrow();
			expect(() => validateUpdateCustomer({ name: '' })).not.toThrow(); // empty = not provided
			expect(() => validateUpdateCustomer({ name: 'J' })).toThrow('name');
			expect(() => validateUpdateCustomer({ email: 'bad' })).toThrow('email');
			expect(() => validateUpdateCustomer({ phoneNumber: 'anything goes!' })).not.toThrow();
		});
	});

	describe('users', () => {
		it('create requires names, email, role admin|user and fee 0–5000', () => {
			const ok: CreateUserDto = {
				name: 'Alice',
				lastName: 'Smith',
				email: 'a@s.com',
				role: UserRole.USER,
			};
			expect(() => validateCreateUser(ok)).not.toThrow();
			expect(() => validateCreateUser({ ...ok, organizationFeeBps: 5000 })).not.toThrow();
			expect(() => validateCreateUser({ ...ok, organizationFeeBps: 5001 })).toThrow(
				'organizationFeeBps'
			);
			expect(() => validateCreateUser({ ...ok, organizationFeeBps: -1 })).toThrow();
			expect(() =>
				validateCreateUser({ ...ok, role: 'owner' as unknown as UserRole.USER })
			).toThrow('role');
		});

		it('update validates only the provided fields', () => {
			expect(() => validateUpdateUser({})).not.toThrow();
			expect(() => validateUpdateUser({ organizationFeeBps: 250 })).not.toThrow();
			expect(() => validateUpdateUser({ organizationFeeBps: 6000 })).toThrow();
			expect(() => validateUpdateUser({ name: 'A' })).toThrow();
		});
	});

	describe('products', () => {
		it('create requires producttext name/description and price > 0', () => {
			expect(() =>
				validateCreateProduct({ name: 'Widget', description: 'A fine widget', price: 9.99 })
			).not.toThrow();
			expect(() =>
				validateCreateProduct({ name: 'Widget', description: 'A fine widget', price: 0 })
			).toThrow('price');
			expect(() =>
				validateCreateProduct({ name: 'Widget', description: 'A fine widget', price: -1 })
			).toThrow('price');
			expect(() =>
				validateCreateProduct({ name: '<b>', description: 'A fine widget', price: 1 })
			).toThrow('name');
			expect(() =>
				validateCreateProduct({ name: 'Widget', description: 'x', price: 1 })
			).toThrow('description');
		});

		it('update validates only the provided fields, price > 0, rejects an empty name', () => {
			expect(() => validateUpdateProduct({})).not.toThrow();
			expect(() => validateUpdateProduct({ price: 42.5 })).not.toThrow();
			expect(() => validateUpdateProduct({ price: 0 })).toThrow('price');
			expect(() => validateUpdateProduct({ price: Infinity })).toThrow('price');
			expect(() => validateUpdateProduct({ name: '<x>' })).toThrow('name');
			expect(() => validateUpdateProduct({ name: '' })).toThrow('name');
			expect(() => validateUpdateProduct({ description: '' })).toThrow('description');
		});
	});

	describe('sessions', () => {
		it('accepts productId, productReference, or the inline triple', () => {
			expect(() => validateCreateSession({ productId: 1 })).not.toThrow();
			expect(() => validateCreateSession({ productReference: 'PROD-1' })).not.toThrow();
			expect(() =>
				validateCreateSession({
					productName: 'Product',
					description: 'Description',
					price: 99.99,
				})
			).not.toThrow();
		});

		it('rejects a missing or partial product identification', () => {
			expect(() => validateCreateSession({})).toThrow(
				'Either productId, productReference, or productName, description and price must be provided'
			);
			expect(() => validateCreateSession({ productName: 'Product' })).toThrow();
			expect(() => validateCreateSession({ productId: 0 })).toThrow('productId');
			expect(() => validateCreateSession({ productId: -3 })).toThrow('productId');
		});

		it('requires a price greater than 0 (the server rejects an inline price of 0)', () => {
			for (const price of [0, -10, NaN, Infinity]) {
				expect(() =>
					validateCreateSession({ productName: 'Free', description: 'Gratis', price })
				).toThrow('price must be greater than 0');
			}
			expect(() =>
				validateCreateSession({ productName: 'Paid', description: 'Priced', price: 0.01 })
			).not.toThrow();
		});

		it('validates customerUUID: empty = not provided, otherwise a bare UUID', () => {
			const uuid = '01997c89-d0e9-7c9a-9886-fe7709919695';
			expect(() => validateCreateSession({ productId: 1, customerUUID: '' })).not.toThrow();
			expect(() => validateCreateSession({ productId: 1, customerUUID: uuid })).not.toThrow();
			expect(() =>
				validateCreateSession({ productId: 1, customerUUID: uuid.toUpperCase() })
			).not.toThrow();
			for (const bad of ['customer-uuid', `pay@${uuid}`, `${uuid}x`, ' ' + uuid]) {
				expect(() => validateCreateSession({ productId: 1, customerUUID: bad })).toThrow(
					'customerUUID'
				);
			}
			expect(isBareUuid(uuid)).toBe(true);
			expect(prepareSessionBody({ productId: 1, customerUUID: '' }, 'payment')).toEqual({
				productId: 1,
			});
		});

		it('treats an empty optional field as not provided', () => {
			expect(() =>
				validateCreateSession({
					productId: 1,
					successUrl: '',
					cancelUrl: '',
					productName: '',
					description: '',
				})
			).not.toThrow();
		});

		it('rejects markup in an inline product name and bad redirect URLs', () => {
			expect(() =>
				validateCreateSession({
					productName: '<script>alert(1)</script>',
					description: 'A fine description',
					price: 9.99,
				})
			).toThrow();
			expect(() =>
				validateCreateSession({ productId: 1, successUrl: 'javascript:alert(1)' })
			).toThrow('successUrl');
		});

		it('validates subscription durations and minPeriods (uint32 bounds, 0 allowed where the server allows it)', () => {
			const month = { value: 1, unit: 'months' } as const;
			expect(() => validateCreateSession({ productId: 1, frequency: month })).not.toThrow();
			expect(() =>
				validateCreateSession({ productId: 1, frequency: { value: 0, unit: 'months' } })
			).toThrow('frequency.value');
			expect(() =>
				validateCreateSession({
					productId: 1,
					frequency: { value: 4294967296, unit: 'seconds' },
				})
			).toThrow('frequency.value');
			expect(() =>
				validateCreateSession({
					productId: 1,
					frequency: { value: 4294967295, unit: 'seconds' },
				})
			).not.toThrow();
			// trialPeriod.value 0 and minPeriods 0 are accepted by the server.
			expect(() =>
				validateCreateSession({
					productId: 1,
					frequency: month,
					trialPeriod: { value: 0, unit: 'days' },
					minPeriods: 0,
				})
			).not.toThrow();
			expect(() =>
				validateCreateSession({
					productId: 1,
					frequency: month,
					trialPeriod: { value: -1, unit: 'days' },
				})
			).toThrow('trialPeriod.value');
			for (const minPeriods of [-1, 1.5, 4294967296]) {
				expect(() =>
					validateCreateSession({ productId: 1, frequency: month, minPeriods })
				).toThrow('minPeriods');
			}
			expect(
				prepareSessionBody(
					{ productId: 1, frequency: month, minPeriods: 0 },
					'subscription'
				)
			).toEqual({ productId: 1, frequency: month });
		});

		it('requires frequency at runtime for a subscription session', () => {
			expect(() => validateCreateSession({ productId: 1 }, 'subscription')).toThrow(
				'frequency is required'
			);
			expect(() => prepareSessionBody({ productId: 1 } as never, 'subscription')).toThrow(
				'frequency is required'
			);
			expect(() => validateCreateSession({ productId: 1 }, 'payment')).not.toThrow();
		});
	});

	describe('accounting export', () => {
		it('accepts any valid window — the API decides how wide it may be', () => {
			expect(() =>
				validateAccountingExport('2024-01-01', '2024-03-31', 'json')
			).not.toThrow();
			expect(() => validateAccountingExport('2024-01-01', '2024-04-05', 'csv')).not.toThrow(); // 95 days
			expect(() => validateAccountingExport('2024-01-01', '2025-01-01', 'csv')).not.toThrow();
			expect(() => validateAccountingExport('2024-01-15', '2024-01-15', 'csv')).not.toThrow();
		});

		it('rejects malformed, impossible or inverted windows and unknown formats', () => {
			expect(() => validateAccountingExport('', '2024-01-31', 'json')).toThrow('from');
			expect(() => validateAccountingExport('2024/01/01', '2024-01-31', 'json')).toThrow(
				'YYYY-MM-DD'
			);
			expect(() => validateAccountingExport('2024-02-30', '2024-03-31', 'json')).toThrow(
				'calendar'
			);
			expect(() => validateAccountingExport('2024-03-01', '2024-01-01', 'json')).toThrow(
				"'from' must not be after 'to'"
			);
			expect(() => validateAccountingExport('0099-02-29', '0099-03-01', 'json')).toThrow(
				'calendar'
			);
			expect(() =>
				validateAccountingExport('2024-01-01', '2024-01-31', 'xml' as unknown as 'json')
			).toThrow('format');
		});
	});
});

describe('request bodies', () => {
	it('leave empty optional strings out', () => {
		expect(
			prepareCreateCustomerBody({
				name: 'John',
				lastName: 'Doe',
				email: 'j@d.com',
				phoneNumber: '',
				address: '',
				reference: '',
			})
		).toEqual({ name: 'John', lastName: 'Doe', email: 'j@d.com' });
		expect(prepareUpdateCustomerBody({ name: '', lastName: 'Doe', phoneNumber: '' })).toEqual({
			lastName: 'Doe',
		});
		expect(prepareUpdateUserBody({ email: '', organizationFeeBps: 0 })).toEqual({
			organizationFeeBps: 0,
		});
		expect(
			prepareCreateProductBody({
				name: 'Widget',
				description: 'A widget',
				price: 2,
				reference: '',
			})
		).toEqual({ name: 'Widget', description: 'A widget', price: 2 });
		expect(
			prepareSessionBody(
				{ productReference: 'P-1', reference: '', successUrl: '', cancelUrl: '' },
				'payment'
			)
		).toEqual({ productReference: 'P-1' });
	});

	it('reject a non-string optional field', () => {
		expect(() =>
			prepareSessionBody({ productId: 1, reference: 5 as unknown as string }, 'payment')
		).toThrow('reference must be a string');
	});
});

describe('cursorQueryBuilder', () => {
	it('passes limit and cursor through and drops a null cursor', () => {
		expect(cursorQueryBuilder(10, null)).toEqual({ limit: 10, cursor: undefined });
		expect(cursorQueryBuilder(undefined, 'abc')).toEqual({ limit: undefined, cursor: 'abc' });
	});

	it('rejects a non-positive limit', () => {
		expect(() => cursorQueryBuilder(0)).toThrow(ValidationException);
		expect(() => cursorQueryBuilder(-5)).toThrow(ValidationException);
	});
});
