/**
 * @module errorHandler
 * @description Centralised Express error-handling middleware.
 *
 * Catches any error passed via `next(err)` and emits a normalised JSON
 * response.  Stack traces are suppressed in production.
 *
 * Error type matrix:
 *   • ValidationError (Mongoose)  → 400
 *   • CastError      (Mongoose)  → 400
 *   • 11000 duplicate key        → 409
 *   • Anything else              → 500  (or `err.statusCode` if set)
 */
import logger from '../config/logger.js';

/** @type {import('express').ErrorRequestHandler} */
export const errorHandler = (err, req, res, _next) => {
  // Log full error internally
  logger.error({
    message:    err.message,
    stack:      err.stack,
    method:     req.method,
    url:        req.originalUrl,
    statusCode: err.statusCode,
  });

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(400).json({ success: false, error: 'Validation failed', details });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: `Invalid ${err.path}: ${err.value}` });
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] ?? 'field';
    return res.status(409).json({ success: false, error: `Duplicate value for ${field}` });
  }

  const statusCode = err.statusCode ?? (res.statusCode !== 200 ? res.statusCode : 500);
  return res.status(statusCode).json({
    success: false,
    error:   err.message ?? 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
