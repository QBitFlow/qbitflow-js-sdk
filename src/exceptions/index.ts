
/**
 * Custom error classes for the QBitFlow SDK
 */

/**
 * A single field-level validation failure.
 *
 * The API reports validation failures as a list of these, one per offending field:
 *
 * ```json
 * {"errors":[{"field":"ProductName","message":"ProductName is too short"},
 *            {"field":"Price","message":"Price is too short"}]}
 * ```
 */
export interface FieldError {
  /** Name of the offending field, as the API names it. */
  field: string;
  /** The API's explanation for that field. */
  message: string;
}

/**
 * Base error class for all QBitFlow SDK errors
 */
export class QBitFlowError extends Error {
  /**
   * Per-field validation failures, when the API reported them; empty otherwise.
   *
   * Prefer this over parsing `message` when you need to map failures back onto form
   * fields. `message` lists every failure too, but as prose.
   */
  public readonly fields: FieldError[];

  constructor(message: string, fields: FieldError[] = []) {
    super(message);
    this.name = 'QBitFlowError';
    this.fields = fields;
    Object.setPrototypeOf(this, QBitFlowError.prototype);
  }
}

/**
 * Error thrown when a resource is not found (404)
 */
export class NotFoundException extends QBitFlowError {
  constructor(message: string = 'Resource not found', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'NotFoundException';
    Object.setPrototypeOf(this, NotFoundException.prototype);
  }
}

/**
 * Error thrown when authentication fails (401)
 */
export class UnauthorizedException extends QBitFlowError {
  constructor(message: string = 'Unauthorized: Invalid API key', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'UnauthorizedException';
    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}

/**
 * Error thrown when a request is forbidden (403)
 */
export class ForbiddenException extends QBitFlowError {
  constructor(message: string = 'Forbidden: Access denied', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'ForbiddenException';
    Object.setPrototypeOf(this, ForbiddenException.prototype);
  }
}

/**
 * Error thrown when request validation fails (400)
 */
export class ValidationException extends QBitFlowError {
  constructor(message: string = 'Validation failed', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'ValidationException';
    Object.setPrototypeOf(this, ValidationException.prototype);
  }
}

/**
 * Error thrown when rate limit is exceeded (429)
 */
export class RateLimitException extends QBitFlowError {
  constructor(message: string = 'Rate limit exceeded', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'RateLimitException';
    Object.setPrototypeOf(this, RateLimitException.prototype);
  }
}

/**
 * Error thrown when a server error occurs (500+)
 */
export class ServerException extends QBitFlowError {
  constructor(message: string = 'Internal server error', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'ServerException';
    Object.setPrototypeOf(this, ServerException.prototype);
  }
}

/**
 * Error thrown when a network request fails
 */
export class NetworkException extends QBitFlowError {
  constructor(message: string = 'Network request failed', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'NetworkException';
    Object.setPrototypeOf(this, NetworkException.prototype);
  }
}

/**
 * Error thrown when WebSocket connection fails
 */
export class WebSocketException extends QBitFlowError {
  constructor(message: string = 'WebSocket connection error', fields: FieldError[] = []) {
    super(message, fields);
    this.name = 'WebSocketException';
    Object.setPrototypeOf(this, WebSocketException.prototype);
  }
}
