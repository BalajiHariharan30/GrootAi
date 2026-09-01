/**
 * @module authLimiter
 * @description Stricter rate limiter applied exclusively to auth endpoints
 * (login, register) to prevent brute-force password attacks.
 *
 * Allows 10 requests per 15 minutes per IP — vs the general 300/15min API limiter.
 * Returns a 429 with a structured JSON body consistent with the rest of the API.
 */
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             10,              // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,     // Only count failed attempts
  message: {
    success: false,
    code:    'RATE_LIMITED',
    error:   'Too many login attempts from this IP. Please wait 15 minutes before trying again.',
  },
});
