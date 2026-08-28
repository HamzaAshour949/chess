/**
 * An error carrying an HTTP status.
 *
 * Anything thrown that is not an HttpError is treated as a bug by the error
 * handler: it is logged in full and reported to the client as a generic 500,
 * so internal details never leak.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly code?: string;

  constructor(status: number, message: string, options: { details?: unknown; code?: string } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (options.details !== undefined) this.details = options.details;
    if (options.code !== undefined) this.code = options.code;
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new HttpError(400, message, { details });
  }

  static unauthorized(message = 'Authentication required') {
    return new HttpError(401, message);
  }

  static forbidden(message = 'Forbidden', options: { code?: string; details?: unknown } = {}) {
    return new HttpError(403, message, options);
  }

  static notFound(message = 'Not found') {
    return new HttpError(404, message);
  }

  static conflict(message = 'Conflict', details?: unknown) {
    return new HttpError(409, message, { details });
  }

  static tooManyRequests(message = 'Too many requests') {
    return new HttpError(429, message);
  }
}
