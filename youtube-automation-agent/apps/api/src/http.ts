import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError, ValidationError, createLogger, errorMessage } from "@yta/shared";

const logger = createLogger("api:http");

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap async route handlers so rejections reach the error middleware. */
export function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

/** Parse and validate with a Zod schema, raising a 400 on failure. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data) as z.output<S>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError("Invalid request", error.flatten());
    }
    throw error;
  }
}

/** Success envelope. */
export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

/** Central error handler - keeps error responses uniform. */
export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error("request failed", { path: req.path, error: error.message });
    }
    res.status(error.statusCode).json({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  logger.error("unhandled error", { path: req.path, error: errorMessage(error) });
  res.status(500).json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}

/**
 * JSON.stringify replacer handling BigInt (GitHub repo ids) and Dates.
 * Installed via express's json replacer setting.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}
