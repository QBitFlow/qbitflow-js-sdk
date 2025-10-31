# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-23

### Added

- Initial release of QBitFlow JavaScript/TypeScript SDK
- Complete TypeScript support with full type definitions
- One-time payment operations
    - Create payment sessions
    - Get payment details
    - List payments with pagination
    - Combined payment listing
- Subscription operations
    - Create subscription sessions with customizable frequency
    - Trial period support
    - Get subscription details
    - List subscriptions with pagination
    - Cancel subscriptions
- Pay-as-you-go subscription operations
    - Create PAYG sessions
    - Get PAYG details
    - List PAYG subscriptions
    - Cancel PAYG subscriptions
- Transaction status monitoring
    - Get current transaction status
    - Real-time WebSocket status updates with automatic reconnection
- Comprehensive error handling with custom error classes
- Automatic request retry logic with exponential backoff
- Support for both CommonJS and ES modules
- Webhook handling examples
- Complete test suite with Jest
- Detailed documentation and examples
- Express.js webhook server example
- Client usage examples

### Features

- Dual package support (CommonJS and ESM)
- Type-safe API with full IntelliSense support
- Request timeout and retry configuration
- Pagination support for list operations
- WebSocket support for real-time updates
- Comprehensive error handling and reporting

### Developer Experience

- Full TypeScript types exported
- JSDoc comments on all public methods
- Example code for common use cases
- Test coverage for core functionality
- Linting and formatting configuration
- Build scripts for distribution

## [Unreleased]

### Planned

- Additional webhook signature verification
- Rate limit handling improvements
- Caching layer for repeated requests
- GraphQL support
- Browser bundle optimization
- Additional currency support
- Webhook retry mechanism
- Dashboard integration helpers

---

For more information, visit [GitHub Repository](https://github.com/qbitflow/qbitflow-js-sdk)
