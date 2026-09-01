/**
 * @module LoginPage
 * @description Full-screen premium authentication page supporting both
 * Email & Password sign in / registration and Google OAuth 2.0.
 *
 * Features:
 *  • Toggle between "Sign In" and "Create Account"
 *  • Clean email & password input validation
 *  • Real-time error feedback banner
 *  • Official "Sign in with Google" button (brand-compliant)
 *  • "Continue as Guest (Demo Mode)" 1-click CTA
 *  • Animated gradient orbs and Framer Motion micro-interactions
 *  • PropTypes validation
 */
import React, { useState, memo }     from 'react';
import { motion, AnimatePresence }   from 'framer-motion';
import { useDispatch, useSelector }  from 'react-redux';
import PropTypes                     from 'prop-types';
import {
  loginWithEmail,
  registerWithEmail,
  enterGuestMode,
  clearAuthError,
}                                    from '../store/authSlice.js';
import {
  Sparkles, ShieldCheck, Cpu, Zap, Database,
  Users, ArrowRight, Mail, Lock, User, AlertCircle, Loader2,
}                                    from 'lucide-react';

// ---------------------------------------------------------------------------
// Feature pill data
// ---------------------------------------------------------------------------
const FEATURES = [
  { icon: Cpu,         label: 'Agentic AI Rule Engine'          },
  { icon: ShieldCheck, label: 'Human-in-the-Loop Oversight'     },
  { icon: Zap,         label: 'Real-time Issue Detection'        },
  { icon: Database,    label: 'Auto-Profiling & Schema Drift'   },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const FeaturePill = memo(({ icon: Icon, label, delay }) => (
  <motion.div
    initial={{ opacity: 0, x: -12 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="flex items-center space-x-2.5 text-xs text-slate-300"
  >
    <div className="w-7 h-7 rounded-lg bg-brand-500/10 border border-brand-500/20
                    flex items-center justify-center shrink-0">
      <Icon className="w-3.5 h-3.5 text-brand-400" />
    </div>
    <span>{label}</span>
  </motion.div>
));

FeaturePill.displayName = 'FeaturePill';
FeaturePill.propTypes   = {
  icon:  PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  delay: PropTypes.number.isRequired,
};

// ---------------------------------------------------------------------------
// Google Sign-In Button (brand-compliant white button)
// ---------------------------------------------------------------------------
const GoogleSignInButton = memo(() => {
  const handleGoogleLogin = () => {
    const base = import.meta.env.VITE_API_URL || '';
    window.location.href = `${base}/api/auth/google`;
  };

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.01, boxShadow: '0 0 20px rgba(255,255,255,0.06)' }}
      whileTap={{ scale: 0.99 }}
      onClick={handleGoogleLogin}
      className="w-full flex items-center justify-center space-x-3
                 bg-white hover:bg-gray-50 text-gray-700 font-semibold
                 text-xs rounded-xl px-4 py-2.5
                 border border-gray-200 shadow-md
                 transition-colors cursor-pointer"
    >
      {/* Official Google "G" SVG logo */}
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path
          d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          fill="#4285F4"
        />
        <path
          d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
          fill="#34A853"
        />
        <path
          d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
          fill="#FBBC05"
        />
        <path
          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          fill="#EA4335"
        />
      </svg>
      <span>Continue with Google</span>
    </motion.button>
  );
});

GoogleSignInButton.displayName = 'GoogleSignInButton';

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export const LoginPage = () => {
  const dispatch = useDispatch();
  const { authSubmitting, error } = useSelector((s) => s.auth);

  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleTabChange = (newMode) => {
    setMode(newMode);
    setLocalError('');
    dispatch(clearAuthError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    dispatch(clearAuthError());

    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both your email address and password.');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setLocalError('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters long.');
        return;
      }
      dispatch(registerWithEmail({ name, email, password }));
    } else {
      dispatch(loginWithEmail({ email, password }));
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center
                    px-4 py-8 overflow-hidden relative">

      {/* ── Animated Background Orbs ────────────────────────────────── */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px]
                   bg-brand-indigo/20 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px]
                   bg-brand-500/20 rounded-full blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        className="absolute top-[40%] left-[60%] w-[400px] h-[400px]
                   bg-brand-cyan/10 rounded-full blur-[100px] pointer-events-none"
      />

      {/* ── Login Card ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-panel rounded-3xl border border-slate-700/60
                        shadow-2xl overflow-hidden">

          {/* Top gradient bar */}
          <div className="h-1 bg-gradient-to-r from-brand-indigo via-brand-cyan to-brand-500" />

          <div className="px-7 pt-8 pb-7 space-y-6">

            {/* ── Brand Header ────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="text-center space-y-2"
            >
              <div className="flex items-center justify-center space-x-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-indigo to-brand-500
                                flex items-center justify-center shadow-glow-indigo">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-extrabold text-white tracking-tight">
                  GrootAi
                </span>
              </div>
              <h1 className="text-xl font-extrabold text-white leading-tight">
                {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                Autonomous Agentic Data Quality &amp; Observability Platform
              </p>
            </motion.div>

            {/* ── Mode Switcher Tabs ───────────────────────────────── */}
            <div className="flex p-1 bg-slate-900/90 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => handleTabChange('login')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'login'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === 'register'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Register
              </button>
            </div>

            {/* ── Error Banner ─────────────────────────────────────── */}
            <AnimatePresence>
              {displayError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="leading-snug">{displayError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Email & Password Form ────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1"
                >
                  <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                    />
                  </div>
                </motion.div>
              )}

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Min 8 characters' : 'Enter your password'}
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={authSubmitting}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center space-x-2
                           bg-gradient-to-r from-brand-500 to-brand-600
                           hover:from-brand-400 hover:to-brand-500
                           text-slate-950 font-bold text-xs rounded-xl py-3
                           shadow-glow-emerald transition-all cursor-pointer
                           disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {authSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{mode === 'login' ? 'Signing in…' : 'Creating Account…'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Sign In with Email' : 'Create Account'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </motion.button>
            </form>

            {/* ── Divider ──────────────────────────────────────────── */}
            <div className="flex items-center space-x-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[11px] text-slate-400 font-medium">or continue with</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* ── Social & Guest CTAs ──────────────────────────────── */}
            <div className="space-y-2.5">
              <GoogleSignInButton />

              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => dispatch(enterGuestMode())}
                className="w-full flex items-center justify-center space-x-2
                           text-xs text-slate-400 hover:text-slate-200
                           py-2.5 rounded-xl border border-slate-800
                           hover:border-slate-700 hover:bg-slate-900/50
                           transition-all font-semibold"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Explore as Guest (1-Click Demo)</span>
              </motion.button>
            </div>

            {/* ── Feature Pills ────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-800/80">
              {FEATURES.map((f, i) => (
                <FeaturePill
                  key={f.label}
                  icon={f.icon}
                  label={f.label}
                  delay={0.2 + i * 0.05}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom tagline & Copyright */}
        <div className="text-center space-y-1 mt-4">
          <p className="text-[11px] text-slate-400 font-medium">
            © {new Date().getFullYear()} GrootAi · All rights Reserved by Balaji H
          </p>
          <p className="text-[10px] text-slate-400">
            Zero Unsupervised Data Mutations · Execute-Before-Trust™ · MCP Protocol
          </p>
        </div>
      </motion.div>
    </div>
  );
};


