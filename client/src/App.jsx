/**
 * @module App
 * @description Root application component.
 *
 * Auth flow:
 *  1. On mount → dispatch fetchCurrentUser (checks stored JWT via /api/auth/me)
 *  2. If token found in URL param (?token=) → store it, clear from URL, set auth state
 *  3. If authenticated → render full platform
 *  4. If guest mode → render full platform (read-only, no mutations)
 *  5. If neither → render <LoginPage /> (full-screen gate)
 *
 * Socket.io:
 *  • scan:progress events → toast notification
 *  • issue:alert events → toast notification
 *
 * Each tab wrapped in <ErrorBoundary> to prevent cascade failures.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch }                from 'react-redux';
import { AnimatePresence }                         from 'framer-motion';
import { Toaster }                                 from 'react-hot-toast';
import { io }                                      from 'socket.io-client';
import toast                                       from 'react-hot-toast';
import { Sparkles, Wifi, WifiOff }                 from 'lucide-react';

import { Navbar }            from './components/Navbar.jsx';
import { CSVUploadModal }    from './components/CSVUploadModal.jsx';
import { ErrorBoundary }     from './components/ErrorBoundary.jsx';
import { DashboardPage }     from './pages/DashboardPage.jsx';
import { ProfilerPage }      from './pages/ProfilerPage.jsx';
import { RuleComposerPage }  from './pages/RuleComposerPage.jsx';
import { IssueReviewPage }   from './pages/IssueReviewPage.jsx';
import { RemediationPage }   from './pages/RemediationPage.jsx';
import { EvalSuitePage }     from './pages/EvalSuitePage.jsx';
import { LoginPage }         from './pages/LoginPage.jsx';

import { fetchDatasets }     from './store/datasetSlice.js';
import { fetchPendingRemediations } from './store/remediationSlice.js';
import {
  fetchCurrentUser,
  setTokenFromUrl,
  enterGuestMode,
}                            from './store/authSlice.js';

// ---------------------------------------------------------------------------
// Socket singleton
// ---------------------------------------------------------------------------
let _socketInstance = null;

function getSocket() {
  if (!_socketInstance) {
    _socketInstance = io(import.meta.env.VITE_API_BASE_URL ?? '', {
      path:              '/socket.io',
      reconnectionDelay: 1000,
      transports:        ['websocket', 'polling'],
      autoConnect:       false,
    });
  }
  return _socketInstance;
}

// ---------------------------------------------------------------------------
// App Shell (rendered once auth is confirmed)
// ---------------------------------------------------------------------------
function AppShell() {
  const dispatch = useDispatch();
  const [activeTab,    setActiveTab]    = useState('dashboard');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isConnected,  setIsConnected]  = useState(false);

  const { pendingList } = useSelector((s) => s.remediation);

  // Bootstrap data
  useEffect(() => {
    dispatch(fetchDatasets());
    dispatch(fetchPendingRemediations());
  }, [dispatch]);

  // Socket.io
  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('scan:progress', (data) => {
      if (data?.phase === 'complete') {
        toast.success(
          `Scan complete — ${data.issueCount ?? 0} issue(s) found in ${data.datasetName}.`,
          { duration: 5000, icon: '🔍' },
        );
        dispatch(fetchPendingRemediations());
      }
    });

    socket.on('issue:alert', (data) => {
      toast.error(
        `⚠️ Critical issue on Record #${data.rowNumber}: ${data.explanation}`,
        { duration: 8000 },
      );
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('scan:progress');
      socket.off('issue:alert');
      socket.disconnect();
    };
  }, [dispatch]);

  const handleNavigate = useCallback((tab) => setActiveTab(tab), []);

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 flex flex-col
                    selection:bg-brand-500 selection:text-slate-950">

      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* HITL Notification Ribbon */}
      <AnimatePresence>
        {pendingList?.length > 0 && activeTab !== 'remediation' && (
          <div className="bg-gradient-to-r from-brand-amber/20 via-brand-amber/10 to-brand-amber/20
                          border-b border-brand-amber/30 px-4 py-2 text-xs
                          flex items-center justify-between text-amber-200">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-brand-amber animate-pulse" />
                <span>
                  <strong className="text-white">{pendingList.length} AI Remediation Proposals</strong>{' '}
                  awaiting human review — no data mutated until approved.
                </span>
              </div>
              <button
                onClick={() => setActiveTab('remediation')}
                className="px-2.5 py-0.5 rounded bg-brand-amber text-slate-950
                           font-bold hover:bg-amber-300 transition-colors"
              >
                Review Now
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <ErrorBoundary key="dashboard">
              <DashboardPage onOpenUpload={() => setIsUploadOpen(true)} onNavigate={handleNavigate} />
            </ErrorBoundary>
          )}
          {activeTab === 'profiler' && (
            <ErrorBoundary key="profiler">
              <ProfilerPage />
            </ErrorBoundary>
          )}
          {activeTab === 'rules' && (
            <ErrorBoundary key="rules">
              <RuleComposerPage />
            </ErrorBoundary>
          )}
          {activeTab === 'issues' && (
            <ErrorBoundary key="issues">
              <IssueReviewPage onNavigate={handleNavigate} />
            </ErrorBoundary>
          )}
          {activeTab === 'remediation' && (
            <ErrorBoundary key="remediation">
              <RemediationPage />
            </ErrorBoundary>
          )}
          {activeTab === 'eval' && (
            <ErrorBoundary key="eval">
              <EvalSuitePage />
            </ErrorBoundary>
          )}
        </AnimatePresence>
      </main>

      <CSVUploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-dark-950/90 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
                        flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span>GrootAi · Autonomous Agentic Data Quality &amp; Observability Platform</span>
          </div>
          <div className="flex items-center space-x-4 text-slate-400 font-mono text-[11px]">
            <span className={`flex items-center space-x-1 ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isConnected ? 'Live' : 'Offline'}</span>
            </span>
            <span>·</span>
            <span>MCP Server Active</span>
            <span>·</span>
            <span>Zero Unsupervised Mutations</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loader Screen
// ---------------------------------------------------------------------------
function AuthLoader() {
  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-indigo to-brand-500
                      flex items-center justify-center shadow-glow-indigo">
        <Sparkles className="w-6 h-6 text-white animate-pulse" />
      </div>
      <p className="text-xs text-slate-400 font-medium animate-pulse">
        Authenticating…
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App Root — Auth Gate
// ---------------------------------------------------------------------------
export function App() {
  const dispatch = useDispatch();

  const { isAuthenticated, isGuestMode, loading } = useSelector((s) => s.auth);

  // ── On boot: handle ?token= from Google OAuth redirect ─────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');

    if (token) {
      // Decode the JWT payload (no verify here — server already verified it)
      try {
        const payloadB64 = token.split('.')[1];
        const payload    = JSON.parse(atob(payloadB64));

        dispatch(setTokenFromUrl({
          token,
          user: {
            id:     payload.sub,
            email:  payload.email,
            name:   payload.name,
            avatar: payload.avatar ?? null,
            role:   payload.role   ?? 'steward',
          },
        }));

        toast.success(`Welcome back, ${payload.name}! 👋`, { duration: 4000 });
      } catch (_) {
        toast.error('Authentication failed — invalid token. Please try again.');
      }

      // Clean the token from the URL so it's not visible in the address bar
      const cleanUrl = window.location.pathname + (params.toString().replace(/token=[^&]*/,'').replace(/^&/,'') ? '?' + params.toString().replace(/token=[^&]*/,'').replace(/^&/,'') : '');
      window.history.replaceState({}, '', cleanUrl || '/');
      return;
    }

    // No URL token — try to rehydrate from stored JWT
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  // ── Auth state machine ──────────────────────────────────────────────────
  if (loading) return <AuthLoader />;

  if (!isAuthenticated && !isGuestMode) {
    return (
      <>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background:  '#1e293b',
              color:       '#f1f5f9',
              border:      '1px solid rgba(255,255,255,0.06)',
              fontSize:    '13px',
              fontWeight:  600,
              borderRadius:'12px',
            },
          }}
        />
        <LoginPage />
      </>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background:  '#1e293b',
            color:       '#f1f5f9',
            border:      '1px solid rgba(255,255,255,0.06)',
            fontSize:    '13px',
            fontWeight:  600,
            borderRadius:'12px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
          error:   { iconTheme: { primary: '#f43f5e', secondary: '#f1f5f9' } },
        }}
      />
      <AppShell />
    </>
  );
}

export default App;
