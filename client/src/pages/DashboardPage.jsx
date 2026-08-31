import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchDatasets,
  fetchDatasetProfile,
  seedDatasets,
  triggerScan,
  setSelectedDataset,
} from '../store/datasetSlice.js';
import { apiGet } from '../store/api.js';
import { QualityScoreGauge } from '../components/QualityScoreGauge.jsx';
import { VirtualizedTable }  from '../components/VirtualizedTable.jsx';
import { ExportService }     from '../services/ExportService.js';
import {
  Database, Sparkles, Layers, ShieldAlert, Play, UploadCloud,
  RefreshCw, ArrowUpRight, TrendingUp, Cpu, Search, Download,
  ChevronRight,
} from 'lucide-react';

// ── Mini sparkline using inline SVG ──────────────────────────────────────
function QualitySparkline({ history }) {
  if (!history || history.length < 2) return null;

  const scores = history.map((h) => h.qualityScore);
  const min    = Math.min(...scores);
  const max    = Math.max(...scores, min + 1);
  const W = 120, H = 36, PAD = 4;

  const pts = scores.map((s, i) => {
    const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((s - min) / (max - min)) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(' ');

  const lastScore = scores[scores.length - 1];
  const firstScore = scores[0];
  const trend = lastScore >= firstScore ? 'text-emerald-400' : 'text-rose-400';
  const trendLabel = lastScore >= firstScore
    ? `↑ +${(lastScore - firstScore).toFixed(1)}%`
    : `↓ ${(lastScore - firstScore).toFixed(1)}%`;

  return (
    <div className="flex items-center space-x-3">
      <svg width={W} height={H} className="shrink-0">
        <polyline
          points={pts}
          fill="none"
          stroke="rgb(16 185 129 / 0.4)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Last point dot */}
        {scores.length > 0 && (() => {
          const lx = PAD + ((scores.length - 1) / (scores.length - 1)) * (W - PAD * 2);
          const ly = H - PAD - ((scores[scores.length - 1] - min) / (max - min)) * (H - PAD * 2);
          return <circle cx={lx} cy={ly} r="3" fill="rgb(16 185 129)" />;
        })()}
      </svg>
      <span className={`text-[11px] font-bold font-mono ${trend}`}>{trendLabel}</span>
    </div>
  );
}

// ── Dataset Card ─────────────────────────────────────────────────────────
const SOURCE_ICONS = { csv: '📄', demo: '🏢', api: '🔌', db: '🗄️', json: '📋' };

const DatasetCard = React.memo(({ dataset, isSelected, onSelect, onScan, scanning }) => {
  const history  = dataset.profile?.history ?? [];
  const srcIcon  = SOURCE_ICONS[dataset.sourceType] ?? '📦';
  const fileName = dataset.name;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(dataset._id)}
      className={`glass-panel p-5 rounded-2xl cursor-pointer transition-all duration-200 relative group overflow-hidden ${
        isSelected
          ? 'border-brand-500/50 shadow-glow-emerald bg-dark-850'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* ── Header: source icon + name + source type badge ───── */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center space-x-2 truncate min-w-0">
          <span className="text-xl shrink-0" title={`Source: ${dataset.sourceType}`}>{srcIcon}</span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm text-white truncate group-hover:text-brand-400 transition-colors leading-tight">
              {fileName}
            </h3>
            {/* File / org identifier row */}
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                {dataset.sourceType === 'csv' ? '📎 Uploaded CSV' : dataset.sourceType === 'demo' ? '🏢 Demo Dataset' : dataset.sourceType}
              </span>
              {dataset.sourceType === 'csv' && (
                <span className="text-[10px] text-brand-cyan font-mono truncate">
                  {dataset.description?.includes('CSV') ? `${dataset.rowCount} rows` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ml-2 ${
          dataset.qualityScore >= 90 ? 'bg-brand-500/10 text-brand-400 border-brand-500/20'
          : dataset.qualityScore >= 75 ? 'bg-brand-amber/10 text-brand-amber border-brand-amber/20'
          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        }`}>
          {dataset.qualityScore || 100}%
        </span>
      </div>

      {/* ── Description (org / data context) ─────────────────── */}
      <p className="text-[11px] text-slate-400 line-clamp-2 mb-3 mt-2 leading-relaxed">
        {dataset.description || 'Enterprise tabular data source'}
      </p>

      {/* Quality sparkline history */}
      {history.length >= 2 && (
        <div className="mb-3">
          <QualitySparkline history={history} />
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
        <div className="text-slate-400 space-x-3 flex items-center">
          <span><span className="font-bold text-white font-mono">{dataset.rowCount || 0}</span> rows</span>
          {dataset.profile?.columns?.length > 0 && (
            <span><span className="font-bold text-slate-300 font-mono">{dataset.profile.columns.length}</span> cols</span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onScan(dataset._id); }}
          disabled={scanning}
          title="Run DQ Scan"
          className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-brand-500/10
                     text-brand-400 border border-brand-500/20 hover:bg-brand-500/20
                     transition-colors disabled:opacity-40 text-[10px] font-bold"
        >
          <Play className="w-3 h-3" />
          <span>{scanning ? 'Scanning…' : 'Run Scan'}</span>
        </button>
      </div>
    </motion.div>
  );
});
DatasetCard.displayName = 'DatasetCard';


// ── Page ─────────────────────────────────────────────────────────────────
export const DashboardPage = ({ onOpenUpload, onNavigate }) => {
  const dispatch = useDispatch();
  const {
    list: datasets, selectedDatasetId, activeProfile, scanning, loading,
  } = useSelector((state) => state.datasets);
  const { rulesList } = useSelector((state) => state.rules);

  const [records, setRecords]           = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [inspectedRecord, setInspectedRecord] = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');

  const activeDataset = datasets.find((d) => d._id === selectedDatasetId) || datasets[0];

  // ── Bootstrap ────────────────────────────────────────────────────────
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
      const { ok, data } = await apiGet(`/api/datasets/${id}/records?limit=100`);
      setRecords(ok && data?.data ? data.data : []);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  };

  // ── Filtered dataset list ────────────────────────────────────────────
  const filteredDatasets = useMemo(() => {
    if (!searchQuery.trim()) return datasets;
    const q = searchQuery.toLowerCase();
    return datasets.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.sourceType?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q),
    );
  }, [datasets, searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleScan   = useCallback((id) => dispatch(triggerScan(id)), [dispatch]);
  const handleSelect = useCallback((id) => dispatch(setSelectedDataset(id)), [dispatch]);

  const handleExportCSV = useCallback(() => {
    if (!records.length) return;
    const colNames = activeDataset?.profile?.columns?.map((c) => c.name) || [];
    ExportService.downloadCSV(
      records,
      colNames,
      `${activeDataset?.name ?? 'records'}-export`,
    );
  }, [records, activeDataset]);

  return (
    <div className="space-y-8 animate-fade-in pb-12">

      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Enterprise Data Catalog</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
              LIVE OBSERVABILITY
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            AI-powered auto-profiling, natural language rule execution, and explainable deduplication.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => dispatch(seedDatasets())}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700
                       text-slate-200 border border-slate-700/80 transition-all flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
            <span>Reset Demo</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-cyan to-brand-500
                       text-slate-950 shadow-glow-cyan transition-all active:scale-95 flex items-center space-x-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Ingest CSV</span>
          </button>
        </div>
      </div>

      {/* Quality Score Gauge */}
      {activeDataset && (
        <QualityScoreGauge
          score={activeDataset.qualityScore || 100}
          dimensions={activeDataset.dimensions || {}}
          rowCount={activeDataset.rowCount || records.length}
        />
      )}

      {/* Datasets Grid with Search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <Database className="w-4 h-4 text-brand-cyan" />
            <span>Registered Datasets</span>
            <span className="text-slate-600 normal-case font-normal tracking-normal">
              ({filteredDatasets.length} of {datasets.length})
            </span>
          </h2>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search datasets…"
              className="w-full sm:w-56 bg-slate-900/90 border border-slate-700/80 rounded-xl
                         pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500
                         focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
            />
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {filteredDatasets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 text-slate-500 text-sm"
            >
              No datasets match "{searchQuery}"
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDatasets.map((dataset) => (
                <DatasetCard
                  key={dataset._id}
                  dataset={dataset}
                  isSelected={dataset._id === selectedDatasetId}
                  onSelect={handleSelect}
                  onScan={handleScan}
                  scanning={scanning}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Record Virtualizer */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-brand-indigo" />
              <span>Record Virtualizer &amp; Inspection</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">High-scale 60fps virtualization across dataset records</p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              disabled={!records.length}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                         bg-slate-800 border border-slate-700 text-slate-300 hover:text-white
                         hover:bg-slate-700 transition-colors disabled:opacity-40"
              title="Export records to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => onNavigate('rules')}
              className="text-xs font-bold text-brand-cyan hover:text-brand-400 flex items-center space-x-1 transition-colors"
            >
              <span>NL Rules</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <VirtualizedTable
          records={records}
          columns={activeDataset?.profile?.columns || []}
          onInspectRecord={(rec) => setInspectedRecord(rec)}
        />
      </div>

      {/* Record Inspector Modal */}
      <AnimatePresence>
        {inspectedRecord && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="glass-panel w-full max-w-xl rounded-2xl border border-slate-700/80 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-base text-white">
                    Record #{inspectedRecord.rowNumber} Inspection
                  </span>
                  {inspectedRecord.hasIssues && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {inspectedRecord.issueCount || 1} Issues
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setInspectedRecord(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold"
                >
                  Close
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
                {Object.entries(inspectedRecord.data || inspectedRecord).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800"
                  >
                    <span className="text-slate-400 font-bold">{key}</span>
                    <span className="text-slate-200 truncate max-w-[300px]">{String(val ?? 'null')}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
