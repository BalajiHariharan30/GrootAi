import React from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Play, Code2, ArrowRight } from 'lucide-react';

export const RuleTestPreview = ({ candidateRule, onActivate, onDiscard, isActivating }) => {
  if (!candidateRule) return null;

  const { name, description, category, severity, structuredRule, validationSample } = candidateRule;
  const { testedRows, passRate, passedCount, failedCount, flaggedAsUnsafe, safetyReason, sampleFailures = [] } = validationSample || {};

  const severityColors = {
    critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    medium: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    low: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  };

  return (
    <div className="glass-panel rounded-2xl border border-brand-500/30 overflow-hidden shadow-glow-emerald">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-brand-900/40 via-dark-900 to-dark-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">{name}</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${severityColors[severity] || severityColors.medium}`}>
                {severity}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {category}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            Discard
          </button>
          <button
            disabled={isActivating}
            onClick={onActivate}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-slate-950 shadow-glow-emerald transition-all active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
          >
            {isActivating ? (
              <span>Activating...</span>
            ) : (
              <>
                <span>Confirm & Activate</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Structured AST Logic */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Code2 className="w-4 h-4 text-brand-cyan" />
              <span>Structured AST Conditions</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">Logic: {structuredRule?.logic || 'AND'}</span>
          </div>

          <div className="space-y-2">
            {structuredRule?.conditions?.map((cond, idx) => (
              <div key={idx} className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-brand-cyan font-mono">{cond.field}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300">
                    operator: {cond.operator}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  {cond.minValue !== undefined && <div>Min: <span className="font-mono text-white">{cond.minValue}</span></div>}
                  {cond.maxValue !== undefined && <div>Max: <span className="font-mono text-white">{cond.maxValue}</span></div>}
                  {cond.pattern && <div>Pattern: <span className="font-mono text-white">{cond.pattern}</span></div>}
                  {cond.set && <div>Allowed Set: <span className="font-mono text-white">{cond.set.join(', ')}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Execute-Before-Trust Validation Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-brand-400" />
              <span>Execute-Before-Trust Test Run</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">Tested on {testedRows} real rows</span>
          </div>

          {/* Safety Alert if Unsafe */}
          {flaggedAsUnsafe && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Safety Guard Triggered:</span>
                <span>{safetyReason}</span>
              </div>
            </div>
          )}

          {/* Pass Rate Metric Card */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400">Sample Pass Rate:</span>
              <span className="text-base font-extrabold text-white font-mono">{passRate}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  passRate >= 80 ? 'bg-brand-500' : passRate >= 40 ? 'bg-brand-amber' : 'bg-brand-rose'
                }`}
                style={{ width: `${passRate}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span className="flex items-center space-x-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{passedCount} Passed</span>
              </span>
              <span className="flex items-center space-x-1 text-rose-400">
                <XCircle className="w-3.5 h-3.5" />
                <span>{failedCount} Failed</span>
              </span>
            </div>
          </div>

          {/* Sample Failures List */}
          {sampleFailures.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sample Discrepancies</span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {sampleFailures.map((fail, idx) => (
                  <div key={idx} className="bg-slate-950/80 border border-slate-800/80 p-2 rounded-lg text-xs flex items-center justify-between">
                    <span className="text-slate-400">Row #{fail.rowNumber} ({fail.field}):</span>
                    <span className="font-mono text-rose-300 truncate max-w-[180px]">{String(fail.actualValue ?? 'null')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

