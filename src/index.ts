/**
 * QBitFlow JavaScript/TypeScript SDK
 * Official SDK for the QBitFlow - Next Generation Crypto Payment Processing
 *
 * @packageDocumentation
 */

// Export main client
export { QBitFlow } from './QBitFlow';

// Export all types
export * from './types';

// Export exceptions
export * from './exceptions';

// Local webhook signature verification (no API round-trip required)
export * from './webhooks/verify';

// Export version
export const VERSION = '2.1.0';
