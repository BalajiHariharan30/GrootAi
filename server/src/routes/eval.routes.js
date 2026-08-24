/**
 * @module eval.routes
 * @description Express router for NL-to-Rule benchmark evaluation suite
 * and system telemetry.
 *
 * Routes:
 *   POST /run           → runs 25-case eval suite, returns full report
 *   GET  /latest        → returns last report (runs fresh if none exists)
 *   GET  /system-stats  → process uptime, memory, cache stats, model info
 */
import express              from 'express';
import { runEvaluationSuite } from '../../tests/eval/evalRunner.js';
import { cache }            from '../cache/redisClient.js';
import { asyncHandler }     from '../middleware/asyncHandler.js';
import logger               from '../config/logger.js';

const router = express.Router();

/** Module-level singleton for the last eval report */
let lastEvalReport = null;

// ── POST /api/eval/run ───────────────────────────────────────────────────
/**
 * Runs the full 25-case NL-to-Rule benchmark suite and returns the report.
 * Results are stored in memory so subsequent GET /latest is instant.
 */
router.post(
  '/run',
  asyncHandler(async (_req, res) => {
    logger.info({ event: 'eval_suite_started' });
    const report       = await runEvaluationSuite();
    lastEvalReport     = report;

    logger.info({
      event:            'eval_suite_complete',
      accuracy:         report.accuracy,
      operatorAccuracy: report.operatorAccuracy,
      f1Score:          report.f1Score,
      latencyP50:       report.latencyP50,
      latencyP95:       report.latencyP95,
    });

    res.json({ success: true, data: report });
  }),
);

// ── GET /api/eval/latest ─────────────────────────────────────────────────
/**
 * Returns the most recent evaluation report.
 * If no report exists yet, runs a fresh suite automatically.
 */
router.get(
  '/latest',
  asyncHandler(async (_req, res) => {
    if (!lastEvalReport) {
      logger.info({ event: 'eval_auto_run', reason: 'no_cached_report' });
      lastEvalReport = await runEvaluationSuite();
    }
    res.json({ success: true, data: lastEvalReport });
  }),
);

// ── GET /api/eval/system-stats ───────────────────────────────────────────
/** Returns live system telemetry — uptime, memory, cache hit rate, model config. */
router.get(
  '/system-stats',
  asyncHandler(async (_req, res) => {
    const cacheStats = cache.getStats();
    const memMb      = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);

    res.json({
      success: true,
      data: {
        uptime_seconds:   Math.round(process.uptime()),
        node_version:     process.version,
        memory_usage_mb:  memMb,
        cache_driver:     cacheStats.driver    ?? 'memory',
        cache_hit_rate:   `${((cacheStats.hitRate ?? 0) * 100).toFixed(1)}%`,
        cache_keys:       cacheStats.keys      ?? 0,
        model_provider:   process.env.ANTHROPIC_API_KEY
          ? 'Claude (Live Tool Use)'
          : 'Deterministic AST Engine (Local)',
        eval_cases:       lastEvalReport?.totalCases ?? 'not yet run',
        accuracy:         lastEvalReport?.accuracy
          ? `${(lastEvalReport.accuracy * 100).toFixed(1)}%`
          : 'not yet run',
      },
    });
  }),
);

export default router;
