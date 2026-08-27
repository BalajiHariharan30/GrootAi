import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Check, X, ArrowRight, ShieldCheck, Cpu, GitCommit } from 'lucide-react';

export const RemediationProposalCard = ({ proposal, onApprove, onReject, isProcessing, datasetName }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  const { _id, rowNumber, targetField, strategy, proposedFix, agentReasoning, confidence = 0.95 } = proposal;
  const { beforeValue, afterValue, diffDetails } = proposedFix || {};

  const handleApprove = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 }
    });
    onApprove(_id);
  };

  const strategyLabels = {
    format_standardize: 'Format Standardization',
    domain_fix: 'Syntax Domain Fix',
    merge_records: 'Master Record Deduplication',
    impute_default: 'Null Imputation',
    custom_patch: 'Domain Boundary Normalization'
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-700/80 hover:border-slate-600 transition-all space-y-4 shadow-lg relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-indigo/20 border border-brand-indigo/30 flex items-center justify-center text-brand-indigo">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-sm text-white">Record #{rowNumber} Remediation</span>
              {datasetName && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  📁 {datasetName}
                </span>
              )}
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 uppercase">
                {strategyLabels[strategy] || strategy}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Target Field: <span className="font-mono text-slate-300 font-bold">{targetField}</span></span>
          </div>
        </div>


        {/* Confidence chip */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-slate-400 font-medium">Confidence:</span>
          <span className="text-brand-400 font-bold font-mono">{(confidence * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Agent Rationale */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-brand-indigo uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Agent Reasoning & Context</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {agentReasoning}
        </p>
      </div>

      {/* Before vs After Diff Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Before */}
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-1">
            <span>Current / Defect Value</span>
            <span className="text-rose-500 font-mono">BEFORE</span>
          </div>
          <div className="font-mono text-xs text-rose-200 break-all p-2 rounded bg-rose-950/40 border border-rose-900/30">
            {String(beforeValue ?? 'NULL')}
          </div>
        </div>

        {/* After */}
        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
            <span>Proposed Remediation</span>
            <span className="text-emerald-400 font-mono">AFTER</span>
          </div>
          <div className="font-mono text-xs text-emerald-200 break-all p-2 rounded bg-emerald-950/40 border border-emerald-900/30">
            {String(afterValue ?? 'NULL')}
          </div>
        </div>
      </div>

      {/* Diff explanation */}
      {diffDetails && (
        <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
          <GitCommit className="w-3.5 h-3.5 text-slate-500" />
          <span>{diffDetails}</span>
        </div>
      )}

      {/* Rejection input box */}
      {showRejectBox && (
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <label className="text-xs text-slate-300 font-medium">Rejection Rationale:</label>
          <input
            type="text"
            placeholder="e.g. Value is intentionally unconventional or needs secondary check"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowRejectBox(false)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => onReject(_id, rejectReason)}
              className="px-3 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* Action Footer */}
      {!showRejectBox && (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Human confirmation gate enforced</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowRejectBox(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 transition-colors flex items-center space-x-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
            <button
              disabled={isProcessing}
              onClick={handleApprove}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-slate-950 shadow-glow-emerald transition-all active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{isProcessing ? 'Applying...' : 'Approve & Apply Mutation'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
