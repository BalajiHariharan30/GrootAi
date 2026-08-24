import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchDatasetProfile, triggerScan } from '../store/datasetSlice.js';
import { ColumnProfileCard } from '../components/ColumnProfileCard.jsx';
import { Layers, Sparkles, GitBranch, RefreshCw, AlertTriangle, CheckCircle2, History } from 'lucide-react';

export const ProfilerPage = () => {
  const dispatch = useDispatch();
  const { selectedDatasetId, list: datasets, activeProfile, scanning, loading, schemaDrift } = useSelector(state => state.datasets);
  const activeDataset = datasets.find(d => d._id === selectedDatasetId) || datasets[0];

  useEffect(() => {
    if (selectedDatasetId) {
      dispatch(fetchDatasetProfile(selectedDatasetId));
    }
  }, [selectedDatasetId, dispatch]);

  const columns = activeProfile?.columns || activeDataset?.profile?.columns || [];
  const history = activeDataset?.profile?.history || [];

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Auto-Profiler & Schema Drift</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
              ZERO-CONFIG INFERENCE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Inferred data types, null distributions, distinct cardinality, and versioned schema drift tracking for <span className="text-white font-bold">{activeDataset?.name}</span>.
          </p>
        </div>

        <button
          disabled={scanning || !selectedDatasetId}
          onClick={() => dispatch(triggerScan(selectedDatasetId))}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-slate-950 shadow-glow-emerald transition-all active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          <span>{scanning ? 'Profiling Dataset...' : 'Re-Profile Schema'}</span>
        </button>
      </div>

      {/* Schema Drift Alert if present */}
      {schemaDrift && schemaDrift.hasDrift && (
        <div className="glass-panel p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4" />
            <span>Schema Drift Detected Between Profile Versions</span>
          </div>
          <div className="space-y-1">
            {schemaDrift.changes.map((ch, idx) => (
              <div key={idx} className="text-xs text-slate-300 flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="font-bold text-amber-300 font-mono">{ch.type}</span>
                <span className="text-slate-400 font-mono">[{ch.column}]:</span>
                <span>{ch.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column Profiler Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-brand-cyan" />
            <span>Profiled Columns ({columns.length})</span>
          </h2>
          <span className="text-xs text-slate-500">Auto-detected types & statistics</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {columns.map(col => (
            <ColumnProfileCard key={col.name} column={col} />
          ))}
        </div>
      </div>

      {/* Profile Version History & Schema Timeline */}
      {history.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-brand-indigo" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Profile Version History</h3>
          </div>

          <div className="space-y-3">
            {history.map((hist, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <div className="flex items-center space-x-3">
                  <span className="font-mono font-bold text-brand-cyan">v{hist.version}</span>
                  <span className="text-slate-400">{new Date(hist.profiledAt).toLocaleString()}</span>
                  <span className="text-slate-500 italic truncate max-w-xs">{hist.driftSummary || 'Baseline'}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-slate-400">{hist.rowCount} records</span>
                  <span className="font-mono font-bold text-emerald-400">Score: {hist.qualityScore}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
