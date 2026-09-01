/**
 * @module issues.routes
 * @description Express router for Issue management — cursor-based pagination,
 * explainable match analysis, and manual dismissal.
 *
 * Caching strategy
 * ────────────────
 *   issue list page   → Redis 5 min  (key includes cursor + filter params)
 *   match explanation → Redis 1 h    (key = `match-explain:{issueId}`)
 */
import express                   from 'express';
import { param, query }          from 'express-validator';

import { Issue }                 from '../models/Issue.js';
import { Record }                from '../models/Record.js';
import { store }                 from '../data/inMemoryStore.js';
import { getDBStatus }           from '../config/db.js';
import { MatcherService }        from '../services/matcher.service.js';
import { AIClient }              from '../ai/aiClient.js';
import { cache }                 from '../cache/redisClient.js';
import { asyncHandler }          from '../middleware/asyncHandler.js';
import { requireAuth }           from '../middleware/requireAuth.js';
import { validate }              from '../middleware/validate.js';
import logger                    from '../config/logger.js';

const router = express.Router();

// ── GET /api/issues/dataset/:datasetId ───────────────────────────────────
/**
 * Returns a cursor-paginated page of issues for a dataset.
 *
 * Query parameters:
 *   cursor   (string)  – opaque cursor from previous response
 *   limit    (number)  – page size, capped at 50 (default 20)
 *   severity (string)  – filter: critical | high | medium | low
 *   type     (string)  – filter: violation | duplicate | null_defect | …
 *   status   (string)  – filter (default: open)
 */
router.get(
  '/dataset/:datasetId',
  validate([
    param('datasetId').notEmpty().withMessage('datasetId required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const { datasetId }                                  = req.params;
    const { cursor, limit = 20, severity, type, status } = req.query;
    const pageSize = Math.min(50, parseInt(limit, 10));

    const cacheKey = `issues:${datasetId}:${cursor ?? 'start'}:${pageSize}:${severity ?? 'all'}:${type ?? 'all'}:${status ?? 'open'}`;
    const cached   = await cache.get(cacheKey);
    if (cached) {
      logger.debug({ event: 'issues_cache_hit', cacheKey });
      return res.json(cached);
    }

    let allIssues = [];

    if (getDBStatus()) {
      /** @type {Record<string, unknown>} */
      const query = { datasetId };
      if (severity) query.severity     = severity;
      if (type)     query.type         = type;
      if (status && status !== 'all') query.status = status;
      if (cursor)   query._id          = { $gt: cursor };

      allIssues = await Issue
        .find(query)
        .sort({ severity: -1, createdAt: -1, _id: 1 })
        .limit(pageSize + 1)
        .lean();
    } else {
      let filtered = store.issues.filter((i) => String(i.datasetId) === String(datasetId));
      if (severity)                   filtered = filtered.filter((i) => i.severity === severity);
      if (type)                       filtered = filtered.filter((i) => i.type     === type);
      if (status && status !== 'all') filtered = filtered.filter((i) => i.status   === status);

      let startIndex = 0;
      if (cursor) {
        const idx = filtered.findIndex((i) => String(i._id) === String(cursor));
        if (idx !== -1) startIndex = idx + 1;
      }
      allIssues = filtered.slice(startIndex, startIndex + pageSize + 1);
    }

    const hasMore  = allIssues.length > pageSize;
    const pageData = hasMore ? allIssues.slice(0, pageSize) : allIssues;
    const nextCursor = pageData.length > 0
      ? String(pageData[pageData.length - 1]._id)
      : null;

    // BUG 5 FIX: query MongoDB for open count when DB is active — was incorrectly
    // reading store.issues (always empty in MongoDB mode) returning 0 always.
    let totalOpen;
    if (getDBStatus()) {
      totalOpen = await Issue.countDocuments({ datasetId, status: 'open' });
    } else {
      totalOpen = store.issues.filter(
        (i) => String(i.datasetId) === String(datasetId) && i.status === 'open',
      ).length;
    }

    const response = {
      success: true,
      data:    pageData,
      nextCursor,
      hasMore,
      totalOpenCount: totalOpen,
    };

    await cache.set(cacheKey, response, 300); // 5 min TTL
    res.json(response);
  }),
);

// ── GET /api/issues/:id/explain ───────────────────────────────────────────
/**
 * Returns a detailed field-level match explanation for a duplicate issue.
 * For non-duplicate issues it returns the stored explanation text + remediation hint.
 * Results are cached for 1 hour to avoid repeated heavy computation.
 */
router.get(
  '/:id/explain',
  validate([param('id').notEmpty().withMessage('issueId required')]),
  asyncHandler(async (req, res) => {
    const { id }   = req.params;
    const cacheKey = `match-explain:${id}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug({ event: 'explain_cache_hit', issueId: id });
      return res.json({ success: true, data: cached, fromCache: true });
    }

    let issue = null;
    if (getDBStatus()) {
      issue = await Issue.findById(id).lean();
    } else {
      issue = store.issues.find((i) => String(i._id) === String(id));
    }

    if (!issue) return res.status(404).json({ success: false, error: `Issue ${id} not found` });

    let payload = null;

    if (issue.type === 'duplicate' && issue.matchDetails) {
      let recA = null;
      let recB = null;

      if (getDBStatus()) {
        [recA, recB] = await Promise.all([
          Record.findById(issue.recordId).lean(),
          Record.findById(issue.matchDetails.recordIdB).lean(),
        ]);
      } else {
        recA = store.records.find((r) => String(r._id) === String(issue.recordId));
        recB = store.records.find((r) => String(r._id) === String(issue.matchDetails.recordIdB));
      }

      if (recA && recB) {
        const deepMatch          = MatcherService.explainMatch(recA, recB);
        const naturalExplanation = AIClient.generateMatchExplanation(
          deepMatch.fieldBreakdown,
          deepMatch.compositeScore,
        );

        payload = {
          issueId:            String(issue._id),
          type:               'duplicate',
          compositeScore:     deepMatch.compositeScore,
          confidencePercent:  Math.round(deepMatch.compositeScore * 100),
          confidenceLevel:    deepMatch.confidenceLevel,
          naturalExplanation,
          fieldBreakdown:     deepMatch.fieldBreakdown,
          recordA:            recA.data ?? recA,
          recordB:            recB.data ?? recB,
          rowNumberA:         issue.rowNumber,
          rowNumberB:         issue.matchDetails.rowNumberB,
          recommendedAction:
            deepMatch.compositeScore >= 0.88
              ? 'Merge into single Golden Record'
              : 'Route to Human Data Steward for review',
        };
      }
    }

    if (!payload) {
      payload = {
        issueId:        String(issue._id),
        type:           issue.type,
        field:          issue.field,
        currentValue:   issue.currentValue,
        explanation:    issue.explanation,
        severity:       issue.severity,
        recommendation: `Remediate '${issue.field}' value to satisfy data quality rules.`,
      };
    }

    await cache.set(cacheKey, payload, 3_600); // 1 h TTL
    logger.info({ event: 'explain_computed', issueId: id, type: issue.type });
    res.json({ success: true, data: payload, fromCache: false });
  }),
);

// ── POST /api/issues/:id/dismiss ─────────────────────────────────────────
/** Marks a single issue as dismissed (soft-delete). */
router.post(
  '/:id/dismiss',
  requireAuth(),
  validate([param('id').notEmpty().withMessage('issueId required')]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (getDBStatus()) {
      const result = await Issue.findByIdAndUpdate(id, { status: 'dismissed' });
      if (!result) return res.status(404).json({ success: false, error: 'Issue not found' });
    } else {
      const issue = store.issues.find((i) => String(i._id) === String(id));
      if (!issue) return res.status(404).json({ success: false, error: 'Issue not found' });
      issue.status = 'dismissed';
    }

    await cache.delPattern('issues:*');
    logger.info({ event: 'issue_dismissed', issueId: id });
    res.json({ success: true, message: 'Issue dismissed' });
  }),
);

export default router;
