/**
 * @module requireAuth
 * @description JWT verification middleware for protected API routes.
 *
 * Token lookup order:
 *   1. `Authorization: Bearer <token>` header
 *   2. `grootai_token` httpOnly cookie
 *
 * On success → attaches `req.user` (decoded payload) and calls `next()`.
 * On failure → returns 401 with a machine-readable `code` field so the
 *              React client can distinguish between expired vs invalid tokens
 *              and react appropriately (e.g. refresh vs. force re-login).
 *
 * Guest Mode:
 *   Pass `allowGuest: true` in options to allow unauthenticated read-only
 *   access. `req.user` will be `null` and `req.isGuest` will be `true`.
 *
 * @example
 *   // Require authentication
 *   router.get('/profile', requireAuth(), asyncHandler(handler));
 *
 *   // Allow guests (read-only)
 *   router.get('/datasets', requireAuth({ allowGuest: true }), asyncHandler(handler));
 */
import jwt    from 'jsonwebtoken';
import logger from '../config/logger.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'grootai-dev-secret-change-in-production';

/**
 * @param {{ allowGuest?: boolean }} [opts]
 * @returns {import('express').RequestHandler}
 */
export const requireAuth = (opts = {}) => (req, res, next) => {
  const { allowGuest = false } = opts;

  // Extract token — header takes priority over cookie
  const authHeader = req.headers.authorization;
  const token      =
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) ??
    req.cookies?.grootai_token ??
    null;

  if (!token) {
    if (allowGuest) {
      req.user    = null;
      req.isGuest = true;
      return next();
    }
    return res.status(401).json({
      success: false,
      code:    'NO_TOKEN',
      error:   'Authentication required. Please sign in with Google.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user      = decoded;
    req.isGuest   = false;
    return next();
  } catch (err) {
    logger.warn({ event: 'jwt_verify_failed', reason: err.message, ip: req.ip });

    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';

    if (allowGuest) {
      req.user    = null;
      req.isGuest = true;
      return next();
    }

    return res.status(401).json({
      success: false,
      code,
      error:   code === 'TOKEN_EXPIRED'
        ? 'Your session has expired. Please sign in again.'
        : 'Invalid authentication token.',
    });
  }
};

/**
 * Role guard middleware — must be used AFTER `requireAuth()`.
 * Returns 403 if the authenticated user's role does not meet the minimum.
 *
 * Role order: viewer < steward < admin
 *
 * @param {'viewer' | 'steward' | 'admin'} minRole
 * @returns {import('express').RequestHandler}
 */
export const requireRole = (minRole) => (req, res, next) => {
  const RANK = { viewer: 0, steward: 1, admin: 2 };
  const userRank = RANK[req.user?.role ?? 'viewer'] ?? 0;
  const minRank  = RANK[minRole] ?? 0;

  if (userRank < minRank) {
    return res.status(403).json({
      success: false,
      code:    'INSUFFICIENT_ROLE',
      error:   `This action requires the '${minRole}' role. Your current role is '${req.user?.role}'.`,
    });
  }

  return next();
};
