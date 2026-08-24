import React from 'react';
import { X, Sparkles, Check, AlertCircle, ArrowRight, ShieldAlert, Cpu } from 'lucide-react';

export const MatchExplainModal = ({ explanation, onClose, onProposeFix }) => {
  if (!explanation) return null;

  const { compositeScore, confidencePercent, naturalExplanation, fieldBreakdown = [], rowNumberA, rowNumberB, recommendedAction } = explanation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-fade-in">
      <div className="glass-panel w-full max-w-3xl rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-dark-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-brand-indigo/20 border border-brand-indigo/30 flex items-center justify-center text-brand-indigo">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">CLAIRE™ Match Analysis & Explainability</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
                  {confidencePercent}% MATCH CONFIDENCE
                </span>
              </div>
              <p className="text-xs text-slate-400">Field-by-field transparent breakdown for Record #{rowNumberA} and Record #{rowNumberB}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Agent Natural Language Rationale Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-brand-indigo/10 via-brand-cyan/10 to-transparent border border-brand-indigo/20">
            <div className="flex items-start space-x-3">
              <Cpu className="w-5 h-5 text-brand-indigo shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-indigo mb-1">Agent Reasoning</h4>
                <p className="text-xs text-slate-200 leading-relaxed font-medium">
                  {naturalExplanation}
                </p>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center space-x-1.5">
                  <span className="font-semibold text-slate-300">Recommendation:</span>
                  <span className="text-brand-cyan font-bold">{recommendedAction}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Field-by-Field Breakdown Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Field-Level Similarity Breakdown</h4>
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Field</th>
                    <th className="p-3">Record #{rowNumberA}</th>
                    <th className="p-3">Record #{rowNumberB}</th>
                    <th className="p-3">Similarity</th>
                    <th className="p-3">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-dark-900/40">
                  {fieldBreakdown.map((item, idx) => {
                    const isExact = item.similarityScore === 1.0;
                    const isHigh = item.similarityScore >= 0.85;

                    return (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-bold text-white">{item.field}</td>
                        <td className="p-3 font-mono text-slate-300 truncate max-w-[140px]">{String(item.valueA ?? 'null')}</td>
                        <td className="p-3 font-mono text-slate-300 truncate max-w-[140px]">{String(item.valueB ?? 'null')}</td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2">
                            <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isExact ? 'bg-brand-500' : isHigh ? 'bg-brand-cyan' : 'bg-brand-rose'
                                }`}
                                style={{ width: `${item.similarityScore * 100}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-slate-200">
                              {(item.similarityScore * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-[11px] text-slate-400">{item.explanation}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-dark-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-400">Human confirmation required prior to any record mutation</span>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                onProposeFix(explanation.issueId);
                onClose();
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-brand-indigo to-brand-cyan text-white shadow-glow-indigo transition-all active:scale-95 flex items-center space-x-1.5"
            >
              <span>Propose AI Fix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
