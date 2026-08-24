/**
 * @module UserAvatar
 * @description Navbar user avatar component with dropdown menu.
 *
 * Shows:
 *  • Google profile photo (or generated initials fallback)
 *  • Display name and role badge
 *  • Dropdown: role label, divider, Sign Out button
 *
 * Guest mode variant shows a different badge and no sign-out option.
 */
import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useDispatch }   from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes         from 'prop-types';
import { logoutUser, enterGuestMode } from '../store/authSlice.js';
import { LogOut, ChevronDown, User, Shield } from 'lucide-react';
import { StatusBadge } from './StatusBadge.jsx';

// ---------------------------------------------------------------------------
// Initials avatar fallback
// ---------------------------------------------------------------------------

/**
 * Generates a coloured initials avatar when no Google photo is available.
 * @param {{ name: string; size?: string }} props
 */
const InitialsAvatar = memo(({ name, size = 'w-8 h-8' }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className={`${size} rounded-full bg-gradient-to-br from-brand-indigo to-brand-500
                  flex items-center justify-center text-white font-bold text-xs select-none`}
    >
      {initials}
    </div>
  );
});

InitialsAvatar.displayName = 'InitialsAvatar';
InitialsAvatar.propTypes   = { name: PropTypes.string.isRequired, size: PropTypes.string };

// ---------------------------------------------------------------------------
// UserAvatar
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   user:        { name: string; email: string; avatar: string | null; role: string } | null;
 *   isGuestMode: boolean;
 * }} props
 */
export const UserAvatar = memo(({ user, isGuestMode }) => {
  const dispatch     = useDispatch();
  const [open, setOpen] = useState(false);
  const ref          = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await dispatch(logoutUser());
  }, [dispatch]);

  const handleGuestLogin = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  // ── Guest Mode Banner ────────────────────────────────────────────────────
  if (isGuestMode) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700
                        flex items-center justify-center">
          <User className="w-4 h-4 text-slate-400" />
        </div>
        <div className="hidden md:block">
          <p className="text-xs font-bold text-slate-300">Guest (Demo)</p>
          <StatusBadge label="Read Only" variant="neutral" size="sm" />
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleGuestLogin}
          className="hidden md:flex items-center space-x-1 ml-2 px-3 py-1.5 rounded-lg
                     text-[11px] font-bold bg-brand-500/10 hover:bg-brand-500/20
                     text-brand-400 border border-brand-500/20 transition-colors"
        >
          <span>Sign in with Google</span>
        </motion.button>
      </div>
    );
  }

  if (!user) return null;

  const roleVariant = user.role === 'admin' ? 'critical' : user.role === 'steward' ? 'active' : 'info';

  // ── Authenticated User ───────────────────────────────────────────────────
  return (
    <div className="relative" ref={ref}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center space-x-2 pl-1 pr-2.5 py-1 rounded-full
                   bg-slate-900/80 border border-slate-700/80
                   hover:border-slate-600 transition-colors"
      >
        {/* Avatar */}
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-7 h-7 rounded-full ring-1 ring-brand-500/40"
            referrerPolicy="no-referrer"
          />
        ) : (
          <InitialsAvatar name={user.name} size="w-7 h-7" />
        )}

        {/* Name & role (hidden on small screens) */}
        <div className="hidden md:block text-left">
          <p className="text-xs font-bold text-white leading-tight max-w-[120px] truncate">
            {user.name}
          </p>
          <p className="text-[10px] text-slate-400 capitalize">{user.role}</p>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </motion.button>

      {/* ── Dropdown ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-60
                       glass-panel rounded-2xl border border-slate-700/80
                       shadow-2xl z-50 overflow-hidden"
          >
            {/* User info header */}
            <div className="px-4 pt-4 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-10 h-10 rounded-full ring-2 ring-brand-500/30"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <InitialsAvatar name={user.name} size="w-10 h-10" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center space-x-2">
                <Shield className="w-3 h-3 text-slate-400" />
                <span className="text-[11px] text-slate-400">Role:</span>
                <StatusBadge label={user.role} variant={roleVariant} size="sm" />
              </div>
            </div>

            {/* Actions */}
            <div className="p-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl
                           text-xs font-semibold text-slate-300 hover:text-white
                           hover:bg-rose-500/10 hover:text-rose-300
                           transition-colors text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

UserAvatar.displayName = 'UserAvatar';
UserAvatar.propTypes   = {
  user: PropTypes.shape({
    name:   PropTypes.string.isRequired,
    email:  PropTypes.string.isRequired,
    avatar: PropTypes.string,
    role:   PropTypes.string.isRequired,
  }),
  isGuestMode: PropTypes.bool.isRequired,
};
