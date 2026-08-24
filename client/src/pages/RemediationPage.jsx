/**
 * @module RemediationPage
 * @description Human-in-the-Loop (HITL) Remediation Center.
 *
 * Engineering decisions:
 *  • Strict HITL invariant: zero data mutations without explicit approval
 *  • `AnimatePresence` animates proposal cards in/out on queue changes
 *  • `react-hot-toast` provides non-blocking confirmation feedback
 *  • Empty state rendered with Framer Motion entrance animation
 *  • `StatusBadge` replaces ad-hoc inline badge styles
 *  • `PageTransition` wraps the whole page for consistent route animation
 *  • Audit log tab uses a virtualised-friendly overflow scroll container
 */
import React, { useEffect, useState, useCallback, memo } from 'react';
import { useSelector, useDispatch }                       from 'react-redux';
import { motion, AnimatePresence }                        from 'framer-motion';
import toast                                              from 'react-hot-toast';
import PropTypes                                          from 'prop-types';
import {
  UserCheck, History, CheckCircle2, GitCommit,
} from 'lucide-react';

import {
  fetchPendingRemediations,
  fetchAuditLog,
  approveRemediation,
  rejectRemediation,
}                                    from '../store/remediationSlice.js';
import { RemediationProposalCard }   from '../components/RemediationProposalCard.jsx';
import { StatusBadge }               from '../components/StatusBadge.jsx';
import { PageTransition }            from '../components/PageTransition.jsx';

// ---------------------------------------------------------------------------
// Audit Log Row — memoised to prevent re-renders on unrelated state changes
// ---------------------------------------------------------------------------

const AuditRow = memo(({ item, idx }) => (
  <motion.tr
    key={String(item._id ?? idx)}
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0  }}
    transition={{ delay: idx * 0.03, duration: 0.25 }}
    className="hover:bg-slate-800/40 transition-colors"
  >
    <td className="p-3.5 font-mono text-slate-400 text-[11px]">
      {new Date(item.appliedAt ?? item.createdAt).toLocaleString()}
    </td>
    <td className="p-3.5 text-white font-bold text-xs">{item.approvedBy ?? 'System'}</td>
    <td className="p-3.5 font-mono text-brand-cyan text-xs">Row #{item.rowNumber}</td>
    <td className="p-3.5 font-mono text-slate-300 text-xs">{item.targetField}</td>
    <td className="p-3.5">
      <StatusBadge
        label={item.status}
        variant={item.status === 'applied' ? 'applied' : 'rejected'}
        size="sm"
      />
    </td>
    <td className="p-3.5 text-slate-400 text-[11px] max-w-sm truncate">
      {item.proposedFix?.diffDetails ?? item.agentReasoning}
    </td>
  </motion.tr>
));

AuditRow.displayName = 'AuditRow';
AuditRow.propTypes   = {
  item: PropTypes.object.isRequired,
  idx:  PropTypes.number.isRequired,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Active tab identifier type */
const TAB_PENDING = 'pending';
const TAB_AUDIT   = 'audit';

export const RemediationPage = () => {
  const dispatch = useDispatch();

  const { pendingList, auditLog, actionInProgressId } =
    useSelector((s) => s.remediation);

  const [activeTab, setActiveTab] = useState(TAB_PENDING);

  useEffect(() => {
    dispatch(fetchPendingRemediations());
    dispatch(fetchAuditLog());
  }, [dispatch]);

  // ── Approve ─────────────────────────────────────────────────────────────
  const handleApprove = useCallback(
    (remediationId) => {
      const promise = dispatch(
        approveRemediation({ remediationId, approver: 'Human Data Steward (Admin)' }),
      ).unwrap();

      toast.promise(promise, {
        loading: 'Applying mutation and recording audit entry…',
        success: '✅ Mutation applied — audit trail updated.',
        error:   'Approval failed. Please try again.',
      });
    },
    [dispatch],
  );

  // ── Reject ──────────────────────────────────────────────────────────────
  const handleReject = useCallback(
    (remediationId, reason) => {
      const promise = dispatch(rejectRemediation({ remediationId, reason })).unwrap();

      toast.promise(promise, {
        loading: 'Recording rejection in audit trail…',
        success: '🚫 Proposal rejected and logged.',
        error:   'Rejection failed. Please try again.',
      });
    },
    [dispatch],
  );

  // ---------------------------------------------------------------------------
  return (
    <PageTransition>
      <div className="space-y-8 pb-12">

        {/* ── Page Header ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Human-in-the-Loop Remediation Center
              </h1>
              <StatusBadge
                label="Zero Autonomous Mutations"
                variant="pending"
                dot
                pulse
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Review AI agent proposals. Every mutation requires explicit human
              approval and generates an immutable, tamper-evident audit log entry.
            </p>
          </div>

          {/* Tab Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
            {[
              { id: TAB_PENDING, label: `Pending (${pendingList.length})`, Icon: UserCheck },
              { id: TAB_AUDIT,   label: 'Audit Trail',                     Icon: History   },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  activeTab === id
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Tab: Pending Approvals ────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === TAB_PENDING && (
            <motion.div
              key="pending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {pendingList.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-panel p-12 rounded-2xl border border-slate-800 text-center space-y-2"
                >
                  <CheckCircle2 className="w-10 h-10 text-brand-500 mx-auto" />
                  <h3 className="text-sm font-bold text-white">Approval Queue is Clear</h3>
                  <p className="text-xs text-slate-500">
                    No proposals pending review. Trigger a fix from the Issue Triage tab.
                  </p>
                </motion.div>
              ) : (
                <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <AnimatePresence>
                    {pendingList.map((proposal) => (
                      <motion.div
                        key={String(proposal._id)}
                        layout
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0  }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                      >
                        <RemediationProposalCard
                          proposal={proposal}
                          onApprove={handleApprove}
                          onReject={handleReject}
                          isProcessing={actionInProgressId === String(proposal._id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── Tab: Immutable Audit Log ──────────────────────────── */}
          {activeTab === TAB_AUDIT && (
            <motion.div
              key="audit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl"
            >
              <div className="p-4 border-b border-slate-800 bg-dark-900/90 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                  <GitCommit className="w-4 h-4 text-brand-indigo" />
                  <span>Immutable Data Mutation Audit Trail</span>
                </h3>
                <span className="text-xs text-slate-500">{auditLog.length} Recorded Events</span>
              </div>

              {auditLog.length === 0 ? (
                <p className="p-8 text-center text-slate-500 text-xs">
                  No events recorded yet. Approve a remediation to create the first entry.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider z-10">
                      <tr>
                        {['Timestamp', 'Actor', 'Record', 'Target Field', 'Status', 'Audit Note'].map((h) => (
                          <th key={h} className="p-3.5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-dark-900/40 font-medium">
                      {auditLog.map((item, idx) => (
                        <AuditRow key={String(item._id ?? idx)} item={item} idx={idx} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};
