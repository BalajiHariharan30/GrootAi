/**
 * @module requestLogger
 * @description Express middleware that emits a structured HTTP request log
 * for every inbound request.  Uses the shared Winston logger instance so
 * all log output is co-located in the same stream/file.
 */
import logger from '../config/logger.js';

/**
 * Logs method, URL, status, and duration on response finish.
 * @type {import('express').RequestHandler}
 */
export const requestLogger = (req, res, next) => {
  const startAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;
    const level      = res.statusCode >= 500 ? 'error'
                     : res.statusCode >= 400 ? 'warn'
                     : 'http';

    logger[level]?.({
      method:     req.method,
      url:        req.originalUrl,
      status:     res.statusCode,
      durationMs: +durationMs.toFixed(2),
      ip:         req.ip,
      userAgent:  req.get('user-agent'),
    });
  });

  next();
};
