/**
 * @module eval.routes
 * @description Express router for NL-to-Rule benchmark evaluation suite
 * and system telemetry.
 *
 * Routes:
 *   POST /run           → runs 25-case eval suite, returns full report (admin only)
 *   GET  /latest        → returns last report (authenticated users only)
 *   GET  /system-stats  → process uptime, memory, cache stats, model info (public)
 */
import express              from 'express';
import { runEvaluationSuite } from '../../tests/eval/evalRunner.js';
import { cache }            from '../cache/redisClient.js';
import { asyncHandler }     from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/requireAuth.js';
import logger               from '../config/logger.js';

const router = express.Router();

/** Module-level singleton for the last eval report */
let lastEvalReport = null;

// ── POST /api/eval/run ───────────────────────────────────────────────────
/**
 * Runs the full 25-case NL-to-Rule benchmark suite and returns the report.
 * Gap 2 fix: requires admin role — this triggers 25 AI calls which cost tokens.
 */
router.post(
  '/run',
  requireAuth(),
  requireRole('admin'),
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
 * Gap 2 fix: requires authentication to view eval results.
 */
router.get(
  '/latest',
  requireAuth({ allowGuest: true }),
  asyncHandler(async (_req, res) => {
    if (!lastEvalReport) {
      // Don't auto-run on GET — too expensive. Return a friendly message instead.
      return res.json({
        success: true,
        data: null,
        message: 'No eval report yet. An admin must run POST /api/eval/run first.',
      });
    }
    res.json({ success: true, data: lastEvalReport });
  }),
);

// ── GET /api/eval/system-stats ───────────────────────────────────────────
/** Returns live system telemetry — uptime, memory, cache hit rate, model config. Public read-only. */
router.get(
  '/system-stats',
  asyncHandler(async (_req, res) => {
    const cacheStats = cache.getStats();
    const memMb      = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);

    // Gap 5 fix: detect placeholder API key — don't show "Live Tool Use" for placeholder strings
    const hasRealApiKey = process.env.ANTHROPIC_API_KEY
      && !process.env.ANTHROPIC_API_KEY.includes('your_')
      && process.env.ANTHROPIC_API_KEY.length > 20;

    res.json({
      success: true,
      data: {
        uptime_seconds:   Math.round(process.uptime()),
        node_version:     process.version,
        memory_usage_mb:  parseFloat(memMb),
        cache_driver:     cacheStats.driver    ?? 'In-Memory',
        cache_hit_rate:   cacheStats.hitRatePercent ?? 0,
        cache_keys:       cacheStats.cachedKeysCount ?? 0,
        // Gap 3/5 fix: show accurate AI mode status
        model_provider:   hasRealApiKey
          ? 'Claude 3.5 Sonnet (Live Tool Use)'
          : 'Deterministic AST Engine (Grounded — No API Key)',
        ai_mode:          hasRealApiKey ? 'claude' : 'ast_parser',
        eval_cases:       lastEvalReport?.totalCases ?? null,
        accuracy:         lastEvalReport?.accuracy ?? null,
      },
    });
  }),
);

export default router;
