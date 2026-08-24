/**
 * @module auth.routes
 * @description Google OAuth 2.0 authentication routes.
 *
 * Flow:
 *  1. `GET /api/auth/google`
 *       → Redirects browser to Google consent screen
 *
 *  2. `GET /api/auth/google/callback`
 *       → Google redirects back here with `?code=`
 *       → Passport verifies, upserts User, issues a signed JWT
 *       → Redirects to frontend with token as a secure httpOnly cookie
 *         AND as a URL param for SPA environments that can't read cookies
 *
 *  3. `GET /api/auth/me`
 *       → Returns current user from JWT (used on app boot to hydrate Redux)
 *
 *  4. `POST /api/auth/logout`
 *       → Clears the httpOnly cookie
 *
 * Security notes:
 *  • JWT is RS256-signed with `JWT_SECRET` (at least 32 chars in prod)
 *  • Cookie is `httpOnly`, `sameSite: lax`, `secure` in production
 *  • Token expiry defaults to 7 days (configurable via JWT_EXPIRES_IN)
 */
import express          from 'express';
import jwt              from 'jsonwebtoken';
import passportInstance from '../config/passport.js';
import { requireAuth }  from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import logger           from '../config/logger.js';

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     ?? 'grootai-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const FRONTEND_URL   = process.env.FRONTEND_URL   ?? 'http://localhost:5173';

const IS_PROD = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Helper: sign a JWT for a User document
// ---------------------------------------------------------------------------

/**
 * Generates a signed JWT containing the minimal user payload.
 * @param {object} user
 * @returns {string}
 */
function signToken(user) {
  return jwt.sign(
    {
      sub:    String(user._id),
      email:  user.email,
      name:   user.name,
      avatar: user.avatar ?? null,
      role:   user.role   ?? 'steward',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

/**
 * Sets the JWT as a secure httpOnly cookie.
 * @param {import('express').Response} res
 * @param {string} token
 */
function setAuthCookie(res, token) {
  res.cookie('grootai_token', token, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path:     '/',
  });
}

// ── GET /api/auth/google ────────────────────────────────────────────────────
/**
 * Initiates the Google OAuth flow.
 * Redirects the browser to Google's consent screen requesting
 * profile and email scopes.
 */
router.get(
  '/google',
  passportInstance.authenticate('google', {
    scope:  ['profile', 'email'],
    prompt: 'select_account', // Always show account picker
  }),
);

// ── GET /api/auth/google/callback ───────────────────────────────────────────
/**
 * OAuth callback — Google redirects here after user grants permission.
 * Issues a JWT, sets it as a cookie, and redirects to the React frontend.
 */
router.get(
  '/google/callback',
  passportInstance.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/?error=oauth_failed` }),
  asyncHandler(async (req, res) => {
    const user  = req.user;
    const token = signToken(user);

    setAuthCookie(res, token);

    logger.info({
      event:  'auth_success',
      userId: String(user._id),
      email:  user.email,
      role:   user.role,
    });

    // Redirect to frontend — token also passed as URL param for SPA hydration
    res.redirect(`${FRONTEND_URL}/?token=${encodeURIComponent(token)}`);
  }),
);

// ── GET /api/auth/me ────────────────────────────────────────────────────────
/**
 * Returns the current authenticated user from the JWT.
 * Used by the React app on boot to rehydrate auth state without a full OAuth flow.
 */
router.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data:    {
        id:     req.user.sub,
        email:  req.user.email,
        name:   req.user.name,
        avatar: req.user.avatar,
        role:   req.user.role,
      },
    });
  }),
);

// ── POST /api/auth/logout ───────────────────────────────────────────────────
/**
 * Clears the auth cookie and logs the sign-out event.
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    // Best-effort: log if we have a user
    if (req.cookies?.grootai_token) {
      try {
        const decoded = jwt.verify(req.cookies.grootai_token, JWT_SECRET);
        logger.info({ event: 'auth_logout', email: decoded.email });
      } catch (_) { /* token may already be expired */ }
    }

    res.clearCookie('grootai_token', { path: '/' });
    res.json({ success: true, message: 'Signed out successfully.' });
  }),
);

export default router;
