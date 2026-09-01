/**
 * @module SettingsPage
 * @description User profile and platform statistics settings panel.
 * Shows current user identity, role badge, account type, and aggregated
 * platform usage metrics pulled from Redux store slices.
 */
import React, { useMemo } from 'react';
import { useSelector }    from 'react-redux';
import { motion }         from 'framer-motion';
import {
  User, Mail, Shield, Database, BookOpen,
  ShieldAlert, CheckCircle2, Sparkles, LogOut,
  Key, Globe, Settings2,
} from 'lucide-react';
import { clearToken }    from '../store/authSlice.js';
import { useDispatch }   from 'react-redux';
import { logoutUser }    from '../store/authSlice.js';

import { PageTransition } from '../components/PageTransition.jsx';

// ── Role metadata ─────────────────────────────────────────────────────────
const ROLE_META = {
  steward:   { label: 'Data Steward',  color: 'brand-500',  bg: 'brand-500/10',  border: 'brand-500/30' },
  analyst:   { label: 'Analyst',       color: 'brand-cyan', bg: 'brand-cyan/10', border: 'brand-cyan/30' },
  admin:     { label: 'Admin',         color: 'brand-amber',bg: 'brand-amber/10',border: 'brand-amber/30'},
  viewer:    { label: 'Viewer',        color: 'slate-400',  bg: 'slate-800',     border: 'slate-700'     },
};

// ── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = 'brand-500' }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center space-x-4"
    >
      <div className={`w-10 h-10 rounded-xl bg-${color}/10 flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 text-${color}`} />
      </div>
      <div>
        <p className="text-[11px] text-slate-400 uppercase tracking-wider font-bold">{label}</p>
        <p className="text-xl font-extrabold text-white font-mono">{value}</p>
      </div>
    </motion.div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
      <div className="flex items-center space-x-3 text-xs text-slate-400">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="font-bold uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xs font-mono text-slate-200">{value}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export const SettingsPage = () => {
  const dispatch = useDispatch();
  const { user, isGuestMode } = useSelector((s) => s.auth);
  const { list: datasets }    = useSelector((s) => s.datasets);
  const { rulesList }         = useSelector((s) => s.rules);
  const { pendingList, auditLog } = useSelector((s) => s.remediation);
  const { items: issueItems } = useSelector((s) => s.issues);

  const role     = user?.role ?? 'steward';
  const roleMeta = ROLE_META[role] ?? ROLE_META.steward;

  // Avatar initials
  const initials = useMemo(() => {
    const name = user?.name ?? 'Guest User';
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }, [user]);

  const totalIssues   = issueItems?.length ?? 0;
  const resolved      = auditLog?.filter((a) => a.status === 'applied').length ?? 0;
  const activeRules   = rulesList?.filter((r) => r.status === 'active').length ?? 0;
  const datasetsCount = datasets?.length ?? 0;

  const accountType = isGuestMode
    ? 'Guest / Demo Mode'
    : user?.googleId
    ? 'Google OAuth'
    : 'Email & Password';

  return (
    <PageTransition>
      <div className="space-y-8 animate-fade-in pb-12">

        {/* Header */}
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Settings & Profile</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20">
              ACCOUNT
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage your identity, view platform usage stats, and audit your session.
          </p>
        </div>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center gap-6"
        >
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-indigo to-brand-500 flex items-center justify-center text-2xl font-extrabold text-white shadow-glow-indigo shrink-0 select-none">
            {initials}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <h2 className="text-lg font-extrabold text-white">
                {isGuestMode ? 'Guest User' : (user?.name ?? 'Unknown')}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold
                bg-${roleMeta.bg} text-${roleMeta.color} border border-${roleMeta.border}`}>
                {roleMeta.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono truncate">
              {isGuestMode ? 'demo@grootai.local' : (user?.email ?? 'N/A')}
            </p>
            <p className="text-xs text-slate-500 mt-1 flex items-center space-x-1">
              <Key className="w-3 h-3" />
              <span>{accountType}</span>
            </p>
          </div>

          {/* Sign Out */}
          {!isGuestMode && (
            <button
          onClick={() => dispatch(logoutUser())}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold
                bg-rose-500/10 text-rose-400 border border-rose-500/30
                hover:bg-rose-500/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          )}
        </motion.div>

        {/* Account Info */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <Settings2 className="w-4 h-4 text-brand-indigo" />
            <span>Account Details</span>
          </h3>
          <InfoRow icon={User}   label="Display Name"   value={isGuestMode ? 'Guest User' : (user?.name ?? '—')} />
          <InfoRow icon={Mail}   label="Email Address"  value={isGuestMode ? 'demo@grootai.local' : (user?.email ?? '—')} />
          <InfoRow icon={Shield} label="Role"           value={roleMeta.label} />
          <InfoRow icon={Key}    label="Auth Method"    value={accountType} />
          <InfoRow icon={Globe}  label="Session ID"     value={user?.id ? user.id.slice(-12) : 'guest-session'} />
        </div>

        {/* Platform Usage Stats */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <span>Platform Usage</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Database}     label="Datasets"         value={datasetsCount}  color="brand-cyan"  />
            <StatCard icon={BookOpen}     label="Active Rules"     value={activeRules}    color="brand-500"   />
            <StatCard icon={ShieldAlert}  label="Open Issues"      value={totalIssues}    color="brand-amber" />
            <StatCard icon={CheckCircle2} label="Fixes Applied"    value={resolved}       color="emerald-400" />
          </div>
        </div>

        {/* Platform Identity & Creator Banner */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-5 rounded-2xl border border-brand-500/20 bg-brand-500/5
                     flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-indigo to-brand-500 flex items-center justify-center shrink-0 shadow-glow-indigo">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">GrootAi — Autonomous Agentic Data Quality Platform</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Zero Unsupervised Mutations · Human-in-the-Loop HITL · Execute-Before-Trust™
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            <span className="px-3 py-1 rounded-xl text-xs font-bold bg-brand-indigo/20 text-brand-indigo border border-brand-indigo/30">
              Done by Balaji H
            </span>
          </div>
        </motion.div>

        {/* Footer Attribution */}
        <div className="text-center pt-2">
          <p className="text-[11px] text-slate-400 font-medium">
            © {new Date().getFullYear()} GrootAi · All rights Reserved by Balaji H
          </p>
        </div>

      </div>
    </PageTransition>
  );
};

