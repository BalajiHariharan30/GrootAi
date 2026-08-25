/**
 * @module Navbar
 * @description Top navigation bar with brand, tab links, dataset switcher,
 * run scan button, notification bell, Settings tab, and authenticated UserAvatar.
 */
import React, { useState }               from 'react';
import { useSelector, useDispatch }      from 'react-redux';
import { setSelectedDataset, triggerScan } from '../store/datasetSlice.js';
import { UserAvatar }                    from './UserAvatar.jsx';
import PropTypes                         from 'prop-types';
import { motion, AnimatePresence }       from 'framer-motion';
import {
  Database, Sparkles, Layers, ShieldAlert,
  UserCheck, Cpu, Activity, RefreshCw, Play, BarChart3,
  Settings, Bell, X,
} from 'lucide-react';

const NAV_TABS = [
  { id: 'dashboard',   label: 'Catalog',       icon: Database    },
  { id: 'profiler',    label: 'Auto-Profiler',  icon: Layers      },
  { id: 'rules',       label: 'NL Rules',       icon: Cpu         },
  { id: 'issues',      label: 'Issue Triage',   icon: ShieldAlert },
  { id: 'remediation', label: 'HITL Approvals', icon: UserCheck   },
  { id: 'eval',        label: 'AI Reliability', icon: BarChart3   },
  { id: 'settings',    label: 'Settings',       icon: Settings    },
];

export const Navbar = ({ activeTab, setActiveTab, onOpenUpload }) => {
  const dispatch = useDispatch();
  const { list: datasets, selectedDatasetId, scanning } = useSelector((s) => s.datasets);
  const { pendingList }       = useSelector((s) => s.remediation);
  const { user, isGuestMode } = useSelector((s) => s.auth);

  const [notifOpen, setNotifOpen] = useState(false);

  // Collect recent notifications from pending list as a simple bell panel
  const notifications = pendingList.slice(0, 5).map((p) => ({
    id:   String(p._id),
    text: `Row #${p.rowNumber} — AI fix proposal (${Math.round((p.confidence ?? 0) * 100)}% confidence)`,
    time: p.createdAt ? new Date(p.createdAt).toLocaleTimeString() : 'Just now',
  }));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-dark-950/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

        {/* ── Brand ──────────────────────────────────────────────── */}
        <div
          className="flex items-center space-x-3 cursor-pointer shrink-0"
          onClick={() => setActiveTab('dashboard')}
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl
                          bg-gradient-to-tr from-brand-600 via-brand-cyan to-brand-indigo
                          shadow-glow-emerald p-0.5">
            <div className="w-full h-full bg-dark-900 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-brand-400 animate-pulse-slow" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight text-white">GrootAi</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-brand-500/10
                               text-brand-400 border border-brand-500/20 uppercase tracking-wider">
                AGENTIC AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 tracking-wide font-medium">
              Agentic Data Quality &amp; Observability
            </p>
          </div>
        </div>

        {/* ── Navigation Links ───────────────────────────────────── */}
        <nav className="hidden md:flex items-center space-x-0.5 overflow-x-auto">
          {NAV_TABS.map((tab) => {
            const Icon     = tab.icon;
            const isActive = activeTab === tab.id;
            const badge    = tab.id === 'remediation' ? pendingList?.length : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs
                            font-semibold transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800/90 text-white shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-brand-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {badge > 0 && (
                  <span className="ml-0.5 px-1.5 rounded-full text-[10px] font-bold
                                   bg-brand-amber/20 text-brand-amber border border-brand-amber/30 animate-pulse">
                    {badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px]
                                   bg-gradient-to-r from-brand-400 to-brand-cyan rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Right Side ─────────────────────────────────────────── */}
        <div className="flex items-center space-x-2">
          {/* Dataset Dropdown */}
          <select
            value={selectedDatasetId || ''}
            onChange={(e) => dispatch(setSelectedDataset(e.target.value))}
            className="hidden lg:block bg-slate-900 border border-slate-700/70 text-slate-200
                       text-xs font-medium rounded-lg px-3 py-1.5 focus:outline-none
                       focus:border-brand-500 transition-colors cursor-pointer max-w-[160px]"
          >
            {datasets.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.rowCount || 0} rows)
              </option>
            ))}
          </select>

          {/* Run Scan */}
          <button
            disabled={scanning || !selectedDatasetId}
            onClick={() => dispatch(triggerScan(selectedDatasetId))}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg
                       bg-gradient-to-r from-brand-500 to-brand-600
                       hover:from-brand-400 hover:to-brand-500
                       text-slate-950 font-bold text-xs shadow-glow-emerald
                       transition-all active:scale-95 disabled:opacity-50"
          >
            {scanning
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <Play className="w-3.5 h-3.5 fill-current" />
            }
            <span className="hidden sm:inline">{scanning ? 'Scanning…' : 'Run Scan'}</span>
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 rounded-lg bg-slate-900 border border-slate-800
                         text-slate-400 hover:text-white transition-colors"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full
                                 bg-brand-amber text-slate-950 text-[9px] font-extrabold
                                 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            {/* Notification Panel */}
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1    }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-11 w-80 bg-dark-900 border border-slate-800
                             rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Notifications</span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No new notifications</p>
                  ) : (
                    <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => { setActiveTab('remediation'); setNotifOpen(false); }}
                          className="flex items-start space-x-3 px-4 py-3 hover:bg-slate-800/60
                                     cursor-pointer transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-brand-amber mt-1.5 shrink-0 animate-pulse" />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-200 leading-snug">{n.text}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{n.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {notifications.length > 0 && (
                    <div
                      onClick={() => { setActiveTab('remediation'); setNotifOpen(false); }}
                      className="px-4 py-2.5 text-center text-xs font-bold text-brand-400
                                 hover:text-brand-300 cursor-pointer border-t border-slate-800
                                 hover:bg-slate-800/40 transition-colors"
                    >
                      View All in HITL Center →
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Avatar */}
          <UserAvatar user={user} isGuestMode={isGuestMode} />
        </div>
      </div>
    </header>
  );
};

Navbar.propTypes = {
  activeTab:    PropTypes.string.isRequired,
  setActiveTab: PropTypes.func.isRequired,
  onOpenUpload: PropTypes.func.isRequired,
};
