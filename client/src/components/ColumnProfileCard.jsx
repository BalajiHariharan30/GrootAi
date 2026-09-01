import React from 'react';
import { Tag, Hash, Mail, Phone, Calendar, CheckSquare, Sparkles, AlertTriangle } from 'lucide-react';

const typeIcons = {
  email:    Mail,
  phone:    Phone,
  integer:  Hash,
  float:    Hash,
  date:     Calendar,
  boolean:  CheckSquare,
  id:       Tag,
  category: Sparkles,
  string:   Tag,
};

const typeColors = {
  email:    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  phone:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  integer:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  float:    'bg-teal-500/10 text-teal-400 border-teal-500/20',
  date:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
  boolean:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  id:       'bg-blue-500/10 text-blue-400 border-blue-500/20',
  category: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  string:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const BAR_COLORS = [
  'bg-brand-500', 'bg-brand-cyan', 'bg-brand-indigo',
  'bg-brand-amber', 'bg-rose-400',
];

/** Mini inline frequency bar chart for top values */
function FrequencyBarChart({ topValues }) {
  if (!topValues || topValues.length === 0) return null;
  const maxCount = Math.max(...topValues.map((v) => v.count), 1);

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/80">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        Value Distribution
      </p>
      <div className="space-y-1.5">
        {topValues.slice(0, 5).map((item, idx) => {
          const pct = Math.round((item.count / maxCount) * 100);
          return (
            <div key={idx}>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                <span className="truncate max-w-[140px] font-mono">{String(item.value)}</span>
                <span className="font-bold text-slate-300 ml-2 shrink-0">{item.count}</span>
              </div>
              <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ColumnProfileCard = ({ column }) => {
  const Icon        = typeIcons[column.inferredType] || Tag;
  const colorClass  = typeColors[column.inferredType] || typeColors.string;
  const hasHighNull = column.nullPercent > 10;

  const nullBarColor = column.nullPercent > 30
    ? 'bg-rose-500'
    : column.nullPercent > 10
    ? 'bg-brand-amber'
    : 'bg-brand-500';

  return (
    <div className="glass-panel p-4 rounded-xl border border-slate-800 hover:border-slate-700/80 transition-all group flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-sm text-white truncate group-hover:text-brand-400 transition-colors">
            {column.name}
          </span>
          <span className={`flex items-center space-x-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${colorClass}`}>
            <Icon className="w-3 h-3" />
            <span className="capitalize">{column.inferredType}</span>
          </span>
        </div>

        {/* Null Rate Visual Bar */}
        <div className="mb-3 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/60">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="text-slate-400 flex items-center space-x-1">
              <span>Null Rate</span>
              {hasHighNull && <AlertTriangle className="w-3 h-3 text-brand-amber" />}
            </span>
            <span className={`font-bold font-mono ${hasHighNull ? 'text-brand-amber' : 'text-slate-300'}`}>
              {column.nullPercent}%
              <span className="text-slate-500 font-normal ml-1">({column.nullCount || 0} nulls)</span>
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${nullBarColor}`}
              style={{ width: `${Math.min(100, column.nullPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>0%</span>
            <span className="text-slate-500">{(100 - column.nullPercent).toFixed(1)}% complete</span>
            <span>100%</span>
          </div>
        </div>

        {/* Cardinality */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-3 px-1">
          <span>Distinct:</span>
          <span className="font-mono font-bold text-slate-200">
            {column.distinctCount}
            <span className="text-slate-500 font-normal ml-1">
              ({(column.cardinality * 100).toFixed(0)}% unique)
            </span>
          </span>
        </div>

        {/* Numeric Stats Row */}
        {(column.stats?.min !== undefined || column.stats?.avg !== undefined) && (
          <div className="flex items-center justify-around text-[11px] text-slate-400 bg-slate-900/60 rounded-lg px-2 py-1.5 mb-3 border border-slate-800/50">
            {column.stats?.min !== undefined && (
              <span>Min: <span className="text-slate-300 font-mono font-bold">{typeof column.stats.min === 'number' ? column.stats.min.toLocaleString('en-IN') : column.stats.min}</span></span>
            )}
            {column.stats?.avg !== undefined && (
              <span>Avg: <span className="text-brand-cyan font-mono font-bold">{typeof column.stats.avg === 'number' ? column.stats.avg.toLocaleString('en-IN') : column.stats.avg}</span></span>
            )}
            {column.stats?.max !== undefined && (
              <span>Max: <span className="text-slate-300 font-mono font-bold">{typeof column.stats.max === 'number' ? column.stats.max.toLocaleString('en-IN') : column.stats.max}</span></span>
            )}
          </div>
        )}


        {/* Sample Values */}
        {column.sampleValues && column.sampleValues.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sample Values</span>
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

      {/* Inline Frequency Bar Chart */}
      <FrequencyBarChart topValues={column.stats?.topValues} />
    </div>
  );
};


