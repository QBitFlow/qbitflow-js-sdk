/**
 * Tests for utility functions
 */

import {
	convertKeysToSnakeCase,
	convertKeysToCamelCase,
	validateRequiredFields,
	validateCreateSession,
	validateProductText,
	validateRedirectUrl,
} from '../src/utils';

describe('Utility Functions', () => {
	describe('convertKeysToSnakeCase', () => {
		it('should convert camelCase keys to snake_case', () => {
			const input = {
				firstName: 'John',
				lastName: 'Doe',
				emailAddress: 'john@example.com',
			};
			const expected = {
				first_name: 'John',
				last_name: 'Doe',
				email_address: 'john@example.com',
			};
			expect(convertKeysToSnakeCase(input)).toEqual(expected);
		});

		it('should handle nested objects', () => {
			const input = {
				userName: 'john',
				userDetails: {
					firstName: 'John',
					lastName: 'Doe',
				},
			};
			const expected = {
				user_name: 'john',
				user_details: {
					first_name: 'John',
					last_name: 'Doe',
				},
			};
			expect(convertKeysToSnakeCase(input)).toEqual(expected);
		});

		it('should handle arrays', () => {
			const input = {
				userList: [{ firstName: 'John' }, { firstName: 'Jane' }],
			};
			const expected = {
				user_list: [{ first_name: 'John' }, { first_name: 'Jane' }],
			};
			expect(convertKeysToSnakeCase(input)).toEqual(expected);
		});

		it('should return primitive values unchanged', () => {
			expect(convertKeysToSnakeCase('test')).toBe('test');
			expect(convertKeysToSnakeCase(123)).toBe(123);
			expect(convertKeysToSnakeCase(null)).toBe(null);
		});
	});

	describe('convertKeysToCamelCase', () => {
		it('should convert snake_case keys to camelCase', () => {
			const input = {
				first_name: 'John',
				last_name: 'Doe',
				email_address: 'john@example.com',
			};
			const expected = {
				firstName: 'John',
				lastName: 'Doe',
				emailAddress: 'john@example.com',
			};
			expect(convertKeysToCamelCase(input)).toEqual(expected);
		});

		it('should handle nested objects', () => {
			const input = {
				user_name: 'john',
				user_details: {
					first_name: 'John',
					last_name: 'Doe',
				},
			};
			const expected = {
				userName: 'john',
				userDetails: {
					firstName: 'John',
					lastName: 'Doe',
				},
			};
			expect(convertKeysToCamelCase(input)).toEqual(expected);
		});
	});

	describe('validateRequiredFields', () => {
		it('should not throw for valid objects', () => {
			const obj = { name: 'John', age: 30 };
			expect(() => validateRequiredFields(obj, ['name', 'age'])).not.toThrow();
		});

		it('should throw for missing fields', () => {
			const obj = { name: 'John' };
			expect(() => validateRequiredFields(obj, ['name', 'age'])).toThrow(
				'Missing required fields: age'
			);
		});

		it('should throw for multiple missing fields', () => {
			const obj = { name: 'John' };
			expect(() => validateRequiredFields(obj, ['name', 'age', 'email'])).toThrow(
				'Missing required fields: age, email'
			);
		});
	});

	describe('validateCreateSession', () => {
		it('should validate with productId', () => {
			const dto = { productId: 1 };
			expect(() => validateCreateSession(dto)).not.toThrow();
		});

		it('should validate with product details', () => {
			const dto = {
				productName: 'Product',
				description: 'Description',
				price: 99.99,
			};
			expect(() => validateCreateSession(dto)).not.toThrow();
		});

		it('should throw when neither productId nor details provided', () => {
			const dto = {};
			expect(() => validateCreateSession(dto)).toThrow(
				'Either productId, productReference, or productName, description and price must be provided'
			);
		});

		it('should throw when product details are incomplete', () => {
			const dto = { productName: 'Product' };
			expect(() => validateCreateSession(dto)).toThrow(
				'Either productId, productReference, or productName, description and price must be provided'
			);
		});

		it('should throw for negative price', () => {
			const dto = {
				productName: 'Product',
				description: 'Description',
				price: -10,
			};
			expect(() => validateCreateSession(dto)).toThrow('Price must be a non-negative value');
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
			]) {
				expect(() => validateProductText('productName', bad, 2, 100)).toThrow();
			}
		});

		it('accepts script-looking text that contains no markup', () => {
			// producttext blocks markup characters, not script-like wording: the server
			// renders these fields as escaped text.
			expect(() =>
				validateProductText('productName', 'javascript:alert(1)', 2, 100)
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
		});

		it('rejects blank or whitespace-only values', () => {
			expect(() => validateProductText('productName', '', 2, 100)).toThrow();
			expect(() => validateProductText('productName', '   ', 2, 100)).toThrow();
		});

		it('rejects control characters but allows newlines and tabs', () => {
			expect(() => validateProductText('description', 'a\u0000b', 2, 500)).toThrow();
			expect(() =>
				validateProductText('description', 'line1\nline2\ttabbed', 2, 500)
			).not.toThrow();
		});
	});

	describe('validateRedirectUrl', () => {
		it('accepts absolute http and https URLs', () => {
			expect(() => validateRedirectUrl('successUrl', 'https://example.com/ok')).not.toThrow();
			expect(() =>
				validateRedirectUrl('successUrl', 'http://localhost:3000/ok')
			).not.toThrow();
		});

		it('rejects non-web schemes, relative paths and garbage', () => {
			for (const bad of [
				'javascript:alert(1)',
				'/relative/path',
				'ftp://example.com',
				'not a url',
			]) {
				expect(() => validateRedirectUrl('successUrl', bad)).toThrow();
			}
		});
	});

	describe('validateCreateSession product identification', () => {
		it('accepts a session identified only by productReference', () => {
			// productReference is a valid alternative to productId; it must not be rejected.
			expect(() => validateCreateSession({ productReference: 'PROD-1' })).not.toThrow();
		});

		it('treats an empty optional field as not provided', () => {
			// The API's omitempty skips validation for an empty value, so the SDK must not
			// reject `successUrl: process.env.SUCCESS_URL ?? ''` when the variable is unset.
			expect(() =>
				validateCreateSession({
					productId: 1,
					successUrl: '',
					productName: '',
					description: '',
				})
			).not.toThrow();
		});

		it('rejects a session with no product identification at all', () => {
			expect(() => validateCreateSession({})).toThrow();
		});

		it('rejects markup in an inline product name', () => {
			expect(() =>
				validateCreateSession({
					productName: '<script>alert(1)</script>',
					description: 'A fine description',
					price: 9.99,
				})
			).toThrow();
		});
	});
});
