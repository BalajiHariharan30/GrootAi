/**
 * @module passport
 * @description Passport.js configuration for Google OAuth 2.0.
 *
 * Strategy:
 *  • Uses GoogleStrategy from passport-google-oauth20
 *  • On successful Google login, upserts the User document
 *    (creates on first login, updates lastLoginAt on every subsequent login)
 *  • No session serialization — we use stateless JWT tokens
 *
 * Required ENV vars:
 *  GOOGLE_CLIENT_ID      → from Google Cloud Console
 *  GOOGLE_CLIENT_SECRET  → from Google Cloud Console
 *  GOOGLE_CALLBACK_URL   → e.g. http://localhost:5000/api/auth/google/callback
 */
import passport            from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv              from 'dotenv';
import path                from 'path';
import { fileURLToPath }   from 'url';
import { User }            from '../models/User.js';
import { store }           from '../data/inMemoryStore.js';
import { getDBStatus }     from '../config/db.js';
import logger              from '../config/logger.js';

// Load .env from both local and root if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const clientID = process.env.GOOGLE_CLIENT_ID || 'placeholder-google-client-id';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'placeholder-google-client-secret';
const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback';

if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'your_google_client_id.apps.googleusercontent.com') {
  logger.warn({
    event: 'oauth_config_warning',
    message: 'GOOGLE_CLIENT_ID not set or using placeholder. Google Sign-In will require real credentials in .env, but Guest/Demo mode is fully active.'
  });
}

passport.use(
  new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL,
      scope: ['profile', 'email'],
    },

    /**
     * Verify callback — called after Google returns the user profile.
     * Upserts the user in storage and passes it to `done`.
     *
     * @param {string}   _accessToken
     * @param {string}   _refreshToken
     * @param {object}   profile        Raw Google profile object
     * @param {Function} done
     */
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email    = profile.emails?.[0]?.value ?? '';
        const name     = profile.displayName ?? 'GrootAi User';
        const avatar   = profile.photos?.[0]?.value ?? null;

        let user = null;

        if (getDBStatus()) {
          // MongoDB: findOneAndUpdate (upsert)
          user = await User.findOneAndUpdate(
            { googleId },
            {
              $set: {
                email,
                name,
                avatar,
                lastLoginAt: new Date(),
              },
              $setOnInsert: { role: 'steward' },
            },
            { upsert: true, new: true, runValidators: true },
          );
        } else {
          // In-memory store fallback
          user = store.users?.find((u) => u.googleId === googleId);

          if (user) {
            user.email       = email;
            user.name        = name;
            user.avatar      = avatar;
            user.lastLoginAt = new Date();
          } else {
            user = {
              _id:         store.generateId(),
              googleId,
              email,
              name,
              avatar,
              role:        'steward',
              lastLoginAt: new Date(),
              createdAt:   new Date(),
            };
            if (!store.users) store.users = [];
            store.users.push(user);
          }
        }

        logger.info({
          event:  'oauth_login',
          userId: String(user._id),
          email:  user.email,
          name:   user.name,
        });

        return done(null, user);
      } catch (err) {
        logger.error({ event: 'oauth_error', error: err.message });
        return done(err, null);
      }
    },
  ),
);

// Stateless JWT — no session serialization needed
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

export default passport;
