
# QBitFlow SDK Tests

This directory contains tests for the QBitFlow JavaScript/TypeScript SDK.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

- **QBitFlow.test.ts** - Tests for the main SDK client
- **utils.test.ts** - Tests for utility functions
- **exceptions.test.ts** - Tests for custom error classes
- **types.test.ts** - Tests for TypeScript type definitions

## Integration Tests

The tests in this directory are primarily unit tests. For integration testing with a live API:

1. Set up a test environment with the QBitFlow API
2. Use test API keys
3. Create integration test files that make real API calls
4. Run integration tests separately from unit tests

## Coverage

We aim for high test coverage across all critical paths. Run `npm run test:coverage` to see the current coverage report.

## Writing New Tests

When adding new features:

1. Write tests before implementation (TDD approach)
2. Test both success and error cases
3. Test edge cases and boundary conditions
4. Mock external dependencies when appropriate
5. Keep tests focused and independent
