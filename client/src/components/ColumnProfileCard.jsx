import React from 'react';
import { Tag, Hash, Mail, Phone, Calendar, CheckSquare, Sparkles, AlertTriangle } from 'lucide-react';

const typeIcons = {
  email: Mail,
  phone: Phone,
  integer: Hash,
  float: Hash,
  date: Calendar,
  boolean: CheckSquare,
  id: Tag,
  category: Sparkles,
  string: Tag
};

const typeColors = {
  email: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  phone: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  integer: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  float: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  date: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  boolean: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  id: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  category: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  string: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
};

export const ColumnProfileCard = ({ column }) => {
  const Icon = typeIcons[column.inferredType] || Tag;
  const colorClass = typeColors[column.inferredType] || typeColors.string;
  const hasHighNull = column.nullPercent > 10;

  return (
    <div className="glass-panel p-4 rounded-xl border border-slate-800 hover:border-slate-700/80 transition-all group flex flex-col justify-between">
      <div>
        {/* Header: Column Name & Inferred Type */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2 truncate">
            <span className="font-bold text-sm text-white truncate group-hover:text-brand-400 transition-colors">
              {column.name}
            </span>
          </div>
          <span className={`flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${colorClass}`}>
            <Icon className="w-3 h-3" />
            <span className="capitalize">{column.inferredType}</span>
          </span>
        </div>

        {/* Null Rate Bar */}
        <div className="mb-3 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/60">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-slate-400 flex items-center space-x-1">
              <span>Null Rate</span>
              {hasHighNull && <AlertTriangle className="w-3 h-3 text-brand-amber" />}
            </span>
            <span className={`font-bold ${hasHighNull ? 'text-brand-amber' : 'text-slate-300'}`}>
              {column.nullPercent}% ({column.nullCount || 0} nulls)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${hasHighNull ? 'bg-brand-amber' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(100, column.nullPercent)}%` }}
            />
          </div>
        </div>

        {/* Cardinality Stats */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-3 px-1">
          <span>Distinct Cardinality:</span>
          <span className="font-mono font-bold text-slate-200">
            {column.distinctCount} ({(column.cardinality * 100).toFixed(0)}%)
          </span>
        </div>

        {/* Sample Values */}
        {column.sampleValues && column.sampleValues.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sample Values</span>
            <div className="flex flex-wrap gap-1">
              {column.sampleValues.slice(0, 3).map((val, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 text-[11px] font-mono bg-slate-800/80 text-slate-300 rounded border border-slate-700/50 truncate max-w-[180px]"
                >
                  {String(val)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top Value Frequencies */}
      {column.stats?.topValues && column.stats.topValues.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>TOP FREQUENCY</span>
            <span>COUNT</span>
          </div>
          <div className="space-y-1">
            {column.stats.topValues.slice(0, 2).map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs text-slate-400">
                <span className="truncate max-w-[160px]">{String(item.value)}</span>
                <span className="font-mono text-slate-500">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
