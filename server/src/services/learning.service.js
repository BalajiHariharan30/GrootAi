/**
 * @module LearningService
 * @description Continuous AI Learning Engine for GrootAi.
 *
 * Aggregates human feedback (approve / reject / rollback) into a calibration
 * matrix keyed by (issueType × strategy). The calibration matrix is used by
 * AIClient.generateRemediationProposal() to replace hardcoded confidence
 * constants with real historical approval rates.
 *
 * Architecture:
 *  - Feedback stored in FeedbackLog (MongoDB or in-memory fallback)
 *  - Calibration map rebuilt on-demand and cached for 5 minutes
 *  - getCalibrationMap() returns { [issueType]: { [strategy]: rate } }
 */
import { FeedbackLog } from '../models/FeedbackLog.js';
import { getDBStatus }  from '../config/db.js';
import { store }        from '../data/inMemoryStore.js';
import logger           from '../config/logger.js';


// ── In-Memory Fallback Store ───────────────────────────────────────────────
if (!store.feedbackLog) store.feedbackLog = [];

// ── Calibration Cache ──────────────────────────────────────────────────────
let _calibrationCache     = null;
let _calibrationCachedAt  = 0;
const CACHE_TTL_MS        = 5 * 60 * 1000; // 5 minutes

export class LearningService {

  /**
   * Record a human feedback decision.
   * @param {Object} opts
   * @param {string} opts.remediationId
   * @param {string} opts.datasetId
   * @param {string} opts.issueType        - e.g. 'format_error', 'duplicate', 'outlier'
   * @param {string} opts.strategy         - e.g. 'format_standardize', 'merge_records'
   * @param {string} opts.targetField
   * @param {'approved'|'rejected'|'rolled_back'} opts.outcome
   * @param {string} opts.actorName
   * @param {number} opts.confidence       - AI confidence at time of proposal
   */
  static async recordFeedback({
    remediationId, datasetId, issueType, strategy,
    targetField, outcome, actorName, confidence,
  }) {
    try {
      const entry = {
        remediationId,
        datasetId,
        issueType:   issueType   ?? 'unknown',
        strategy:    strategy    ?? 'format_standardize',
        targetField: targetField ?? '',
        outcome,
        actorName:   actorName   ?? 'Human Data Steward',
        confidence:  confidence  ?? null,
        createdAt:   new Date(),
      };

      if (getDBStatus()) {
        await FeedbackLog.create(entry);
      } else {
        store.feedbackLog.push({ _id: `fb_${Date.now()}`, ...entry });
      }

      // Bust calibration cache
      _calibrationCache    = null;
      _calibrationCachedAt = 0;

      logger.info({ event: 'feedback_recorded', outcome, issueType, strategy });
    } catch (err) {
      logger.warn(`[LearningService] Failed to record feedback: ${err.message}`);
    }
  }

  /**
   * Returns the full calibration map — approval rate per (issueType × strategy).
   * {
   *   format_error: { format_standardize: 0.91, domain_fix: 0.73 },
   *   duplicate:    { merge_records: 0.65 },
   *   ...
   * }
   */
  static async getCalibrationMap() {
    // Serve from cache if fresh
    if (_calibrationCache && Date.now() - _calibrationCachedAt < CACHE_TTL_MS) {
      return _calibrationCache;
    }

    let logs = [];
    if (getDBStatus()) {
      logs = await FeedbackLog.find().lean();
    } else {
      logs = store.feedbackLog ?? [];
    }

    // Aggregate: count approvals and total decisions per (issueType, strategy)
    const matrix = {};
    for (const log of logs) {
      const key  = log.issueType  ?? 'unknown';
      const strat = log.strategy  ?? 'format_standardize';
      if (!matrix[key]) matrix[key] = {};
      if (!matrix[key][strat]) matrix[key][strat] = { approved: 0, total: 0 };

      matrix[key][strat].total++;
      if (log.outcome === 'approved') matrix[key][strat].approved++;
    }

    // Convert counts to approval rates
    const calibration = {};
    for (const [issueType, strategies] of Object.entries(matrix)) {
      calibration[issueType] = {};
      for (const [strategy, counts] of Object.entries(strategies)) {
        calibration[issueType][strategy] = counts.total > 0
          ? +(counts.approved / counts.total).toFixed(4)
          : 0.85; // default prior
      }
    }

    _calibrationCache    = calibration;
    _calibrationCachedAt = Date.now();
    return calibration;
  }

  /**
   * Returns full learning stats for the dashboard:
   * approval rate per strategy, total decisions, trend, confidence drift.
   */
  static async getLearningStats() {
    let logs = [];
    if (getDBStatus()) {
      logs = await FeedbackLog.find().sort({ createdAt: -1 }).lean();
    } else {
      logs = [...(store.feedbackLog ?? [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    }

    const total         = logs.length;
    const totalApproved = logs.filter((l) => l.outcome === 'approved').length;
    const totalRejected = logs.filter((l) => l.outcome === 'rejected').length;
    const totalRolledBack = logs.filter((l) => l.outcome === 'rolled_back').length;

    // Per-strategy breakdown
    const strategyStats = {};
    for (const log of logs) {
      const s = log.strategy ?? 'unknown';
      if (!strategyStats[s]) strategyStats[s] = { approved: 0, rejected: 0, rolled_back: 0, total: 0 };
      strategyStats[s].total++;
      strategyStats[s][log.outcome] = (strategyStats[s][log.outcome] ?? 0) + 1;
    }

    const strategies = Object.entries(strategyStats).map(([name, counts]) => ({
      name,
      total:        counts.total,
      approved:     counts.approved,
      rejected:     counts.rejected,
      rolledBack:   counts.rolled_back,
      approvalRate: counts.total > 0 ? +(counts.approved / counts.total * 100).toFixed(1) : 0,
    })).sort((a, b) => b.total - a.total);

    // Recent 7-day trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentLogs   = logs.filter((l) => new Date(l.createdAt) >= sevenDaysAgo);
    const recentApprovalRate = recentLogs.length > 0
      ? +(recentLogs.filter((l) => l.outcome === 'approved').length / recentLogs.length * 100).toFixed(1)
      : null;

    // Overall calibration map
    const calibrationMap = await LearningService.getCalibrationMap();

    // Health signal
    const overallRate   = total > 0 ? totalApproved / total : 0;
    const healthStatus  = overallRate >= 0.8
      ? 'excellent' : overallRate >= 0.6
      ? 'good'      : overallRate >= 0.4
      ? 'improving' : 'needs_review';

    return {
      totalDecisions:    total,
      totalApproved,
      totalRejected,
      totalRolledBack,
      overallApprovalRate: total > 0 ? +(totalApproved / total * 100).toFixed(1) : 0,
      recentApprovalRate,
      healthStatus,
      strategies,
      calibrationMap,
      lastUpdated: new Date().toISOString(),
    };
  }
}
