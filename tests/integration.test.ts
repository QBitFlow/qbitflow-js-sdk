/**
 * Integration tests for QBitFlow SDK.
 *
 * These tests run against the actual QBitFlow test API.
 * Make sure to set QBITFLOW_API_KEY environment variable.
 *
 * Run with:
 *     export QBITFLOW_API_KEY="your_test_api_key"
 *     npm test -- tests/integration.test.ts
 */

import { QBitFlow } from '../src/QBitFlow';
import { Duration, TransactionType } from '../src/types';

import { CreateProductDto, Product, UpdateProductDto } from '../src/types/product';
import { CreateUserDto, UpdateUserDto, User, UserRole } from '../src/types/user';
import { CreateApiKeyDto } from '../src/types/api-key';
import { NotFoundException } from '../src/exceptions';
import { CreateCustomerDto, Customer, UpdateCustomerDto } from '../src/types/customer';

const LOCAL_URL = 'http://localhost:3001';

// Global variables to store created entities across tests
let createdUser: User | null = null;
let createdProduct: Product | null;
let createdCustomer: Customer | null;

// Test data factories
const createTestCustomerData = (): CreateCustomerDto => ({
	name: 'John',
	lastName: 'Doe',
	email: `test+${Math.random().toString(36).substring(7)}@example.com`,
	phoneNumber: '+1234567890',
	address: '123 Test Street',
});

const createTestProductData = (): CreateProductDto => ({
	name: `Test Product ${Math.random().toString(36).substring(7)}`,
	description: 'A test product for integration testing',
	price: 9.99,
	reference: `REF-${Math.random().toString(36).substring(7)}`,
});

const createTestUserData = (): CreateUserDto => ({
	email: `testuser+${Math.random().toString(36).substring(7)}@example.com`,
	name: 'Test',
	lastName: 'User',
	password: 'TestP@ssw0rd!',
	role: UserRole.USER,
	organizationFeeBps: 100,
});

// Setup and teardown
let client: QBitFlow;
let apiKey: string;

beforeAll(() => {
	if (!process.env.QBITFLOW_API_KEY) {
		throw new Error('QBITFLOW_API_KEY environment variable is not set');
	}
	apiKey = process.env.QBITFLOW_API_KEY;

	const baseUrl = process.env.QBITFLOW_API_URL || LOCAL_URL;
	client = new QBitFlow({
		apiKey,
		baseUrl,
	});
});

describe('QBitFlow Integration Tests', () => {
	describe('Client', () => {
		it('should initialize with API key string', () => {
			const testClient = new QBitFlow(apiKey);
			expect(testClient.getApiKey()).toBe(apiKey);
			expect(testClient.customers).toBeDefined();
			expect(testClient.products).toBeDefined();
			expect(testClient.oneTimePayments).toBeDefined();
			expect(testClient.subscriptions).toBeDefined();
		});

		it('should initialize with config object', () => {
			const testClient = new QBitFlow({
				apiKey,
				baseUrl: LOCAL_URL,
				timeout: 60000,
				maxRetries: 5,
			});
			expect(testClient.getApiKey()).toBe(apiKey);
			expect(testClient.getBaseUrl()).toBe(LOCAL_URL);
		});

		it('should throw error when API key is not provided', () => {
			expect(() => new QBitFlow('')).toThrow('API key is required');
		});
	});

	describe('Customers', () => {
		it('should create a new customer', async () => {
			const customerData = createTestCustomerData();
			const customer = await client.customers.create(customerData);

			expect(customer.uuid).toBeDefined();
			expect(customer.name).toBe(customerData.name);
			expect(customer.lastName).toBe(customerData.lastName);
			expect(customer.email).toBe(customerData.email);
			expect(customer.createdAt).toBeDefined();

			createdCustomer = customer;
		});

		it('should get customer by UUID', async () => {
			expect(createdCustomer).not.toBeNull();
			if (!createdCustomer) return;

			const retrieved = await client.customers.get(createdCustomer.uuid);

			expect(retrieved.uuid).toBe(createdCustomer.uuid);
			expect(retrieved.email).toBe(createdCustomer.email);
		});

		it('should get customer by email', async () => {
			expect(createdCustomer).not.toBeNull();
			if (!createdCustomer) return;

			const retrieved = await client.customers.getByEmail(createdCustomer.email);

			expect(retrieved.uuid).toBe(createdCustomer.uuid);
			expect(retrieved.email).toBe(createdCustomer.email);
		});

		it('should get all customers', async () => {
			const limit = 2;

			const customers = await client.customers.getAll({ limit: limit });

			expect(Array.isArray(customers.items)).toBe(true);
			expect(customers.items.length).toBeGreaterThan(0);
			expect(customers.hasMore()).toBe(true);

			const nextCustomers = await client.customers.getAll({
				limit: limit,
				cursor: customers.nextCursor,
			});
			expect(Array.isArray(nextCustomers.items)).toBe(true);
			expect(nextCustomers.items.length).toBeGreaterThan(0);
		});

		it('should update a customer', async () => {
			const customerData = createTestCustomerData();
			const created = await client.customers.create(customerData);

			const updatedEmail = `updated+${Math.random().toString(36).substring(7)}@example.com`;

			const updateData: UpdateCustomerDto = {
				uuid: created.uuid,
				name: created.name,
				lastName: created.lastName,
				email: updatedEmail,
				phoneNumber: '+9876543210',
			};
			const updated = await client.customers.update(updateData);

			expect(updated.uuid).toBe(created.uuid);
			expect(updated.email).toBe(updatedEmail);
			expect(updated.phoneNumber).toBe('+9876543210');
		});

		it('should delete a customer', async () => {
			const customerData = createTestCustomerData();
			const created = await client.customers.create(customerData);

			const response = await client.customers.delete(created.uuid);
			expect(response.message).toBeDefined();

			// Verify deletion
			await expect(client.customers.get(created.uuid)).rejects.toThrow(NotFoundException);
		});
	});

	describe('Users', () => {
		it('should create a new user', async () => {
			const userData = createTestUserData();
			const user = await client.users.create(userData);

			expect(user.id).toBeDefined();
			expect(user.name).toBe(userData.name);
			expect(user.email).toBe(userData.email);
			expect(user.createdAt).toBeDefined();

			// Store for other tests
			createdUser = user;
		});

		it('should get current user', async () => {
			const retrieved = await client.users.get();
			expect(retrieved.id).toBeDefined();
		});

		it('should get user by ID', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const retrieved = await client.users.getById(createdUser.id.toString());

			expect(retrieved.id).toBe(createdUser.id);
			expect(retrieved.email).toBe(createdUser.email);
		});

		it('should get all users', async () => {
			const users = await client.users.getAll();

			expect(Array.isArray(users)).toBe(true);
			expect(users.length).toBeGreaterThanOrEqual(1);
		});

		it('should update a user', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const updatedEmail = `updated+${Math.random().toString(36).substring(7)}@example.com`;

			const updateData: UpdateUserDto = {
				name: 'Updated',
				lastName: 'User',
				email: updatedEmail,
				organizationFeeBps: 150,
			};
			const updated = await client.users.update(createdUser.id, updateData);

			expect(updated.id).toBe(createdUser.id);
			expect(updated.email).toBe(updatedEmail);
			expect(updated.name).toBe('Updated');
			expect(updated.organizationFeeBps).toBe(150);
		});

		it('should delete a user', async () => {
			// Create a temporary user to delete
			const tempUserData = createTestUserData();
			const tempUser = await client.users.create(tempUserData);
			expect(tempUser.id).toBeDefined();

			const response = await client.users.delete(tempUser.id);
			expect(response.message).toBeDefined();

			// Verify deletion
			await expect(client.users.getById(tempUser.id.toString())).rejects.toThrow(
				NotFoundException
			);
		});
	});

	describe('Products', () => {
		it('should create a new product', async () => {
			const productData = createTestProductData();
			const product = await client.products.create(productData);

			expect(product.id).toBeDefined();
			expect(product.name).toBe(productData.name);
			expect(product.price).toBe(productData.price);
			expect(product.isActive).toBe(true);

			// Store for other tests
			createdProduct = product;
		});

		it('should get product by ID', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const retrieved = await client.products.get(createdProduct.id);

			expect(retrieved.id).toBe(createdProduct.id);
			expect(retrieved.name).toBe(createdProduct.name);
		});

		it('should get all products', async () => {
			const products = await client.products.getAll();

			expect(Array.isArray(products)).toBe(true);
			expect(products.length).toBeGreaterThan(0);
		});

		it('should get product by reference', async () => {
			const referenceCode = `REF-${Math.random().toString(36).substring(7)}`;
			const productData: CreateProductDto = {
				...createTestProductData(),
				reference: referenceCode,
			};
			const created = await client.products.create(productData);

			const retrieved = await client.products.getByReference(referenceCode);

			expect(retrieved.id).toBe(created.id);
			expect(retrieved.reference).toBe(referenceCode);
		});

		it('should update a product', async () => {
			const productData = createTestProductData();
			const created = await client.products.create(productData);

			const updateData: UpdateProductDto = {
				name: 'Updated Product',
				description: 'Updated description',
				price: 19.99,
			};
			const updated = await client.products.update(created.id, updateData);

			expect(updated.id).toBe(created.id);
			expect(updated.name).toBe('Updated Product');
			expect(updated.price).toBe(19.99);
		});

		it('should delete a product', async () => {
			const productData = createTestProductData();
			const created = await client.products.create(productData);

			const response = await client.products.delete(created.id);
			expect(response.message).toBeDefined();

			// Verify deletion
			await expect(client.products.get(created.id)).rejects.toThrow(NotFoundException);
		});
	});

	describe('API Keys', () => {
		it('should create a new API key', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const apiKeyData: CreateApiKeyDto = {
				name: 'Test API Key',
				userId: createdUser.id,
				test: true,
			};
			const apiKey = await client.apiKeys.create(apiKeyData);

			expect(apiKey.data.name).toBe('Test API Key');
			expect(apiKey.key).toBeDefined();
		});

		it('should get all API keys', async () => {
			const apiKeys = await client.apiKeys.getAll();

			expect(Array.isArray(apiKeys)).toBe(true);
			expect(apiKeys.length).toBeGreaterThan(0);
		});

		it('should get API keys for a specific user', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const apiKeys = await client.apiKeys.getForUser(createdUser.id);

			expect(Array.isArray(apiKeys)).toBe(true);
			for (const key of apiKeys) {
				expect(key.userId).toBe(createdUser.id);
			}
		});

		it('should delete an API key', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			// Create API key to delete
			const apiKeyData: CreateApiKeyDto = {
				name: 'Temp API Key',
				userId: createdUser.id,
				test: true,
			};
			const apiKey = await client.apiKeys.create(apiKeyData);

			const response = await client.apiKeys.delete(apiKey.data.id);
			expect(response.message).toBeDefined();

			// Verify deletion
			const userKeys = await client.apiKeys.getForUser(createdUser.id);
			const keyIds = userKeys.map((key) => key.id);
			expect(keyIds).not.toContain(apiKey.data.id);
		});
	});

	describe('Payments', () => {
		it('should create payment session with product ID', async () => {
			try {
				const response = await client.oneTimePayments.createSession({
					productId: createdProduct?.id,
					customerUUID: createdCustomer?.uuid,
					webhookUrl: 'https://example.com/webhook',
				});

				expect(response.uuid).toBeDefined();
				expect(response.link).toBeDefined();
				expect(response.link).toContain('http');
			} catch (err) {
				console.log(err);
			}
		});

		it('should create payment session with product details', async () => {
			const response = await client.oneTimePayments.createSession({
				productName: 'Custom Product',
				description: 'Test product',
				price: 29.99,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should get payment session', async () => {
			const created = await client.oneTimePayments.createSession({
				productId: createdProduct?.id,
				customerUUID: createdCustomer?.uuid,
			});

			const session = await client.oneTimePayments.getSession(created.uuid);

			expect(session.uuid).toBe(created.uuid);
			expect(session.price).toBeGreaterThan(0);
			expect(session.availableCurrencies.length).toBeGreaterThan(0);
		});

		it('should get all payments with pagination', async () => {
			let cursor: string | null = null;
			const allPayments = [];
			let pageCount = 0;
			const maxPages = 3; // Limit to prevent infinite loops

			while (pageCount < maxPages) {
				const page = await client.oneTimePayments.getAll({ limit: 2, cursor });
				allPayments.push(...page.items);

				if (!page.hasMore()) {
					break;
				}
				cursor = page.nextCursor;
				pageCount++;
			}

			expect(allPayments.length).toBeGreaterThan(0);
		});

		it('should get all combined payments with pagination', async () => {
			let cursor: string | null = null;
			const allPayments = [];
			let pageCount = 0;
			const maxPages = 2; // Limit to prevent infinite loops

			while (pageCount < maxPages) {
				const page = await client.oneTimePayments.getAllCombined({ limit: 50, cursor });
				allPayments.push(...page.items);

				if (!page.hasMore()) {
					break;
				}
				cursor = page.nextCursor;
				pageCount++;
			}

			expect(allPayments.length).toBeGreaterThan(0);
		});
	});

	describe('Subscriptions', () => {
		it('should create subscription session', async () => {
			expect(createdCustomer).not.toBeNull();
			if (!createdCustomer) return;
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const response = await client.subscriptions.createSession({
				productId: createdProduct?.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				trialPeriod: { value: 7, unit: 'days' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should create subscription without trial period', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const response = await client.subscriptions.createSession({
				productId: createdProduct?.id,
				frequency: { value: 1, unit: 'weeks' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should get subscription session', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const created = await client.subscriptions.createSession({
				productId: createdProduct?.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			const session = await client.subscriptions.getSession(created.uuid);

			expect(session.uuid).toBe(created.uuid);
			expect(session.price).toBeGreaterThan(0);
			expect(session.availableCurrencies.length).toBeGreaterThan(0);
		});
	});

	describe('Pay-as-you-go', () => {
		it('should create PAYG session', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const response = await client.payAsYouGo.createSession({
				productId: createdProduct?.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				freeCredits: 10.0,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should create PAYG session without free credits', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const response = await client.payAsYouGo.createSession({
				productId: createdProduct?.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should get PAYG session', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const created = await client.payAsYouGo.createSession({
				productId: createdProduct?.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			const session = await client.payAsYouGo.getSession(created.uuid);

			expect(session.uuid).toBe(created.uuid);
			expect(session.price).toBeGreaterThan(0);
			expect(session.availableCurrencies.length).toBeGreaterThan(0);
		});
	});

	describe('Transaction Status', () => {
		it('should get transaction status', async () => {
			// Create a payment session
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const session = await client.oneTimePayments.createSession({
				productId: createdProduct?.id,
				customerUUID: createdCustomer?.uuid,
			});

			// Try to get status (may not exist yet if payment not started)
			try {
				const status = await client.transactionStatus.get(
					session.uuid,
					TransactionType.ONE_TIME_PAYMENT
				);
				expect(status.type).toBe(TransactionType.ONE_TIME_PAYMENT);
			} catch (error) {
				// Expected if payment hasn't been initiated
				expect(error).toBeInstanceOf(NotFoundException);
			}
		});
	});

	describe('Validation', () => {
		it('should throw validation error for invalid customer UUID', async () => {
			await expect(client.customers.get('')).rejects.toThrow();
		});

		it('should throw validation error for invalid product ID', async () => {
			await expect(client.products.get(-1)).rejects.toThrow();
		});

		it('should validate email format', async () => {
			await expect(client.customers.getByEmail('invalid-email')).rejects.toThrow();
		});

		it('should handle negative price validation at API level', async () => {
			const productData: CreateProductDto = {
				name: 'Test',
				description: 'Test',
				price: -10.0, // This should be caught by the API
			};

			await expect(client.products.create(productData)).rejects.toThrow();
		});
	});
});
