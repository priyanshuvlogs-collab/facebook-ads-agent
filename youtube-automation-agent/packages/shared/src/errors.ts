/** Base error class carrying an HTTP-friendly status code and machine code. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, "CONFIGURATION_ERROR", details);
  }
}

export class ExternalApiError extends AppError {
  constructor(
    message: string,
    public readonly provider: string,
    statusCode = 502,
    details?: unknown
  ) {
    super(message, statusCode, "EXTERNAL_API_ERROR", details);
  }
}

export class RateLimitedError extends ExternalApiError {
  constructor(
    provider: string,
    public readonly retryAfterMs?: number,
    details?: unknown
  ) {
    super(`${provider} rate limit reached`, provider, 429, details);
  }
}

/** Convert unknown thrown values into a readable message. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}
