import React from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export const QualityScoreGauge = ({ score = 100, dimensions = {}, rowCount = 0 }) => {
  const completeness = dimensions.completeness || 100;
  const validity = dimensions.validity || 100;
  const uniqueness = dimensions.uniqueness || 100;
  const consistency = dimensions.consistency || 100;

  // Gauge calculation
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let colorClass = 'text-brand-400';
  let badgeLabel = 'Excellent Health';
  let badgeBg = 'bg-brand-500/10 text-brand-400 border-brand-500/20';

  if (score < 70) {
    colorClass = 'text-brand-rose';
    badgeLabel = 'Critical Defects';
    badgeBg = 'bg-brand-rose/10 text-brand-rose border-brand-rose/20';
  } else if (score < 85) {
    colorClass = 'text-brand-amber';
    badgeLabel = 'Requires Attention';
    badgeBg = 'bg-brand-amber/10 text-brand-amber border-brand-amber/20';
  }

  return (
    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
      {/* Background glow orb */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
        {/* Radial Gauge */}
        <div className="flex items-center space-x-6">
          <div className="relative flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={radius}
                className="text-slate-800"
                strokeWidth="10"
                stroke="currentColor"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r={radius}
                className={`${colorClass} transition-all duration-1000 ease-out`}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold text-white tracking-tight">{score}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Score</span>
            </div>
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-bold text-white tracking-tight">Dataset Health Index</h3>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${badgeBg}`}>
                {badgeLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Continuous agentic scan evaluating {rowCount.toLocaleString()} records across 4 dimensions.
            </p>
          </div>
        </div>

        {/* 4 Dimension Health Bars */}
        <div className="grid grid-cols-2 gap-4 w-full lg:w-auto lg:min-w-[340px]">
          {[
            { label: 'Completeness', value: completeness, desc: 'Null & empty rate' },
            { label: 'Validity', value: validity, desc: 'Format & domain bounds' },
            { label: 'Uniqueness', value: uniqueness, desc: 'Duplicate mitigation' },
            { label: 'Consistency', value: consistency, desc: 'Pattern uniformity' },
          ].map(dim => (
            <div key={dim.label} className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-semibold text-slate-300">{dim.label}</span>
                <span className="text-xs font-bold text-white">{dim.value}%</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    dim.value >= 90 ? 'bg-brand-500' : dim.value >= 75 ? 'bg-brand-amber' : 'bg-brand-rose'
                  }`}
                  style={{ width: `${dim.value}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">{dim.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

