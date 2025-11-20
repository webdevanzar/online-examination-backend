import { Request, Response, NextFunction } from "express";
import { flattenError, ZodError } from "zod";

// Custom error class for consistent error throwing
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Centralized error handler
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Error:", err);

  // Handle invalid JSON
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid JSON format",
      error: err.message,
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = flattenError(err);
    return res.status(400).json({
      status: "fail",
      message: "Validation error",
      errors: formattedErrors,
    });
  }

  // Handle AppError (operational errors)
  if (err instanceof AppError) {
    console.log(err);
    return res.status(err.statusCode).json({
      status: "fail",
      message: err.message,
    });
  }

  // Handle TypeORM / database errors
  if (err?.code) {
    return res.status(500).json({
      status: "error",
      message: "Database error",
      code: err.code,
      detail: err.detail || err.message,
    });
  }

  // Fallback for unexpected errors
  return res.status(500).json({
    status: "error",
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};
