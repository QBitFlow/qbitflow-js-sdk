/**
 * Tests for utility functions
 */

import {
	convertKeysToSnakeCase,
	convertKeysToCamelCase,
	validateRequiredFields,
	validateCreateSession,
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
				'Either productId or productName, description, and price must be provided'
			);
		});

		it('should throw when product details are incomplete', () => {
			const dto = { productName: 'Product' };
			expect(() => validateCreateSession(dto)).toThrow(
				'Either productId or productName, description, and price must be provided'
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
});
