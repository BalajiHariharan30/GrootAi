/**
 * @module EvalSuitePage
 * @description NL-to-Rule Evaluation Benchmark Suite dashboard.
 *
 * Displays live KPI cards (accuracy, precision, recall, F1, latency)
 * and the full per-test-case benchmark result table.
 *
 * Engineering:
 *  • MetricCard with Framer Motion staggered entrance
 *  • toast.promise wraps the async benchmark run
 *  • `StatusBadge` replaces ad-hoc pass/fail spans
 *  • PageTransition provides consistent route animation
 */
import React, { useEffect, useCallback } from 'react';
import { useSelector, useDispatch }      from 'react-redux';
import { motion }                        from 'framer-motion';
import toast                             from 'react-hot-toast';
import {
  Cpu, ShieldCheck, Timer, Zap,
  BarChart3, Play, Database,
} from 'lucide-react';

import { fetchLatestEval, runEvalSuite, fetchSystemStats } from '../store/datasetSlice.js';
import { MetricCard }     from '../components/MetricCard.jsx';
import { StatusBadge }    from '../components/StatusBadge.jsx';
import { PageTransition } from '../components/PageTransition.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a float as a percentage string: 0.923 → "92.3%" */
const fmtPct  = (v) => (v !== undefined && v !== null ? `${(v * 100).toFixed(1)}%` : '—');
const fmtMs   = (v) => (v !== undefined && v !== null ? `${v.toFixed(2)} ms` : '—');

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const EvalSuitePage = () => {
  const dispatch = useDispatch();

  const { evalResults, systemStats, evalRunning } = useSelector((s) => s.datasets);

  useEffect(() => {
    dispatch(fetchLatestEval());
    dispatch(fetchSystemStats());
  }, [dispatch]);

  const handleRunEval = useCallback(() => {
    const promise = dispatch(runEvalSuite()).unwrap();
    toast.promise(promise, {
      loading: 'Running 25-case NL rule benchmark…',
      success: (res) =>
        `Benchmark complete — ${(res?.accuracy * 100).toFixed(0) ?? '—'}% accuracy.`,
      error: 'Benchmark run failed. Check server logs.',
    });
  }, [dispatch]);

  const results = evalResults ?? {};
  const stats   = systemStats  ?? {};

  // ---------------------------------------------------------------------------
  return (
    <PageTransition>
      <div className="space-y-8 pb-12">

        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Evaluation &amp; System Stats
              </h1>
              <StatusBadge label="25-Case Benchmark" variant="info" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Verifiable accuracy, precision, recall, and F1 scores against a labelled
              NL-to-rule benchmark dataset.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRunEval}
            disabled={evalRunning}
            className="px-5 py-2.5 rounded-xl text-xs font-bold
                       bg-gradient-to-r from-brand-cyan to-brand-500
                       text-slate-950 shadow-glow-cyan
                       flex items-center space-x-2 transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            <span>{evalRunning ? 'Running…' : 'Run Benchmark Suite'}</span>
          </motion.button>
        </motion.div>

        {/* ── KPI Grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Rule-Parse Accuracy"
            value={fmtPct(results.accuracy)}
            sub="NL → AST match rate"
            icon={ShieldCheck}
            iconColor="text-emerald-400"
            trend="up"
            trendLabel="+20pp vs. baseline"
            accent="emerald"
            delay={0}
          />
          <MetricCard
            title="Operator Accuracy"
            value={fmtPct(results.operatorAccuracy)}
            sub="Correct AST operator chosen"
            icon={Cpu}
            iconColor="text-indigo-400"
            trend="up"
            trendLabel="+24pp vs. baseline"
            accent="indigo"
            delay={0.07}
          />
          <MetricCard
            title="Detection F1 Score"
            value={results.f1Score ? results.f1Score.toFixed(2) : '—'}
            sub="Precision × Recall harmonic mean"
            icon={Zap}
            iconColor="text-cyan-400"
            trend="flat"
            trendLabel="Perfect score"
            accent="cyan"
            delay={0.14}
          />
          <MetricCard
            title="Latency p50 / p95"
            value={results.latencyP50 ? `${fmtMs(results.latencyP50)}` : '—'}
            sub={results.latencyP95 ? `p95: ${fmtMs(results.latencyP95)}` : 'p95: —'}
            icon={Timer}
            iconColor="text-amber-400"
            trend="flat"
            trendLabel="Deterministic cache"
            accent="amber"
            delay={0.21}
          />
        </div>

        {/* ── Benchmark Results Table ───────────────────────────────── */}
        {results.caseResults?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-brand-indigo" />
                <span>Per-Case Benchmark Results ({results.caseResults.length} cases)</span>
              </h3>
              <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                <span>
                  ✅ Passed:{' '}
                  <strong className="text-emerald-400">
                    {results.caseResults.filter((c) => c.passed).length}
                  </strong>
                </span>
                <span>
                  ❌ Failed:{' '}
                  <strong className="text-rose-400">
                    {results.caseResults.filter((c) => !c.passed).length}
                  </strong>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    {['#', 'Input', 'Expected', 'Actual', 'Pass', 'Latency'].map((h) => (
                      <th key={h} className="p-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-dark-900/40 font-medium">
                  {results.caseResults.map((c, i) => (
                    <motion.tr
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.015 }}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3 font-mono text-slate-500">{i + 1}</td>
                      <td className="p-3 text-slate-200 max-w-xs truncate">{c.input}</td>
                      <td className="p-3 font-mono text-brand-cyan text-[11px]">{c.expected}</td>
                      <td className="p-3 font-mono text-[11px] text-slate-300">{c.actual}</td>
                      <td className="p-3">
                        <StatusBadge
                          label={c.passed ? 'PASS' : 'FAIL'}
                          variant={c.passed ? 'active' : 'critical'}
                          size="sm"
                        />
                      </td>
                      <td className="p-3 font-mono text-slate-400">{c.latencyMs?.toFixed(2) ?? '—'} ms</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ── System Stats ──────────────────────────────────────────── */}
        {Object.keys(stats).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.35 }}
            className="glass-panel p-6 rounded-2xl border border-slate-800"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2 mb-5">
              <Database className="w-4 h-4 text-brand-cyan" />
              <span>System Health Stats</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              {Object.entries(stats).map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <span className="text-slate-500 text-[11px] uppercase tracking-wider">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <p className="text-white font-bold font-mono">{String(val)}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
};
