import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchDatasets, fetchDatasetProfile, seedDatasets, triggerScan, setSelectedDataset } from '../store/datasetSlice.js';
import { QualityScoreGauge } from '../components/QualityScoreGauge.jsx';
import { VirtualizedTable } from '../components/VirtualizedTable.jsx';
import { 
  Database, 
  Sparkles, 
  Layers, 
  ShieldAlert, 
  Play, 
  UploadCloud, 
  RefreshCw, 
  Plus, 
  ArrowUpRight,
  TrendingUp,
  Cpu
} from 'lucide-react';

export const DashboardPage = ({ onOpenUpload, onNavigate }) => {
  const dispatch = useDispatch();
  const { list: datasets, selectedDatasetId, activeProfile, scanning, loading } = useSelector(state => state.datasets);
  const { rulesList } = useSelector(state => state.rules);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [inspectedRecord, setInspectedRecord] = useState(null);

  const activeDataset = datasets.find(d => d._id === selectedDatasetId) || datasets[0];

  useEffect(() => {
    dispatch(fetchDatasets());
  }, [dispatch]);

  useEffect(() => {
    if (selectedDatasetId) {
      dispatch(fetchDatasetProfile(selectedDatasetId));
      fetchRecords(selectedDatasetId);
    }
  }, [selectedDatasetId, dispatch]);

  const fetchRecords = async (id) => {
    setRecordsLoading(true);
    try {
      const res = await fetch(`/api/datasets/${id}/records?limit=100`);
      const data = await res.json();
      setRecords(data.data || []);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  const handleSeed = () => {
    dispatch(seedDatasets());
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Top Banner / Quick Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Enterprise Data Catalog</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
              LIVE OBSERVABILITY
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            CLAIRE-powered auto-profiling, natural language rule execution, and explainable deduplication.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSeed}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-all flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
            <span>Reset Demo Datasets</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-cyan to-brand-500 text-slate-950 shadow-glow-cyan transition-all active:scale-95 flex items-center space-x-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Ingest CSV</span>
          </button>
        </div>
      </div>

      {/* Primary Quality Score & Dimensions Gauge */}
      {activeDataset && (
        <QualityScoreGauge
          score={activeDataset.qualityScore || 100}
          dimensions={activeDataset.dimensions || {}}
          rowCount={activeDataset.rowCount || records.length}
        />
      )}

      {/* Datasets Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <Database className="w-4 h-4 text-brand-cyan" />
            <span>Registered Datasets</span>
          </h2>
          <span className="text-xs text-slate-500">{datasets.length} Active Sources</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map(dataset => {
            const isSelected = dataset._id === selectedDatasetId;
            return (
              <div
                key={dataset._id}
                onClick={() => dispatch(setSelectedDataset(dataset._id))}
                className={`glass-panel p-5 rounded-2xl cursor-pointer transition-all duration-200 relative group overflow-hidden ${
                  isSelected 
                    ? 'border-brand-500/50 shadow-glow-emerald bg-dark-850' 
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                    <h3 className="font-bold text-sm text-white truncate group-hover:text-brand-400 transition-colors">
                      {dataset.name}
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                    {dataset.sourceType}
                  </span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                  {dataset.description || 'Enterprise tabular data source'}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                  <div className="text-slate-400">
                    <span className="font-bold text-white font-mono">{dataset.rowCount || 0}</span> rows
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-400">Quality:</span>
                    <span className={`font-mono font-bold ${dataset.qualityScore >= 80 ? 'text-brand-400' : 'text-brand-amber'}`}>
                      {dataset.qualityScore || 100}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* High Performance Virtualized Records Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-indigo" />
              <span>Record Virtualizer & Inspection</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">High-scale 60fps virtualization across dataset records</p>
          </div>

          <button
            onClick={() => onNavigate('rules')}
            className="text-xs font-bold text-brand-cyan hover:text-brand-400 flex items-center space-x-1 transition-colors"
          >
            <span>Compose Natural Language Rule</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

        <VirtualizedTable
          records={records}
          columns={activeDataset?.profile?.columns || []}
          onInspectRecord={(rec) => setInspectedRecord(rec)}
        />
      </div>

      {/* Record Inspector Drawer Modal */}
      {inspectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-xl rounded-2xl border border-slate-700/80 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base text-white">Record #{inspectedRecord.rowNumber} Inspection</span>
                {inspectedRecord.hasIssues && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {inspectedRecord.issueCount || 1} Issues Detected
                  </span>
                )}
              </div>
              <button
                onClick={() => setInspectedRecord(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
              {Object.entries(inspectedRecord.data || inspectedRecord).map(([key, val]) => (
                <div key={key} className="flex items-start justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 font-bold">{key}</span>
                  <span className="text-slate-200 truncate max-w-[300px]">{String(val ?? 'null')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
