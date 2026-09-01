/**
 * @module adminEmails
 * @description Client-side single source of truth for admin email list.
 * Matches the server-side config/adminEmails.js list exactly.
 * Never put private secrets here — this is public client-side code.
 *
 * Usage: import { ADMIN_EMAILS, isAdminEmail } from '../config/adminEmails.js';
 */

export const ADMIN_EMAILS = [
  'balaji.hdev@gmail.com',
  'h.balaji1964@gmail.com',
];

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
