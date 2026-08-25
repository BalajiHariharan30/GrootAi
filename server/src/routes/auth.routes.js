/**
 * @module auth.routes
 * @description Authentication router supporting both Email/Password authentication
 * and Google OAuth 2.0.
 *
 * Endpoints:
 *  1. `POST /api/auth/register` → Register with Email & Password
 *  2. `POST /api/auth/login`    → Sign in with Email & Password
 *  3. `GET  /api/auth/google`   → Google OAuth initiation
 *  4. `GET  /api/auth/google/callback` → Google OAuth callback
 *  5. `GET  /api/auth/me`       → Get current authenticated user
 *  6. `POST /api/auth/logout`   → Clear session token/cookie
 */
import express          from 'express';
import jwt              from 'jsonwebtoken';
import bcrypt           from 'bcryptjs';
import { body }         from 'express-validator';
import passportInstance from '../config/passport.js';
import { User }         from '../models/User.js';
import { store }        from '../data/inMemoryStore.js';
import { getDBStatus }  from '../config/db.js';
import { validate }     from '../middleware/validate.js';
import { requireAuth }  from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import logger           from '../config/logger.js';

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     ?? 'grootai-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const FRONTEND_URL   = process.env.FRONTEND_URL   ?? 'http://localhost:5173';

const IS_PROD = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a signed JWT containing the user payload.
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

// ── POST /api/auth/register ────────────────────────────────────────────────
/**
 * Registers a new user with Name, Email, and Password.
 */
router.post(
  '/register',
  validate([
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters.'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address.'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long.'),
  ]),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    let existingUser = null;
    if (getDBStatus()) {
      existingUser = await User.findOne({ email: cleanEmail });
    } else {
      existingUser = (store.users || []).find((u) => u.email === cleanEmail);
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error:   'An account with this email already exists. Please sign in instead.',
      });
    }

    // Hash password
    const salt           = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let newUser = null;
    if (getDBStatus()) {
      newUser = await User.create({
        name:        name.trim(),
        email:       cleanEmail,
        password:    hashedPassword,
        role:        'steward',
        lastLoginAt: new Date(),
      });
    } else {
      newUser = {
        _id:         store.generateId(),
        name:        name.trim(),
        email:       cleanEmail,
        password:    hashedPassword,
        role:        'steward',
        avatar:      null,
        lastLoginAt: new Date(),
        createdAt:   new Date(),
      };
      if (!store.users) store.users = [];
      store.users.push(newUser);
    }

    const token = signToken(newUser);
    setAuthCookie(res, token);

    logger.info({
      event:  'email_register',
      userId: String(newUser._id),
      email:  newUser.email,
      name:   newUser.name,
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      data: {
        id:     String(newUser._id),
        name:   newUser.name,
        email:  newUser.email,
        avatar: newUser.avatar ?? null,
        role:   newUser.role,
      },
    });
  }),
);

// ── POST /api/auth/login ───────────────────────────────────────────────────
/**
 * Authenticates an existing user with Email and Password.
 */
router.post(
  '/login',
  validate([
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address.'),
    body('password')
      .notEmpty()
      .withMessage('Password is required.'),
  ]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    let user = null;
    if (getDBStatus()) {
      user = await User.findOne({ email: cleanEmail });
    } else {
      user = (store.users || []).find((u) => u.email === cleanEmail);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error:   'Invalid email or password. Please check your credentials.',
      });
    }

    // Check password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        error:   'This account was created via Google Sign-In. Please click "Sign in with Google".',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error:   'Invalid email or password. Please check your credentials.',
      });
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    if (getDBStatus()) {
      await user.save();
    }

    const token = signToken(user);
    setAuthCookie(res, token);

    logger.info({
      event:  'email_login',
      userId: String(user._id),
      email:  user.email,
      name:   user.name,
    });

    res.json({
      success: true,
      message: 'Signed in successfully.',
      token,
      data: {
        id:     String(user._id),
        name:   user.name,
        email:  user.email,
        avatar: user.avatar ?? null,
        role:   user.role,
      },
    });
  }),
);

// ── GET /api/auth/google ────────────────────────────────────────────────────
/**
 * Initiates the Google OAuth flow.
 */
router.get(
  '/google',
  passportInstance.authenticate('google', {
    scope:  ['profile', 'email'],
    prompt: 'select_account',
  }),
);

// ── GET /api/auth/google/callback ───────────────────────────────────────────
/**
 * OAuth callback — Google redirects here after user grants permission.
 */
router.get(
  '/google/callback',
  passportInstance.authenticate('google', {
    session:         false,
    failureRedirect: `${FRONTEND_URL}/?error=oauth_failed`,
  }),
  asyncHandler(async (req, res) => {
    const user  = req.user;
    const token = signToken(user);

    setAuthCookie(res, token);

    logger.info({
      event:  'oauth_success',
      userId: String(user._id),
      email:  user.email,
      role:   user.role,
    });

    res.redirect(`${FRONTEND_URL}/?token=${encodeURIComponent(token)}`);
  }),
);

// ── GET /api/auth/me ────────────────────────────────────────────────────────
/**
 * Returns the current authenticated user from the JWT.
 */
router.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
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
    if (req.cookies?.grootai_token) {
      try {
        const decoded = jwt.verify(req.cookies.grootai_token, JWT_SECRET);
        logger.info({ event: 'auth_logout', email: decoded.email });
      } catch (_) { /* ignore */ }
    }

    res.clearCookie('grootai_token', { path: '/' });
    res.json({ success: true, message: 'Signed out successfully.' });
  }),
);

export default router;
