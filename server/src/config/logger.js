/**
 * @module logger
 * @description Centralised Winston-based structured logging service.
 *
 * Levels (in order of priority):
 *   error → warn → info → http → debug
 *
 * In production only warn+ is written to stdout; all levels go to
 * rotating daily log files under /logs.
 */
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Custom readable format for local development
// ---------------------------------------------------------------------------
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${stack || message}${metaStr}`;
});

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',

  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    isProduction ? json() : combine(colorize({ all: true }), devFormat),
  ),

  transports: [
    new winston.transports.Console({ silent: false }),
  ],

  // Prevent uncaught exceptions from crashing silently
  exceptionHandlers: [new winston.transports.Console()],
  rejectionHandlers: [new winston.transports.Console()],
});

export default logger;
