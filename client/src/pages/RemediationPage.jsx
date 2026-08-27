/**
 * @module RemediationPage
 * @description Human-in-the-Loop (HITL) Remediation Center — enhanced with:
 *  • Summary stats bar (total / high / medium / low confidence counts)
 *  • Confidence filter tabs (All / High / Medium / Low)
 *  • Sort toggle (newest first / highest confidence first)
 *  • "Approve All High-Confidence" batch action
 *  • Export Audit Log to CSV via ExportService
 */
import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { useSelector, useDispatch }                                from 'react-redux';
import { motion, AnimatePresence }                                 from 'framer-motion';
import toast                                                       from 'react-hot-toast';
import PropTypes                                                   from 'prop-types';
import {
  UserCheck, History, CheckCircle2, GitCommit, Download,
  SortAsc, SortDesc, Zap, ShieldCheck, Brain, RotateCcw,
} from 'lucide-react';


import {
  fetchPendingRemediations,
  fetchAuditLog,
  approveRemediation,
  rejectRemediation,
  rollbackRemediation,
  fetchExplanation,
}                                    from '../store/remediationSlice.js';
import { RemediationProposalCard }   from '../components/RemediationProposalCard.jsx';
import { AIExplainModal }            from '../components/AIExplainModal.jsx';
import { StatusBadge }               from '../components/StatusBadge.jsx';
import { PageTransition }            from '../components/PageTransition.jsx';
import { ExportService }             from '../services/ExportService.js';


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TAB_PENDING = 'pending';
const TAB_AUDIT   = 'audit';

const CONF_FILTERS = [
  { key: 'all',    label: 'All',    color: 'slate-400' },
  { key: 'high',   label: 'High',   color: 'brand-500' },
  { key: 'medium', label: 'Medium', color: 'brand-amber' },
  { key: 'low',    label: 'Low',    color: 'rose-400'  },
];

// ---------------------------------------------------------------------------
// Audit Row — with "Why AI did this" and Rollback action buttons
// ---------------------------------------------------------------------------
const AuditRow = memo(({ item, idx, onExplain, onRollback, rollbackInProgressId }) => (
  <motion.tr
    key={String(item._id ?? idx)}
    initial={{ opacity: 0, x: -8 }}
    animate={{ opacity: 1, x: 0  }}
    transition={{ delay: idx * 0.03, duration: 0.25 }}
    className="hover:bg-slate-800/40 transition-colors"
  >
    <td className="p-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
      {new Date(item.appliedAt ?? item.createdAt).toLocaleString()}
    </td>
    <td className="p-3 text-white font-bold text-xs">{item.approvedBy ?? 'System'}</td>
    <td className="p-3 font-mono text-brand-cyan text-xs">Row #{item.rowNumber}</td>
    <td className="p-3 font-mono text-slate-300 text-xs">{item.targetField}</td>
    <td className="p-3">
      <StatusBadge
        label={item.status}
        variant={
          item.status === 'applied'      ? 'applied'  :
          item.status === 'rolled_back'  ? 'rejected' :
          'rejected'
        }
        size="sm"
      />
    </td>
    <td className="p-3">
      {/* Before → After diff inline */}
      {item.proposedFix?.beforeValue !== undefined && (
        <span className="text-[10px] font-mono">
          <span className="text-rose-400">{String(item.proposedFix.beforeValue).slice(0, 20)}</span>
          <span className="text-slate-500 mx-1">→</span>
          <span className="text-brand-400">{String(item.proposedFix.afterValue ?? '').slice(0, 20)}</span>
        </span>
      )}
    </td>
    <td className="p-3">
      <div className="flex items-center space-x-1.5">
        {/* Why AI did this */}
        <button
          onClick={() => onExplain(String(item._id))}
          className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold
                     bg-brand-indigo/10 border border-brand-indigo/20 text-brand-indigo
                     hover:bg-brand-indigo/20 transition-colors whitespace-nowrap"
          title="View AI explainability"
        >
          <Brain className="w-3 h-3" />
          <span>Why AI?</span>
        </button>

        {/* Rollback — only for applied */}
        {item.status === 'applied' && (
          <button
            onClick={() => onRollback(String(item._id))}
            disabled={rollbackInProgressId === String(item._id)}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold
                       bg-rose-500/10 border border-rose-500/20 text-rose-400
                       hover:bg-rose-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
            title="Rollback this change"
          >
            <RotateCcw className={`w-3 h-3 ${rollbackInProgressId === String(item._id) ? 'animate-spin' : ''}`} />
            <span>Rollback</span>
          </button>
        )}
      </div>
    </td>
  </motion.tr>
));

AuditRow.displayName = 'AuditRow';
AuditRow.propTypes   = {
  item:                  PropTypes.object.isRequired,
  idx:                   PropTypes.number.isRequired,
  onExplain:             PropTypes.func.isRequired,
  onRollback:            PropTypes.func.isRequired,
  rollbackInProgressId:  PropTypes.string,
};

// ---------------------------------------------------------------------------
// Summary Stats Bar
// ---------------------------------------------------------------------------
function SummaryBar({ proposals }) {
  const high   = proposals.filter((p) => (p.confidence ?? 0) >= 0.8).length;
  const medium = proposals.filter((p) => (p.confidence ?? 0) >= 0.5 && (p.confidence ?? 0) < 0.8).length;
  const low    = proposals.filter((p) => (p.confidence ?? 0) < 0.5).length;

  const stats = [
    { label: 'Total Pending', value: proposals.length, color: 'text-white' },
    { label: 'High Confidence (≥80%)',   value: high,   color: 'text-brand-500'  },
    { label: 'Medium (50–79%)',          value: medium, color: 'text-brand-amber' },
    { label: 'Low (<50%)',               value: low,    color: 'text-rose-400'   },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="glass-panel p-3 rounded-xl border border-slate-800 text-center"
        >
          <p className={`text-xl font-extrabold font-mono ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export const RemediationPage = () => {
  const dispatch = useDispatch();

  const { pendingList, auditLog, actionInProgressId, rollbackInProgressId } = useSelector((s) => s.remediation);
  const { list: datasets } = useSelector((s) => s.datasets);
  const { user, isGuestMode } = useSelector((s) => s.auth);



  const [activeTab,    setActiveTab]    = useState(TAB_PENDING);
  const [confFilter,   setConfFilter]   = useState('all');
  const [sortOrder,    setSortOrder]    = useState('newest'); // 'newest' | 'confidence'
  const [batchLoading, setBatchLoading] = useState(false);

  const approverName = isGuestMode ? 'Human Data Steward (Guest)' : (user?.name ?? 'Human Data Steward');

  useEffect(() => {
    dispatch(fetchPendingRemediations());
    dispatch(fetchAuditLog());
  }, [dispatch]);

  // ── Approve ──────────────────────────────────────────────────────────────
  const handleApprove = useCallback(
    (remediationId) => {
      const promise = dispatch(
        approveRemediation({ remediationId, approver: approverName }),
      ).unwrap();
      toast.promise(promise, {
        loading: 'Applying mutation and recording audit entry…',
        success: '✅ Mutation applied — audit trail updated.',
        error:   'Approval failed. Please try again.',
      });
    },
    [dispatch, approverName],
  );

  // ── Reject ───────────────────────────────────────────────────────────────
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

  // ── Explain (AI Why) ──────────────────────────────────────────────────────
  const handleExplain = useCallback(
    (remediationId) => {
      dispatch(fetchExplanation(remediationId));
    },
    [dispatch],
  );

  // ── Rollback ──────────────────────────────────────────────────────────────
  const handleRollback = useCallback(
    (remediationId) => {
      const actor   = user?.name ?? 'Human Data Steward';
      const promise = dispatch(rollbackRemediation({
        remediationId,
        rolledBackBy: actor,
        reason: 'Manual rollback from Audit Trail.',
      })).unwrap();
      toast.promise(promise, {
        loading: 'Restoring original value and logging rollback…',
        success: '↩️ Rollback complete — original data restored.',
        error:   (err) => `Rollback failed: ${err}`,
      });
    },
    [dispatch, user],
  );

  // ── Batch Approve All High-Confidence ───────────────────────────────────
  const handleBatchApprove = useCallback(async () => {
    const highConf = pendingList.filter((p) => (p.confidence ?? 0) >= 0.8);
    if (!highConf.length) return;

    setBatchLoading(true);
    let approved = 0;
    for (const p of highConf) {
      try {
        await dispatch(approveRemediation({
          remediationId: String(p._id),
          approver: approverName,
        })).unwrap();
        approved++;
      } catch { /* skip individual failures */ }
    }
    setBatchLoading(false);
    toast.success(`✅ Batch approved ${approved} high-confidence proposals.`);
  }, [dispatch, pendingList, approverName]);

  // ── Filtered + Sorted List ───────────────────────────────────────────────
  const filteredList = useMemo(() => {
    let list = [...pendingList];

    // Filter
    if (confFilter === 'high') {
      list = list.filter((p) => (p.confidence ?? 0) >= 0.8);
    } else if (confFilter === 'medium') {
      list = list.filter((p) => (p.confidence ?? 0) >= 0.5 && (p.confidence ?? 0) < 0.8);
    } else if (confFilter === 'low') {
      list = list.filter((p) => (p.confidence ?? 0) < 0.5);
    }

    // Sort
    if (sortOrder === 'confidence') {
      list.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    } else {
      list.sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
    }

    return list;
  }, [pendingList, confFilter, sortOrder]);

  const highConfCount = useMemo(
    () => pendingList.filter((p) => (p.confidence ?? 0) >= 0.8).length,
    [pendingList],
  );

  return (
    <PageTransition>
      <div className="space-y-6 pb-12">

        {/* Header */}
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
              <StatusBadge label="Zero Autonomous Mutations" variant="pending" dot pulse />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Review AI agent proposals. Every mutation requires explicit human approval and generates an immutable audit log entry.
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

        <AnimatePresence mode="wait">

          {/* ── Pending Approvals Tab ──────────────────────────────────── */}
          {activeTab === TAB_PENDING && (
            <motion.div
              key="pending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Summary Stats Bar */}
              {pendingList.length > 0 && <SummaryBar proposals={pendingList} />}

              {/* Controls: Confidence Filter + Sort + Batch */}
              {pendingList.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Confidence filter pills */}
                  <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
                    {CONF_FILTERS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setConfFilter(key)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          confFilter === key
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {label}
                        {key !== 'all' && (
                          <span className="ml-1 text-slate-600">
                            ({pendingList.filter((p) => {
                              const c = p.confidence ?? 0;
                              if (key === 'high')   return c >= 0.8;
                              if (key === 'medium') return c >= 0.5 && c < 0.8;
                              return c < 0.5;
                            }).length})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Sort toggle */}
                    <button
                      onClick={() => setSortOrder((s) => s === 'newest' ? 'confidence' : 'newest')}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                                 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                      {sortOrder === 'newest'
                        ? <><SortDesc className="w-3.5 h-3.5" /><span>Newest First</span></>
                        : <><SortAsc className="w-3.5 h-3.5" /><span>By Confidence</span></>
                      }
                    </button>

                    {/* Batch approve */}
                    {highConfCount > 0 && (
                      <button
                        onClick={handleBatchApprove}
                        disabled={batchLoading}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                                   bg-brand-500/10 border border-brand-500/30 text-brand-400
                                   hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{batchLoading ? 'Approving…' : `Approve All High (${highConfCount})`}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Proposal Cards */}
              {filteredList.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-panel p-12 rounded-2xl border border-slate-800 text-center space-y-2"
                >
                  <CheckCircle2 className="w-10 h-10 text-brand-500 mx-auto" />
                  <h3 className="text-sm font-bold text-white">
                    {pendingList.length === 0 ? 'Approval Queue is Clear' : 'No matches for this filter'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {pendingList.length === 0
                      ? 'No proposals pending review. Trigger a scan to generate new proposals.'
                      : `Try selecting a different confidence filter.`}
                  </p>
                </motion.div>
              ) : (
                <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <AnimatePresence>
                    {filteredList.map((proposal) => (
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
                          datasetName={datasets.find((d) => String(d._id) === String(proposal.datasetId))?.name}
                        />

                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── Audit Log Tab ──────────────────────────────────────────── */}
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
                <div className="flex items-center space-x-3">
                  <span className="text-xs text-slate-500">{auditLog.length} Events</span>
                  {auditLog.length > 0 && (
                    <button
                      onClick={() => ExportService.downloadAuditCSV(auditLog, 'grootai-audit-log')}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold
                                 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white
                                 hover:bg-slate-700 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export CSV</span>
                    </button>
                  )}
                </div>
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
                        {['Timestamp', 'Actor', 'Record', 'Field', 'Status', 'Before → After', 'Actions'].map((h) => (
                          <th key={h} className="p-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-dark-900/40 font-medium">
                      {auditLog.map((item, idx) => (
                        <AuditRow
                          key={String(item._id ?? idx)}
                          item={item}
                          idx={idx}
                          onExplain={handleExplain}
                          onRollback={handleRollback}
                          rollbackInProgressId={rollbackInProgressId}
                        />
                      ))}
                    </tbody>
                  </table>

                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* AI Explainability Modal — global, rendered at page root */}
      <AIExplainModal />

    </PageTransition>
  );
};

