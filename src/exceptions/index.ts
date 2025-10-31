
/**
 * Custom error classes for the QBitFlow SDK
 */

/**
 * Base error class for all QBitFlow SDK errors
 */
export class QBitFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QBitFlowError';
    Object.setPrototypeOf(this, QBitFlowError.prototype);
  }
}

/**
 * Error thrown when a resource is not found (404)
 */
export class NotFoundException extends QBitFlowError {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundException';
    Object.setPrototypeOf(this, NotFoundException.prototype);
  }
}

/**
 * Error thrown when authentication fails (401)
 */
export class UnauthorizedException extends QBitFlowError {
  constructor(message: string = 'Unauthorized: Invalid API key') {
    super(message);
    this.name = 'UnauthorizedException';
    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}

/**
 * Error thrown when a request is forbidden (403)
 */
export class ForbiddenException extends QBitFlowError {
  constructor(message: string = 'Forbidden: Access denied') {
    super(message);
    this.name = 'ForbiddenException';
    Object.setPrototypeOf(this, ForbiddenException.prototype);
  }
}

/**
 * Error thrown when request validation fails (400)
 */
export class ValidationException extends QBitFlowError {
  constructor(message: string = 'Validation failed') {
    super(message);
    this.name = 'ValidationException';
    Object.setPrototypeOf(this, ValidationException.prototype);
  }
}

/**
 * Error thrown when rate limit is exceeded (429)
 */
export class RateLimitException extends QBitFlowError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitException';
    Object.setPrototypeOf(this, RateLimitException.prototype);
  }
}

/**
 * Error thrown when a server error occurs (500+)
 */
export class ServerException extends QBitFlowError {
  constructor(message: string = 'Internal server error') {
    super(message);
    this.name = 'ServerException';
    Object.setPrototypeOf(this, ServerException.prototype);
  }
}

/**
 * Error thrown when a network request fails
 */
export class NetworkException extends QBitFlowError {
  constructor(message: string = 'Network request failed') {
    super(message);
    this.name = 'NetworkException';
    Object.setPrototypeOf(this, NetworkException.prototype);
  }
}

/**
 * Error thrown when WebSocket connection fails
 */
export class WebSocketException extends QBitFlowError {
  constructor(message: string = 'WebSocket connection error') {
    super(message);
    this.name = 'WebSocketException';
    Object.setPrototypeOf(this, WebSocketException.prototype);
  }
}
