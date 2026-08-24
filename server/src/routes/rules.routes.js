/**
 * @module rules.routes
 * @description Express router for Natural-Language → DQ Rule parsing,
 * validation, and lifecycle management.
 *
 * Key design decisions
 * ────────────────────
 * • Input validation via `express-validator` (422 on bad payload)
 * • `asyncHandler` for uniform error propagation — no naked try/catch
 * • In-flight request de-duplication: concurrent identical parse requests
 *   share a single pending AI promise (prevents double-billing)
 * • Redis 24 h cache keyed by SHA-256(nlInput + datasetId + schemaVersion)
 * • `validate([...])` middleware short-circuits before any business logic
 */
import express                    from 'express';
import crypto                     from 'crypto';
import { body, param }            from 'express-validator';

import { Rule }                   from '../models/Rule.js';
import { Dataset }                from '../models/Dataset.js';
import { Record }                 from '../models/Record.js';
import { Issue }                  from '../models/Issue.js';
import { store }                  from '../data/inMemoryStore.js';
import { getDBStatus }            from '../config/db.js';
import { AIClient }               from '../ai/aiClient.js';
import { RuleEngineService }      from '../services/ruleEngine.service.js';
import { cache }                  from '../cache/redisClient.js';
import { asyncHandler }           from '../middleware/asyncHandler.js';
import { validate }               from '../middleware/validate.js';
import logger                     from '../config/logger.js';

const router = express.Router();

// Shared in-flight map keyed by request hash → Promise<candidateRule>
const inFlightRequests = new Map();

// ── POST /api/rules/parse ─────────────────────────────────────────────────
/**
 * Parses a natural-language business rule into a validated structured AST.
 *
 * Flow:
 *  1. Validate payload (422 on error)
 *  2. Fetch active dataset + column schema for grounding
 *  3. Check 24 h Redis cache
 *  4. Deduplicate concurrent identical requests
 *  5. Invoke AI tool-use parser (grounded on real schema)
 *  6. Execute-Before-Trust: validate candidate rule on real sample rows
 *  7. Cache result and return to client
 */
router.post(
  '/parse',
  validate([
    body('naturalLanguageInput')
      .trim()
      .notEmpty()
      .withMessage('naturalLanguageInput must not be empty')
      .isLength({ min: 10, max: 1000 })
      .withMessage('naturalLanguageInput must be between 10 and 1000 characters'),
    body('datasetId')
      .notEmpty()
      .withMessage('datasetId is required'),
  ]),
  asyncHandler(async (req, res) => {
    const { naturalLanguageInput, datasetId } = req.body;

    logger.info({ event: 'rule_parse_request', datasetId, inputLength: naturalLanguageInput.length });

    // 1. Fetch dataset + schema for grounding
    let dataset       = null;
    let sampleRecords = [];

    if (getDBStatus()) {
      dataset       = await Dataset.findById(datasetId);
      sampleRecords = await Record.find({ datasetId }).limit(50).lean();
    } else {
      dataset       = store.datasets.find((d) => String(d._id) === String(datasetId)) ?? store.datasets[0];
      sampleRecords = store.records
        .filter((r) => String(r.datasetId) === String(dataset?._id))
        .slice(0, 50);
    }

    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }

    const columns       = dataset.profile?.columns ?? [];
    const schemaVersion = dataset.profile?.version  ?? 1;

    // 2. Build deterministic cache key
    const hashInput = `${naturalLanguageInput.trim().toLowerCase()}|${datasetId}|v${schemaVersion}`;
    const inputHash = crypto.createHash('sha256').update(hashInput).digest('hex');
    const cacheKey  = `rule-parse:${inputHash}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug({ event: 'rule_parse_cache_hit', cacheKey });
      return res.json({ success: true, data: cached, fromCache: true });
    }

    // 3. In-flight de-duplication
    if (inFlightRequests.has(inputHash)) {
      logger.debug({ event: 'rule_parse_deduped', inputHash });
      const result = await inFlightRequests.get(inputHash);
      return res.json({ success: true, data: result, fromCache: false, deDuped: true });
    }

    const aiPromise = (async () => {
      const parsedAST = await AIClient.parseNLToStructuredRule(naturalLanguageInput, columns);

      // Execute-Before-Trust validation
      const validationSample = RuleEngineService.validateCandidateRule(
        parsedAST.structuredRule,
        sampleRecords,
      );

      const candidateRule = {
        name:                parsedAST.name,
        description:         parsedAST.description,
        category:            parsedAST.category,
        severity:            parsedAST.severity,
        naturalLanguageInput,
        structuredRule:      parsedAST.structuredRule,
        status:              'pending_review',
        validationSample,
      };

      await cache.set(cacheKey, candidateRule, 86_400); // 24 h TTL
      logger.info({ event: 'rule_parse_success', name: parsedAST.name, passRate: validationSample.passRate });
      return candidateRule;
    })();

    inFlightRequests.set(inputHash, aiPromise);
    try {
      const candidateRule = await aiPromise;
      return res.json({ success: true, data: candidateRule, fromCache: false });
    } finally {
      inFlightRequests.delete(inputHash);
    }
  }),
);

// ── POST /api/rules ───────────────────────────────────────────────────────
/** Persists a (possibly pending) rule to storage. */
router.post(
  '/',
  validate([
    body('datasetId').notEmpty().withMessage('datasetId is required'),
    body('structuredRule').notEmpty().withMessage('structuredRule is required'),
  ]),
  asyncHandler(async (req, res) => {
    const {
      datasetId, name, description, category, severity,
      naturalLanguageInput, structuredRule, status = 'pending_review',
      validationSample,
    } = req.body;

    const payload = {
      datasetId,
      name:                name ?? 'Custom Data Quality Rule',
      description:         description ?? '',
      category:            category    ?? 'validity',
      severity:            severity    ?? 'medium',
      naturalLanguageInput,
      structuredRule,
      status,
      validationSample:    validationSample ?? { testedRows: 0, passRate: 100 },
      createdAt:           new Date(),
      updatedAt:           new Date(),
    };

    if (getDBStatus()) {
      const doc = await Rule.create(payload);
      return res.status(201).json({ success: true, data: doc });
    }

    payload._id = store.generateId();
    store.rules.push(payload);
    return res.status(201).json({ success: true, data: payload });
  }),
);

// ── GET /api/rules/dataset/:datasetId ─────────────────────────────────────
/** Lists all rules for a given dataset, newest first. */
router.get(
  '/dataset/:datasetId',
  validate([
    param('datasetId').notEmpty().withMessage('datasetId path param required'),
  ]),
  asyncHandler(async (req, res) => {
    const { datasetId } = req.params;
    let rules;

    if (getDBStatus()) {
      rules = await Rule.find({ datasetId }).sort({ createdAt: -1 }).lean();
    } else {
      rules = store.rules
        .filter((r) => String(r.datasetId) === String(datasetId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json({ success: true, data: rules, total: rules.length });
  }),
);

// ── POST /api/rules/:id/activate ─────────────────────────────────────────
/**
 * Human Confirmation Gate — activates a pending rule and immediately
 * evaluates it across all dataset records, creating Issue documents for
 * every violation found.
 */
router.post(
  '/:id/activate',
  validate([
    param('id').notEmpty().withMessage('Rule id required'),
  ]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    let rule    = null;
    let records = [];

    if (getDBStatus()) {
      rule = await Rule.findById(id);
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

      rule.status = 'active';
      await rule.save();
      records = await Record.find({ datasetId: rule.datasetId }).lean();
    } else {
      rule = store.rules.find((r) => String(r._id) === String(id));
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

      rule.status = 'active';
      records = store.records.filter((r) => String(r.datasetId) === String(rule.datasetId));
    }

    // Immediately evaluate the newly activated rule
    const violations = RuleEngineService.runRuleOnDataset(rule, records);

    if (getDBStatus()) {
      if (violations.length > 0) await Issue.insertMany(violations);
    } else {
      violations.forEach((v) => {
        v._id       = store.generateId();
        v.createdAt = new Date();
        store.issues.push(v);
      });
    }

    await cache.del(`profile:${rule.datasetId}`);
    await cache.delPattern(`records:${rule.datasetId}:*`);

    logger.info({
      event:           'rule_activated',
      ruleId:          String(rule._id),
      ruleName:        rule.name,
      violationsFound: violations.length,
    });

    res.json({
      success:         true,
      message:         `Rule '${rule.name}' activated — ${violations.length} violation(s) found.`,
      violationsCount: violations.length,
      data:            rule,
    });
  }),
);

// ── DELETE /api/rules/:id ─────────────────────────────────────────────────
/** Permanently removes a rule from storage. */
router.delete(
  '/:id',
  validate([param('id').notEmpty()]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (getDBStatus()) {
      const deleted = await Rule.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ success: false, error: 'Rule not found' });
    } else {
      const idx = store.rules.findIndex((r) => String(r._id) === String(id));
      if (idx === -1) return res.status(404).json({ success: false, error: 'Rule not found' });
      store.rules.splice(idx, 1);
    }

    logger.info({ event: 'rule_deleted', ruleId: id });
    res.json({ success: true, message: 'Rule deleted' });
  }),
);

export default router;
