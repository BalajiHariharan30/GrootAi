/**
 * @module LoginPage
 * @description Full-screen premium Google OAuth login page.
 *
 * Features:
 *  • Animated gradient orbs in background (Framer Motion)
 *  • GrootAi branding with glassmorphic card
 *  • Official "Sign in with Google" button (brand-compliant)
 *  • "Continue as Guest (Demo Mode)" secondary CTA
 *  • Animated feature highlight pills
 *  • PropTypes validation
 */
import React, { memo }              from 'react';
import { motion }                   from 'framer-motion';
import { useDispatch }              from 'react-redux';
import PropTypes                    from 'prop-types';
import { enterGuestMode }           from '../store/authSlice.js';
import {
  Sparkles, ShieldCheck, Cpu, Zap, Database,
  Users, ArrowRight,
} from 'lucide-react';

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
    // Redirect to the backend Google OAuth initiation endpoint
    window.location.href = '/api/auth/google';
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, boxShadow: '0 0 24px rgba(255,255,255,0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={handleGoogleLogin}
      className="w-full flex items-center justify-center space-x-3
                 bg-white hover:bg-gray-50 text-gray-700 font-semibold
                 text-sm rounded-xl px-5 py-3.5
                 border border-gray-200 shadow-lg
                 transition-colors cursor-pointer"
    >
      {/* Official Google "G" SVG logo */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
      <span>Sign in with Google</span>
    </motion.button>
  );
});

GoogleSignInButton.displayName = 'GoogleSignInButton';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const LoginPage = () => {
  const dispatch = useDispatch();

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center
                    px-4 overflow-hidden relative">

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

          <div className="px-8 pt-10 pb-8 space-y-8">

            {/* ── Brand Header ────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="text-center space-y-3"
            >
              <div className="flex items-center justify-center space-x-2.5 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-indigo to-brand-500
                                flex items-center justify-center shadow-glow-indigo">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-extrabold text-white tracking-tight">
                  GrootAi
                </span>
              </div>
              <h1 className="text-2xl font-extrabold text-white leading-tight">
                Welcome back
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                Sign in to access the Enterprise Agentic Data Quality &amp; Observability Platform.
              </p>
            </motion.div>

            {/* ── Feature Pills ────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-2 gap-3 py-2"
            >
              {FEATURES.map((f, i) => (
                <FeaturePill
                  key={f.label}
                  icon={f.icon}
                  label={f.label}
                  delay={0.3 + i * 0.07}
                />
              ))}
            </motion.div>

            {/* ── Auth Actions ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="space-y-3"
            >
              {/* Primary: Google Sign In */}
              <GoogleSignInButton />

              {/* Divider */}
              <div className="flex items-center space-x-3">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[11px] text-slate-500 font-medium">or</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {/* Secondary: Guest Demo Mode */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => dispatch(enterGuestMode())}
                className="w-full flex items-center justify-center space-x-2
                           text-xs text-slate-400 hover:text-slate-200
                           py-3 rounded-xl border border-slate-800
                           hover:border-slate-700 hover:bg-slate-900/50
                           transition-all font-semibold"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Continue as Guest (Demo Mode)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
            </motion.div>

            {/* ── Footer Note ──────────────────────────────────────── */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center text-[11px] text-slate-600 leading-relaxed"
            >
              Guest mode is read-only. Sign in with Google to activate rules,
              approve remediations, and have your name recorded in the audit log.
            </motion.p>
          </div>
        </div>

        {/* Bottom tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center text-[11px] text-slate-600 mt-5"
        >
          GrootAi · Zero Unsupervised Data Mutations · MCP Protocol
        </motion.p>
      </motion.div>
    </div>
  );
};
