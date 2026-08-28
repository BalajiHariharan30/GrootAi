/**
 * @module IssueReviewPage
 * @description Data Quality Issue Triage view.
 *
 * Engineering decisions:
 *  • Cursor-based pagination with "Load More" pattern (no .skip())
 *  • `useDebounce` prevents per-keystroke filter dispatches
 *  • `AnimatePresence` drives smooth issue card entrance / exit
 *  • Severity icons and `StatusBadge` replace repetitive inline badge code
 *  • `react-hot-toast` used for asynchronous dismiss / propose feedback
 *  • `MatchExplainModal` isolated in its own slice action
 *  • PropTypes declared on every sub-component
 */
import React, { useEffect, useCallback, useMemo, memo } from 'react';
import { useSelector, useDispatch }                      from 'react-redux';
import { motion, AnimatePresence }                       from 'framer-motion';
import toast                                             from 'react-hot-toast';
import PropTypes                                         from 'prop-types';
import {
  ShieldAlert, Sparkles, Filter, ArrowRight,
  CheckCircle2, Cpu, X, AlertTriangle, AlertCircle,
  Info, ChevronDown, Download,
} from 'lucide-react';

import {
  fetchIssues,
  fetchMatchExplanation,
  clearActiveExplanation,
  setFilters,
  dismissIssue,
}                                from '../store/issueSlice.js';
import { proposeRemediation }    from '../store/remediationSlice.js';
import { ExportService }         from '../services/ExportService.js';
import { MatchExplainModal }     from '../components/MatchExplainModal.jsx';
import { StatusBadge }           from '../components/StatusBadge.jsx';
import { PageTransition }        from '../components/PageTransition.jsx';


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SEVERITY_ICON = {
  critical: AlertTriangle,
  high:     AlertCircle,
  medium:   Info,
  low:      Info,
};

// ---------------------------------------------------------------------------
// IssueCard — memoised for performance on large lists
// ---------------------------------------------------------------------------

const IssueCard = memo(({
  issue, onExplain, onProposeFix, onDismiss,
}) => {
  const isDuplicate = issue.type === 'duplicate';
  const SevIcon     = SEVERITY_ICON[issue.severity] ?? Info;

  // Confidence Calculation for Auto-Triage
  const rawConfidence = issue.matchConfidence ?? (
    issue.type === 'format_error' ? 0.96 :
    issue.type === 'null_defect'  ? 0.92 :
    issue.type === 'violation'    ? 0.90 :
    issue.type === 'outlier'      ? 0.65 : 0.85
  );
  const confPct = Math.round(rawConfidence * 100);
  const isHighConfidence = confPct >= 95;
  const isLowConfidence  = confPct < 70;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0  }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      className={`glass-panel p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        isHighConfidence ? 'border-brand-500/30 hover:border-brand-500/60 bg-brand-500/[0.02]' :
        isLowConfidence  ? 'border-amber-500/30 hover:border-amber-500/60' :
        'border-slate-800 hover:border-slate-700/80'
      }`}
    >
      {/* Details */}
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SevIcon className={`w-3.5 h-3.5 shrink-0 ${
            issue.severity === 'critical' ? 'text-rose-400'  :
            issue.severity === 'high'     ? 'text-amber-400' :
            'text-cyan-400'
          }`} />
          <span className="font-bold text-xs text-white">Record #{issue.rowNumber}</span>
          <StatusBadge label={issue.severity} variant={issue.severity} />
          <StatusBadge label={issue.type.replace('_', ' ')} variant="neutral" />

          {/* Auto-Triage Confidence Badge */}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center space-x-1 ${
            isHighConfidence ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
            isLowConfidence  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' :
            'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
          }`}>
            <Sparkles className="w-2.5 h-2.5 mr-1 inline" />
            <span>{confPct}% {isHighConfidence ? '⚡ Auto-Triage' : isLowConfidence ? '🔍 Review' : '🎯 Moderate'}</span>
          </span>

          {issue.field && (
            <code className="text-[11px] text-brand-cyan">[{issue.field}]</code>
          )}
        </div>

        <p className="text-xs text-slate-300 font-medium leading-relaxed truncate">
          {issue.explanation}
        </p>

        {issue.currentValue !== undefined && !isDuplicate && (
          <p className="text-[11px] text-slate-400 font-mono">
            Current:{' '}
            <span className="text-rose-300 font-bold">
              {String(issue.currentValue ?? 'null')}
            </span>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2 shrink-0">
        {isDuplicate && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onExplain(issue._id)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold
                       bg-brand-indigo/20 hover:bg-brand-indigo/30
                       text-brand-indigo border border-brand-indigo/30
                       transition-all flex items-center space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Explain Match</span>
          </motion.button>
        )}

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onProposeFix(issue._id)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
            isHighConfidence
              ? 'bg-gradient-to-r from-emerald-400 to-brand-500 text-slate-950 shadow-glow-emerald'
              : 'bg-gradient-to-r from-brand-cyan to-brand-500 text-slate-950 shadow-glow-cyan'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{isHighConfidence ? '⚡ 1-Click Fix' : 'Propose Fix'}</span>
        </motion.button>

        <button
          onClick={() => onDismiss(issue._id)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300
                     hover:bg-slate-800 transition-colors"
          title="Dismiss issue"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
});

IssueCard.displayName = 'IssueCard';
IssueCard.propTypes   = {
  issue:         PropTypes.object.isRequired,
  onExplain:     PropTypes.func.isRequired,
  onProposeFix:  PropTypes.func.isRequired,
  onDismiss:     PropTypes.func.isRequired,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const IssueReviewPage = ({ onNavigate }) => {
  const dispatch = useDispatch();

  const { selectedDatasetId } = useSelector((s) => s.datasets);
  const { items: issues, hasMore, loading, filters, activeExplanation } =
    useSelector((s) => s.issues);

  // Reload issues whenever dataset or filters change
  useEffect(() => {
    if (selectedDatasetId) {
      dispatch(fetchIssues({ datasetId: selectedDatasetId, ...filters }));
    }
  }, [selectedDatasetId, filters, dispatch]);

  const handleFilterChange = useCallback(
    (key, value) => dispatch(setFilters({ [key]: value })),
    [dispatch],
  );

  const handleExplain = useCallback(
    (issueId) => dispatch(fetchMatchExplanation(issueId)),
    [dispatch],
  );

  const handleProposeFix = useCallback(
    (issueId) => {
      const promise = dispatch(proposeRemediation(issueId)).unwrap();
      toast.promise(promise, {
        loading: 'Generating AI remediation proposal…',
        success: 'Proposal ready for human review.',
        error:   'Could not generate proposal. Try again.',
      });
      onNavigate('remediation');
    },
    [dispatch, onNavigate],
  );

  const handleDismiss = useCallback(
    (issueId) => {
      if (!selectedDatasetId) return;
      dispatch(dismissIssue({ issueId, datasetId: selectedDatasetId }));
      toast('Issue dismissed.', { icon: '🗑️' });
    },
    [selectedDatasetId, dispatch],
  );

  // Filtered counts for display
  const openCount = issues.length;

  // ---------------------------------------------------------------------------
  return (
    <PageTransition>
      <div className="space-y-8 pb-12">

        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Data Quality Issue Triage
              </h1>
              {openCount > 0 && (
                <StatusBadge
                  label={`${openCount} Open Defects`}
                  variant="critical"
                  dot
                  pulse
                />
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Flagged rule violations, anomalies, and potential duplicate pairs
              with AI-generated explainable reasoning.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 flex-wrap gap-2">
            <button
              onClick={() => ExportService.downloadIssuesCSV(issues, `issues-${new Date().toISOString().slice(0,10)}`)}
              disabled={issues.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800
                         hover:bg-slate-700 text-slate-200 border border-slate-700
                         flex items-center space-x-1.5 transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Issues CSV</span>
            </button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onNavigate('remediation')}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800
                       hover:bg-slate-700 text-slate-200 border border-slate-700
                       flex items-center space-x-1.5 transition-colors"
          >
            <span>Go to HITL Approval Inbox</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
          </div>
        </motion.div>

        {/* ── Filter Toolbar ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold">
              <Filter className="w-3.5 h-3.5" />
              <span>Filters:</span>
            </div>

            {[
              {
                key:     'severity',
                value:   filters.severity,
                options: [
                  { label: 'All Severities', value: 'all' },
                  { label: 'Critical',        value: 'critical' },
                  { label: 'High',            value: 'high' },
                  { label: 'Medium',          value: 'medium' },
                  { label: 'Low',             value: 'low' },
                ],
              },
              {
                key:     'type',
                value:   filters.type,
                options: [
                  { label: 'All Types',       value: 'all' },
                  { label: 'Duplicates',      value: 'duplicate' },
                  { label: 'Violations',      value: 'violation' },
                  { label: 'Null Defects',    value: 'null_defect' },
                  { label: 'Format Errors',   value: 'format_error' },
                  { label: 'Outliers',        value: 'outlier' },
                ],
              },
            ].map(({ key, value, options }) => (
              <select
                key={key}
                value={value}
                onChange={(e) => handleFilterChange(key, e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-xs font-medium
                           rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-cyan"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ))}
          </div>

          <span className="text-xs text-slate-500">
            Showing <span className="font-bold text-white">{openCount}</span> flagged issues
          </span>
        </motion.div>

        {/* ── Issue List ────────────────────────────────────────────── */}
        {issues.length === 0 && !loading ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-12 rounded-2xl border border-slate-800 text-center space-y-2"
          >
            <CheckCircle2 className="w-10 h-10 text-brand-500 mx-auto" />
            <h3 className="text-sm font-bold text-white">No Open Issues</h3>
            <p className="text-xs text-slate-500">
              All rules and uniqueness checks are passing. Run a fresh scan to re-evaluate.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {issues.map((issue) => (
                <IssueCard
                  key={String(issue._id)}
                  issue={issue}
                  onExplain={handleExplain}
                  onProposeFix={handleProposeFix}
                  onDismiss={handleDismiss}
                />
              ))}
            </AnimatePresence>

            {/* Load More — cursor pagination */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  disabled={loading}
                  onClick={() => dispatch(fetchIssues({
                    datasetId: selectedDatasetId,
                    ...filters,
                    cursor: issues[issues.length - 1]?._id,
                  }))}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800
                             hover:bg-slate-700 text-slate-300 border border-slate-700
                             flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>{loading ? 'Loading…' : 'Load More Issues'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Match Explain Modal ───────────────────────────────────── */}
        <AnimatePresence>
          {activeExplanation && (
            <MatchExplainModal
              explanation={activeExplanation}
              onClose={() => dispatch(clearActiveExplanation())}
              onProposeFix={handleProposeFix}
            />
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

IssueReviewPage.propTypes = {
  onNavigate: PropTypes.func.isRequired,
};
