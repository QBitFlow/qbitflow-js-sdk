/**
 * The SDK version, as published to npm.
 *
 * Kept in its own module so the request layer can stamp it into the `User-Agent` header
 * without importing the package entry point (which would create an import cycle).
 */
export const VERSION = '2.5.0';
