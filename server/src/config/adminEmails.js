/**
 * @module adminEmails
 * @description Single source of truth for the admin email whitelist.
 * Previously this list was duplicated in 4 files (auth.routes.js, passport.js,
 * authSlice.js, App.jsx). Any change to admin emails now only requires editing here.
 *
 * Usage (server): import { ADMIN_EMAILS, isAdminEmail } from './adminEmails.js';
 */

export const ADMIN_EMAILS = [
  'balaji.hdev@gmail.com',
  'h.balaji1964@gmail.com',
  process.env.ADMIN_EMAIL,
].filter(Boolean);

/**
 * Returns true if the given email belongs to the admin whitelist.
 * Case-insensitive comparison.
 * @param {string} email
 * @returns {boolean}
 */
export const isAdminEmail = (email) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};
