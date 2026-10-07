/**
 * Integration tests for the QBitFlow SDK, against a real QBitFlow server.
 *
 * The suite reads its target from the environment — it never defaults to localhost or to
 * production:
 *
 * - `QBITFLOW_API_KEY` and `QBITFLOW_BASE_URL` both set → the suite runs against that server;
 * - `QBITFLOW_API_KEY` set without `QBITFLOW_BASE_URL` → the suite FAILS, naming the missing
 *   variable;
 * - neither set → the suite is skipped, so the offline `npm test` stays green.
 *
 * Run with (from the SDK directory, loading the workspace's `.local.env` — never print it):
 *     set -a; source ../.local.env; set +a
 *     npm run test:live
 */

import { randomUUID } from 'node:crypto';

import { QBitFlow } from '../src/QBitFlow';
import { Duration, TransactionType } from '../src/types';

import { NotFoundException, ValidationException } from '../src/exceptions';
import { CreateCustomerDto, Customer, UpdateCustomerDto } from '../src/types/customer';
import { CreateProductDto, Product, UpdateProductDto } from '../src/types/product';
import { CreateUserDto, UpdateUserDto, User, UserRole } from '../src/types/user';

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
	reference: `CUST-${Math.random().toString(36).substring(7)}`,
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
	role: UserRole.USER,
	organizationFeeBps: 100,
});

// Setup and teardown
let client: QBitFlow;
let apiKey: string;
let baseUrl: string;

// Without a key there is nothing to talk to: skip the whole suite instead of failing it, so
// `npm test` stays green offline and the live run is opt-in (`npm run test:live`).
const describeLive = process.env.QBITFLOW_API_KEY ? describe : describe.skip;

describeLive('QBitFlow Integration Tests', () => {
	beforeAll(() => {
		const configuredUrl = process.env.QBITFLOW_BASE_URL;
		if (!configuredUrl) {
			throw new Error(
				'QBITFLOW_API_KEY is set but QBITFLOW_BASE_URL is not: set the base URL of the server ' +
					'to test against (see tests/README.md). The live suite never defaults to a URL.'
			);
		}
		apiKey = process.env.QBITFLOW_API_KEY as string;
		baseUrl = configuredUrl;
		client = new QBitFlow({ apiKey, baseUrl });
	});

	describe('Client', () => {
		it('should initialize with API key string', () => {
			const testClient = new QBitFlow(apiKey);
			expect(testClient.getApiKey()).toBe(apiKey);
			expect(testClient.customers).toBeDefined();
			expect(testClient.products).toBeDefined();
			expect(testClient.oneTimePayments).toBeDefined();
			expect(testClient.subscriptions).toBeDefined();
			expect(testClient.refunds).toBeDefined();
			expect(testClient.accounting).toBeDefined();
			expect(testClient.claims).toBeDefined();
		});

		it('should initialize with config object', () => {
			const testClient = new QBitFlow({
				apiKey,
				baseUrl,
				timeout: 60000,
				maxRetries: 5,
			});
			expect(testClient.getApiKey()).toBe(apiKey);
			expect(testClient.getBaseUrl()).toBe(baseUrl.replace(/\/+$/, ''));
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
			expect(customer.reference).toBe(customerData.reference);
			expect(typeof customer.createdAt).toBe('string');
			expect(typeof customer.organizationId).toBe('number');
			expect(customer.userId).toBe(0); // organization-level customer

			createdCustomer = customer;
		});

		it('should get customer by reference', async () => {
			expect(createdCustomer).not.toBeNull();
			if (!createdCustomer) return;

			const retrieved = await client.customers.getByReference(createdCustomer.reference);
			expect(retrieved.uuid).toBe(createdCustomer.uuid);
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

		it('should get all customers with pagination', async () => {
			const limit = 2;
			const customers = await client.customers.getAll({ limit });

			expect(Array.isArray(customers.items)).toBe(true);
			expect(customers.items.length).toBeGreaterThan(0);
			expect(customers.hasMore()).toBe(true); // Assuming we have more than 2 customers in test environment

			const nextCustomers = await client.customers.getAll({
				limit,
				cursor: customers.nextCursor,
			});
			expect(Array.isArray(nextCustomers.items)).toBe(true);
			expect(nextCustomers.items.length).toBeGreaterThan(0);
		});

		it('should update a customer (UUID in URL path)', async () => {
			const customerData = createTestCustomerData();
			const created = await client.customers.create(customerData);

			const updatedEmail = `updated+${Math.random().toString(36).substring(7)}@example.com`;

			const updateData: UpdateCustomerDto = {
				name: created.name,
				lastName: created.lastName,
				email: updatedEmail,
				phoneNumber: '+9876543210',
			};
			const updated = await client.customers.update(created.uuid, updateData);

			expect(updated.uuid).toBe(created.uuid);
			expect(updated.email).toBe(updatedEmail);
			expect(updated.phoneNumber).toBe('+9876543210');
		});

		it('should apply a partial update and leave other fields untouched', async () => {
			const created = await client.customers.create(createTestCustomerData());

			// Only the name is sent; every other stored value must survive.
			const updated = await client.customers.update(created.uuid, { name: 'OnlyName' });

			expect(updated.name).toBe('OnlyName');
			expect(updated.lastName).toBe(created.lastName);
			expect(updated.email).toBe(created.email);
		});

		it('should treat an empty update body as a no-op', async () => {
			const created = await client.customers.create(createTestCustomerData());

			const updated = await client.customers.update(created.uuid, {});

			expect(updated.name).toBe(created.name);
			expect(updated.lastName).toBe(created.lastName);
			expect(updated.email).toBe(created.email);
		});

		it('should delete a customer', async () => {
			const customerData = createTestCustomerData();
			const created = await client.customers.create(customerData);

			const response = await client.customers.delete(created.uuid);
			expect(response.message).toBeDefined();

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

			createdUser = user;
		});

		it('should get current user', async () => {
			const retrieved = await client.users.get();
			expect(retrieved.id).toBeDefined();
		});

		it('should get user by email', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const retrieved = await client.users.getByEmail(createdUser.email);
			expect(retrieved.id).toBe(createdUser.id);
			expect(retrieved.claimedAt).toBeNull(); // a provisioned user starts unclaimed
		});

		it('should get user by ID', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const retrieved = await client.users.getById(createdUser.id);

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
			const tempUserData = createTestUserData();
			const tempUser = await client.users.create(tempUserData);
			expect(tempUser.id).toBeDefined();

			const response = await client.users.delete(tempUser.id);
			expect(response.message).toBeDefined();

			await expect(client.users.getById(tempUser.id)).rejects.toThrow(NotFoundException);
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

		it('should apply a partial update and leave other fields untouched', async () => {
			const created = await client.products.create(createTestProductData());

			// Only the price is sent; name, description and reference must survive.
			const updated = await client.products.update(created.id, { price: 42.5 });

			expect(updated.price).toBe(42.5);
			expect(updated.name).toBe(created.name);
			expect(updated.description).toBe(created.description);
			expect(updated.reference).toBe(created.reference);
		});

		it('should delete a product', async () => {
			const productData = createTestProductData();
			const created = await client.products.create(productData);

			const response = await client.products.delete(created.id);
			expect(response.message).toBeDefined();

			await expect(client.products.get(created.id)).rejects.toThrow(NotFoundException);
		});
	});

	describe('API Keys', () => {
		// Note: creating/deleting API keys is a JWT-only operation on the API and cannot be
		// performed with an API key, so the SDK only exposes read access.
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
	});

	describe('Currencies', () => {
		it('should get all available currencies', async () => {
			const currencies = await client.currencies.getAllAvailable();

			expect(Array.isArray(currencies)).toBe(true);
			expect(currencies.length).toBeGreaterThan(0);
			for (const currency of currencies) {
				expect(typeof currency.id).toBe('number');
				expect(typeof currency.symbol).toBe('string');
			}
		});

		it('should get all main currencies', async () => {
			const currencies = await client.currencies.getAllMain();

			expect(Array.isArray(currencies)).toBe(true);
			expect(currencies.length).toBeGreaterThan(0);
			// Main currencies are native currencies, so they have no main currency reference.
			for (const currency of currencies) {
				expect(currency.mainCurrencyId).toBeNull();
				expect(currency.mainCurrency).toBeNull();
			}
		});

		it('should resolve currency IDs from a payment session', async () => {
			if (!createdProduct || !createdCustomer) return;

			const session = await client.oneTimePayments.createSession({
				productId: createdProduct.id,
				customerUUID: createdCustomer.uuid,
			});
			const checkout = await client.oneTimePayments.getSession(session.uuid);

			const currencies = await client.currencies.getAllAvailable();
			const byId = new Map(currencies.map((c) => [c.id, c]));
			for (const id of checkout.availableCurrencies) {
				expect(typeof id).toBe('number');
				expect(byId.has(id)).toBe(true);
			}
		});
	});

	describe('Payments', () => {
		it('should create payment session with product ID', async () => {
			expect(createdProduct).not.toBeNull();
			const response = await client.oneTimePayments.createSession({
				productId: createdProduct?.id,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toMatch(/^pay@/);
			expect(response.link).toContain('http');
		});

		it('should refuse to read a payment session through subscriptions.getSession', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const created = await client.oneTimePayments.createSession({
				productId: createdProduct.id,
			});
			await expect(client.subscriptions.getSession(created.uuid)).rejects.toThrow(
				ValidationException
			);
		});

		it('should answer 404 for an unknown payment uuid and reference', async () => {
			await expect(client.oneTimePayments.get(`pay@${randomUUID()}`)).rejects.toThrow(
				NotFoundException
			);
			await expect(
				client.oneTimePayments.getByReference(`missing-${randomUUID()}`)
			).rejects.toThrow(NotFoundException);
		});

		it('should create payment session with inline product details', async () => {
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
			const maxPages = 3;

			while (pageCount < maxPages) {
				const page = await client.oneTimePayments.getAll({ limit: 2, cursor });
				allPayments.push(...page.items);

				if (!page.hasMore()) break;
				cursor = page.nextCursor;
				pageCount++;
			}

			// Pagination must return a well-formed page; the test account may legitimately
			// have no completed payments, so we assert shape rather than presence of data.
			expect(Array.isArray(allPayments)).toBe(true);
		});

		it('should get all combined payments with pagination', async () => {
			let cursor: string | null = null;
			const allPayments = [];
			let pageCount = 0;
			const maxPages = 2;

			while (pageCount < maxPages) {
				const page = await client.oneTimePayments.getAllCombined({ limit: 50, cursor });
				allPayments.push(...page.items);

				if (!page.hasMore()) break;
				cursor = page.nextCursor;
				pageCount++;
			}

			expect(Array.isArray(allPayments)).toBe(true);
		});

		it('should get customer for a transaction', async () => {
			// Create a payment session and use its uuid as the transaction reference
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const session = await client.oneTimePayments.createSession({
				productId: createdProduct.id,
				customerUUID: createdCustomer?.uuid,
			});

			try {
				const customer = await client.oneTimePayments.getCustomerForTransaction(
					session.uuid
				);
				expect(customer.uuid).toBeDefined();
			} catch (error) {
				// Expected while the transaction has not been completed yet.
				expect(error).toBeInstanceOf(NotFoundException);
			}
		});
	});

	describe('Subscriptions', () => {
		it('should create subscription session with productId', async () => {
			expect(createdCustomer).not.toBeNull();
			if (!createdCustomer) return;
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const response = await client.subscriptions.createSession({
				productId: createdProduct.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				trialPeriod: { value: 7, unit: 'days' } as Duration,
				customerUUID: createdCustomer.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should create subscription session without trial period', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const response = await client.subscriptions.createSession({
				productId: createdProduct.id,
				frequency: { value: 1, unit: 'weeks' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should create subscription session with inline product details', async () => {
			const response = await client.subscriptions.createSession({
				productName: 'Monthly Newsletter',
				description: 'Monthly news digest',
				price: 4.99,
				frequency: { value: 1, unit: 'months' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			expect(response.uuid).toBeDefined();
			expect(response.link).toBeDefined();
		});

		it('should get subscription session', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const created = await client.subscriptions.createSession({
				productId: createdProduct.id,
				frequency: { value: 1, unit: 'months' } as Duration,
				customerUUID: createdCustomer?.uuid,
			});

			const session = await client.subscriptions.getSession(created.uuid);

			expect(session.uuid).toBe(created.uuid);
			expect(session.price).toBeGreaterThan(0);
			expect(session.frequency).toBeGreaterThan(0);
			expect(session.availableCurrencies.length).toBeGreaterThan(0);
		});

		it('should answer 404 for an unknown subscription and [] for its history', async () => {
			const unknown = `sub@${randomUUID()}`;
			await expect(client.subscriptions.get(unknown)).rejects.toThrow(NotFoundException);
			await expect(
				client.subscriptions.getByReference(`missing-${randomUUID()}`)
			).rejects.toThrow(NotFoundException);
			await expect(client.subscriptions.getPaymentHistory(unknown)).resolves.toEqual([]);
		});

		it('should answer 404 for force-cancel and execute-billing on an unknown subscription', async () => {
			const unknown = `sub@${randomUUID()}`;
			await expect(client.subscriptions.forceCancel(unknown)).rejects.toThrow(
				NotFoundException
			);
			await expect(client.subscriptions.executeTestBilling(unknown)).rejects.toThrow(
				NotFoundException
			);
		});
	});

	// Pay-as-you-go is temporarily disabled
	// describe('Pay-as-you-go', () => { ... });

	describe('Transaction Status', () => {
		it('should get transaction status (or throw NotFoundException if not started)', async () => {
			expect(createdProduct).not.toBeNull();
			if (!createdProduct) return;

			const session = await client.oneTimePayments.createSession({
				productId: createdProduct.id,
				customerUUID: createdCustomer?.uuid,
			});

			try {
				const status = await client.transactionStatus.get(
					session.uuid,
					TransactionType.ONE_TIME_PAYMENT
				);
				expect(status.status).toBeDefined();
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
			}
		});
	});

	describe('Refunds', () => {
		it('should get refund by transaction UUID (or throw NotFoundException)', async () => {
			try {
				const refund = await client.refunds.getByTransaction('non-existent-uuid');
				expect(refund.uuid).toBeDefined();
			} catch (error) {
				expect(error).toBeInstanceOf(NotFoundException);
			}
		});

		it('should get all active refunds', async () => {
			const refunds = await client.refunds.getAll();
			expect(Array.isArray(refunds)).toBe(true);
		});

		it('should get inactive refunds with pagination', async () => {
			const result = await client.refunds.getAllInactive({ limit: 10 });
			expect(Array.isArray(result.items)).toBe(true);
			expect(typeof result.hasMore).toBe('function');
		});
	});

	describe('Accounting', () => {
		it('should export accounting data as JSON', async () => {
			const events = await client.accounting.export('2026-08-01', '2026-08-31', 'json');
			expect(Array.isArray(events)).toBe(true);
		});

		it('should export accounting data as CSV', async () => {
			const csv = await client.accounting.export('2026-08-01', '2026-08-31', 'csv');
			expect(typeof csv).toBe('string');
			expect(csv).toContain('paymentId'); // the header row is always present
		});
	});

	describe('Claims', () => {
		it('should get claim funds for the organization', async () => {
			const funds = await client.claims.getFunds();
			expect(Array.isArray(funds)).toBe(true);
		});

		it('should create a claim request for a user', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const result = await client.claims.createRequest(createdUser.id);
			expect(result.message).toBeDefined();
			expect(result.link).toBeDefined();
			expect(result.link).toContain('http');
		});

		it('should get the claim request created for the user', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			const result = await client.claims.getRequestByUser(createdUser.id);
			expect(result.link).toContain('http');
		});

		it('should trigger test claim funds (test keys) or answer 400 (live keys)', async () => {
			expect(createdUser).not.toBeNull();
			if (!createdUser) return;

			try {
				const result = await client.claims.triggerTestClaimFunds(createdUser.id);
				expect(typeof result.message).toBe('string');
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationException);
				expect((error as ValidationException).statusCode).toBe(400);
			}
		});
	});

	describe('Webhooks', () => {
		it('should report a forged signature as not verified', async () => {
			const verified = await client.webhooks.verify(
				{ uuid: 'pay@forged', txType: 'payment' },
				'sha256=' + '0'.repeat(64),
				String(Math.floor(Date.now() / 1000))
			);
			expect(verified).toBe(false);
		});
	});

	describe('On-Behalf-Of', () => {
		it('should act at the organization level with onBehalfOf(0)', async () => {
			const products = await client.onBehalfOf(0).products.getAll();
			expect(Array.isArray(products)).toBe(true);
		});
	});

	describe('Validation', () => {
		it('should throw validation error for empty customer UUID', async () => {
			await expect(client.customers.get('')).rejects.toThrow();
		});

		it('should throw validation error for invalid product ID', async () => {
			await expect(client.products.get(-1)).rejects.toThrow();
		});

		it('should validate email format', async () => {
			await expect(client.customers.getByEmail('invalid-email')).rejects.toThrow();
		});

		it('should validate accounting export requires dates', async () => {
			await expect(client.accounting.export('', '', 'json')).rejects.toThrow();
		});
	});
});
