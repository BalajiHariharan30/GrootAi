/**
 * @module AIExplainModal
 * @description Structured AI Decision Explainability panel.
 * Shows WHY the AI proposed a fix: the issue detected, strategy chosen,
 * evidence chain (step-by-step), confidence breakdown, and full audit trail.
 * Also provides a Rollback button for applied remediations.
 */
import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  X, Brain, ChevronRight, Shield, AlertTriangle,
  RotateCcw, CheckCircle2, Clock, User, Sparkles,
  TrendingUp, Info, GitBranch,
} from 'lucide-react';
import { rollbackRemediation, clearExplanation } from '../store/remediationSlice.js';

// ── Confidence Meter ──────────────────────────────────────────────────────
function ConfidenceMeter({ score }) {
  const color = score >= 85 ? 'bg-brand-500' : score >= 60 ? 'bg-brand-amber' : 'bg-rose-500';
  const textColor = score >= 85 ? 'text-brand-400' : score >= 60 ? 'text-brand-amber' : 'text-rose-400';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">AI Confidence</span>
        <span className={`text-lg font-extrabold font-mono ${textColor}`}>{score}%</span>
      </div>
      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

// ── Evidence Step ─────────────────────────────────────────────────────────
function EvidenceStep({ step, actor, action, isLast }) {
  const actorColor =
    actor.includes('Profiler') ? 'text-brand-cyan' :
    actor.includes('Remediation') ? 'text-brand-indigo' :
    actor.includes('Rollback') ? 'text-rose-400' :
    'text-brand-amber';

  return (
    <div className="flex space-x-3">
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-700
                         flex items-center justify-center text-[10px] font-extrabold ${actorColor}`}>
          {step}
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-800 mt-1" />}
      </div>
      <div className={`pb-4 ${isLast ? '' : ''}`}>
        <p className={`text-[11px] font-bold mb-0.5 ${actorColor}`}>{actor}</p>
        <p className="text-xs text-slate-300 leading-relaxed">{action}</p>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────
export const AIExplainModal = () => {
  const dispatch = useDispatch();
  const { explanation, explanationLoading, rollbackInProgressId } = useSelector((s) => s.remediation);
  const { user, isGuestMode } = useSelector((s) => s.auth);

  const isOpen = !!explanation || explanationLoading;

  const handleClose = useCallback(() => {
    dispatch(clearExplanation());
  }, [dispatch]);

  const handleRollback = useCallback(() => {
    if (!explanation) return;
    const actor = user?.name ?? 'Human Data Steward';
    const promise = dispatch(rollbackRemediation({
      remediationId: explanation.remediationId,
      rolledBackBy:  actor,
      reason:        'Manually rolled back via AI Explain panel.',
    })).unwrap();
    toast.promise(promise, {
      loading: 'Restoring original value and logging rollback…',
      success: '↩️ Rollback complete — original data restored.',
      error:   (err) => `Rollback failed: ${err}`,
    });
    promise.then(() => dispatch(clearExplanation())).catch(() => {});
  }, [dispatch, explanation, user]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1,    y: 0  }}
            exit={{ scale: 0.95, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl
                       border border-slate-700/80 shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between
                            p-5 border-b border-slate-800 bg-dark-900/95 backdrop-blur-sm">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-indigo to-brand-500
                                flex items-center justify-center shadow-glow-indigo">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-white">AI Decision Explainability</h2>
                  <p className="text-[11px] text-slate-400">Why the AI proposed this fix — full transparency</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Loading */}
            {explanationLoading && (
              <div className="p-12 flex flex-col items-center space-y-3">
                <Sparkles className="w-8 h-8 text-brand-400 animate-pulse" />
                <p className="text-xs text-slate-400">Loading AI explanation…</p>
              </div>
            )}

            {/* Explanation Content */}
            {explanation && !explanationLoading && (
              <div className="p-5 space-y-6">

                {/* Status Banner */}
                <div className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold border ${
                  explanation.status === 'applied'      ? 'bg-brand-500/10 border-brand-500/30 text-brand-400' :
                  explanation.status === 'rolled_back'  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                  explanation.status === 'rejected'     ? 'bg-slate-800 border-slate-700 text-slate-400' :
                  'bg-brand-amber/10 border-brand-amber/30 text-brand-amber'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-current" />
                  <span>Status: <span className="uppercase">{explanation.status}</span></span>
                </div>

                {/* Confidence Score */}
                <div className="glass-panel p-4 rounded-xl border border-slate-800">
                  <ConfidenceMeter score={explanation.confidence.score} />
                  <p className="text-xs text-slate-400 mt-2">{explanation.confidence.label}</p>
                </div>

                {/* What Happened */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                    <TrendingUp className="w-3.5 h-3.5 text-brand-cyan" />
                    <span>What the AI Did</span>
                  </h3>
                  <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500 mb-0.5">Field Targeted</p>
                        <p className="font-bold font-mono text-brand-cyan">{explanation.whatHappened.field}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-0.5">Strategy</p>
                        <p className="font-bold text-white capitalize">{explanation.whatHappened.strategy?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>

                    {/* Before → After Diff */}
                    <div className="flex items-center space-x-2 text-xs">
                      <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-rose-400 font-bold mb-0.5">BEFORE</p>
                        <p className="font-mono text-rose-300 break-all">
                          {String(explanation.whatHappened.beforeValue ?? 'null')}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="flex-1 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-brand-400 font-bold mb-0.5">AFTER</p>
                        <p className="font-mono text-brand-300 break-all">
                          {String(explanation.whatHappened.afterValue ?? 'N/A')}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                      {explanation.whatHappened.strategyReason}
                    </p>
                  </div>
                </div>

                {/* Why AI Did This */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                    <Brain className="w-3.5 h-3.5 text-brand-indigo" />
                    <span>Why the AI Did This</span>
                  </h3>
                  <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-slate-500 mb-0.5">Issue Type</p>
                        <p className="font-bold capitalize text-white">{explanation.whyAIDidThis.issueType?.replace(/_/g, ' ')}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-0.5">Severity</p>
                        <p className={`font-bold capitalize ${
                          explanation.whyAIDidThis.issueSeverity === 'critical' ? 'text-rose-400' :
                          explanation.whyAIDidThis.issueSeverity === 'high'     ? 'text-brand-amber' :
                          'text-slate-300'
                        }`}>
                          {explanation.whyAIDidThis.issueSeverity}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-0.5">Row</p>
                        <p className="font-bold font-mono text-brand-cyan">#{explanation.whyAIDidThis.rowNumber}</p>
                      </div>
                    </div>
                    <div className="bg-slate-900/70 rounded-lg p-3 border border-slate-800">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Agent Reasoning</p>
                      <p className="text-slate-300 leading-relaxed">{explanation.whyAIDidThis.agentReasoning}</p>
                    </div>
                    <p className="text-slate-500 flex items-center space-x-1">
                      <Info className="w-3 h-3" />
                      <span>Detection rule: <span className="text-slate-300">{explanation.whyAIDidThis.issueRule}</span></span>
                    </p>
                  </div>
                </div>

                {/* Evidence Chain */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                    <GitBranch className="w-3.5 h-3.5 text-brand-500" />
                    <span>Evidence Chain (Step-by-Step)</span>
                  </h3>
                  <div className="glass-panel p-4 rounded-xl border border-slate-800">
                    {explanation.evidenceChain.map((ev, idx) => (
                      <EvidenceStep
                        key={ev.step}
                        step={ev.step}
                        actor={ev.actor}
                        action={ev.action}
                        isLast={idx === explanation.evidenceChain.length - 1}
                      />
                    ))}
                  </div>
                </div>

                {/* Audit Trail */}
                {explanation.auditTrail?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Immutable Audit Trail ({explanation.auditTrail.length} entries)</span>
                    </h3>
                    <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
                      {explanation.auditTrail.map((entry, idx) => (
                        <div
                          key={idx}
                          className="flex items-start space-x-3 p-3 border-b border-slate-800/60 last:border-0"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-300">{entry.action}</span>
                              <span className="text-[10px] font-mono text-slate-500 ml-2 shrink-0">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{entry.details}</p>
                            <p className="text-[10px] text-slate-600 mt-0.5">Actor: {entry.actor}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rollback Action */}
                {explanation.status === 'applied' && (
                  <div className="border border-rose-500/20 bg-rose-500/5 rounded-xl p-4 space-y-3">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <h3 className="text-xs font-bold text-rose-300">Rollback this Change</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      This will <strong className="text-white">restore the original value</strong> (
                      <span className="font-mono text-rose-300">{String(explanation.whatHappened.beforeValue ?? 'null')}</span>
                      ) onto the record and log a tamper-evident rollback audit entry. This action cannot be automatically un-done.
                    </p>
                    <button
                      onClick={handleRollback}
                      disabled={rollbackInProgressId === explanation.remediationId}
                      className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold
                                 bg-rose-500/20 border border-rose-500/40 text-rose-300
                                 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className={`w-4 h-4 ${rollbackInProgressId === explanation.remediationId ? 'animate-spin' : ''}`} />
                      <span>
                        {rollbackInProgressId === explanation.remediationId
                          ? 'Executing Rollback…'
                          : 'Execute Rollback & Restore Original'}
                      </span>
                    </button>
                  </div>
                )}

                {explanation.status === 'rolled_back' && (
                  <div className="border border-slate-700 bg-slate-800/40 rounded-xl p-4 flex items-center space-x-3">
                    <CheckCircle2 className="w-5 h-5 text-rose-400 shrink-0" />
                    <p className="text-xs text-slate-300">
                      This action has been <strong className="text-rose-300">rolled back</strong>.
                      The original data has been restored. See the audit trail above for full details.
                    </p>
                  </div>
                )}

              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
