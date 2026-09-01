/**
 * @module VirtualizedTable
 * @description High-performance virtualized data record table powered by react-window.
 *
 * Key engineering decisions:
 *  • `useDebounce(300ms)` on search input — no per-keystroke filter recalculation
 *  • `useMemo` on filteredRecords — recomputes only when debounced query or data changes
 *  • `useCallback` on Row renderer — prevents react-window itemData churn
 *  • PropTypes validation on all props
 *  • Guest mode badge shows when no mutation actions are available
 */
import React, { useState, useMemo, useCallback, memo } from 'react';
import { FixedSizeList as List }                        from 'react-window';
import { motion }                                       from 'framer-motion';
import PropTypes                                        from 'prop-types';
import {
  Search, AlertCircle, CheckCircle, Eye,
} from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce.js';

// ---------------------------------------------------------------------------
// Row Renderer — memoised to avoid unnecessary react-window re-renders
// ---------------------------------------------------------------------------

const TableRow = memo(({ index, style, data }) => {
  const { records: filteredRecords, columnKeys, onInspectRecord } = data;
  const record = filteredRecords[index];
  if (!record) return null;

  const rowData  = record.data || record;
  const hasIssue = record.hasIssues;

  return (
    <div
      style={style}
      className={`flex items-center border-b border-slate-800/60 px-4 text-xs font-medium
                  transition-colors hover:bg-slate-800/50 ${
        hasIssue ? 'bg-rose-950/20 text-rose-200' : 'text-slate-300'
      }`}
    >
      {/* Row Index & Issue Dot */}
      <div className="w-16 flex items-center space-x-1.5 shrink-0">
        <span className="text-slate-400 font-mono">#{record.rowNumber ?? index + 1}</span>
        <span
          className={`w-2 h-2 rounded-full ${
            hasIssue ? 'bg-brand-rose animate-pulse' : 'bg-brand-500/40'
          }`}
          title={hasIssue ? 'Issue flagged' : 'Clean'}
        />
      </div>

      {/* Dynamic Column Cells (first 6) */}
      <div className="flex-1 flex items-center space-x-4 overflow-hidden">
        {columnKeys.slice(0, 6).map((key) => {
          const val    = rowData[key];
          const isNull = val === null || val === undefined || val === '' || val === 'N/A';
          return (
            <div key={key} className="flex-1 truncate">
              {isNull ? (
                <span className="text-slate-400 italic">null</span>
              ) : typeof val === 'number' ? (
                <span className="font-mono text-cyan-300">{val.toLocaleString('en-IN')}</span>
              ) : (
                <span className="truncate">{String(val)}</span>
              )}

            </div>
          );
        })}
      </div>

      {/* Inspect Action */}
      <div className="w-12 flex justify-end shrink-0">
        <button
          onClick={() => onInspectRecord?.(record)}
          className="p-1 rounded hover:bg-slate-700/60 text-slate-400
                     hover:text-white transition-colors"
          title="Inspect record"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

TableRow.displayName = 'TableRow';

// ---------------------------------------------------------------------------
// VirtualizedTable
// ---------------------------------------------------------------------------

export const VirtualizedTable = ({ records = [], columns = [], onInspectRecord }) => {
  const [searchInput,    setSearchInput]    = useState('');
  const [filterIssuesOnly, setFilterIssuesOnly] = useState(false);

  // Debounce the search input — 300ms idle before filtering
  const debouncedSearch = useDebounce(searchInput, 300);

  const columnKeys = useMemo(
    () =>
      columns.length > 0
        ? columns.map((c) => c.name)
        : records[0]
          ? Object.keys(records[0].data ?? records[0])
          : [],
    [columns, records],
  );

  // Filter and search — only recomputes when debounced value or filter changes
  const filteredRecords = useMemo(() => {
    let result = records;
    if (filterIssuesOnly) {
      result = result.filter((r) => r.hasIssues);
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result  = result.filter((r) => {
        const raw = r.data ?? r;
        return Object.values(raw).some(
          (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(q),
        );
      });
    }
    return result;
  }, [records, debouncedSearch, filterIssuesOnly]);

  // Stable itemData object for react-window (avoids re-renders)
  const itemData = useMemo(
    () => ({ records: filteredRecords, columnKeys, onInspectRecord }),
    [filteredRecords, columnKeys, onInspectRecord],
  );

  const handleToggleIssueFilter = useCallback(
    () => setFilterIssuesOnly((prev) => !prev),
    [],
  );

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 flex flex-col h-[520px]">

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center
                      justify-between gap-3 bg-dark-900/60">
        <div className="flex items-center space-x-3">
          {/* Debounced Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search across all fields…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="bg-slate-950/80 border border-slate-700/70 rounded-lg
                         pl-9 pr-3 py-1.5 text-xs text-slate-200
                         placeholder-slate-500 focus:outline-none focus:border-brand-500
                         transition-colors w-64"
            />
          </div>

          {/* Issues-Only Toggle */}
          <button
            onClick={handleToggleIssueFilter}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold
                        flex items-center space-x-1.5 transition-colors ${
              filterIssuesOnly
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700/60 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Issues Only</span>
          </button>
        </div>

        <div className="text-xs text-slate-400">
          Showing{' '}
          <span className="font-bold text-white">{filteredRecords.length}</span>{' '}
          of {records.length} records
          {debouncedSearch && (
            <span className="ml-1 text-brand-cyan">· filtered</span>
          )}
        </div>
      </div>

      {/* ── Column Headers ────────────────────────────────────────── */}
      <div className="flex items-center px-4 py-2.5 bg-slate-900/90 border-b border-slate-800
                      text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        <div className="w-16 shrink-0">Row</div>
        <div className="flex-1 flex items-center space-x-4">
          {columnKeys.slice(0, 6).map((key) => (
            <div key={key} className="flex-1 truncate">{key}</div>
          ))}
        </div>
        <div className="w-12 text-right shrink-0">View</div>
      </div>

      {/* ── Virtualized Body ──────────────────────────────────────── */}
      <div className="flex-1 w-full">
        {filteredRecords.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full text-slate-500 text-xs space-y-2"
          >
            <CheckCircle className="w-8 h-8 text-slate-400" />
            <p>No records match the current search or filter</p>
          </motion.div>
        ) : (
          <List
            height={420}
            itemCount={filteredRecords.length}
            itemSize={44}
            itemData={itemData}
            width="100%"
          >
            {TableRow}
          </List>
        )}
      </div>
    </div>
  );
};

VirtualizedTable.propTypes = {
  records:         PropTypes.arrayOf(PropTypes.object),
  columns:         PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string })),
  onInspectRecord: PropTypes.func,
};

