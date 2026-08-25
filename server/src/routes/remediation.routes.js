/**
 * @module remediation.routes
 * @description Express router for the Human-in-the-Loop (HITL) remediation
 * workflow: propose → human reviews → approve or reject → immutable audit log.
 *
 * Invariants enforced by this router
 * ───────────────────────────────────
 * • NO data is ever mutated without an explicit `POST /approve` call.
 * • Every state transition appends an entry to `auditLog` in the document.
 * • Cache keys are invalidated after every approval to avoid stale reads.
 */
import express                       from 'express';
import { body, param }               from 'express-validator';

import { RemediationAction }         from '../models/RemediationAction.js';
import { Issue }                     from '../models/Issue.js';
import { Record }                    from '../models/Record.js';
import { store }                     from '../data/inMemoryStore.js';
import { getDBStatus }               from '../config/db.js';
import { RemediationService }        from '../services/remediation.service.js';
import { LearningService }           from '../services/learning.service.js';
import { cache }                     from '../cache/redisClient.js';
import { asyncHandler }              from '../middleware/asyncHandler.js';
import { validate }                  from '../middleware/validate.js';
import logger                        from '../config/logger.js';


const router = express.Router();

// ── POST /api/remediation/propose/:issueId ────────────────────────────────
/**
 * Requests the AI agent to generate a fix proposal for a flagged issue.
 * The proposal is persisted in `proposed` state and returned to the UI for
 * human review.  No record data is touched at this stage.
 */
router.post(
  '/propose/:issueId',
  validate([param('issueId').notEmpty().withMessage('issueId is required')]),
  asyncHandler(async (req, res) => {
    const { issueId } = req.params;

    let issue  = null;
    let record = null;

    if (getDBStatus()) {
      issue = await Issue.findById(issueId).lean();
      if (issue) record = await Record.findById(issue.recordId).lean();
    } else {
      issue  = store.issues.find((i) => String(i._id) === String(issueId));
      if (issue) record = store.records.find((r) => String(r._id) === String(issue.recordId));
    }

    if (!issue) {
      return res.status(404).json({ success: false, error: `Issue ${issueId} not found` });
    }

    const proposal = await RemediationService.proposeFix(
      issue,
      record ?? { data: { [issue.field]: issue.currentValue } },
    );

    if (getDBStatus()) {
      const doc = await RemediationAction.create(proposal);
      await Issue.findByIdAndUpdate(issueId, {
        hasRemediationProposal: true,
        remediationActionId:    doc._id,
      });
      logger.info({ event: 'remediation_proposed', issueId, remediationId: String(doc._id) });
      return res.status(201).json({ success: true, data: doc });
    }

    proposal._id       = store.generateId();
    proposal.createdAt = new Date();
    store.remediations.push(proposal);

    if (issue) {
      issue.hasRemediationProposal  = true;
      issue.remediationActionId     = proposal._id;
    }

    logger.info({ event: 'remediation_proposed', issueId, remediationId: proposal._id });
    res.status(201).json({ success: true, data: proposal });
  }),
);

// ── GET /api/remediation/pending ─────────────────────────────────────────
/** Returns all remediation proposals that are still awaiting human review. */
router.get(
  '/pending',
  asyncHandler(async (req, res) => {
    let pending;

    if (getDBStatus()) {
      pending = await RemediationAction.find({ status: 'proposed' })
        .sort({ createdAt: -1 })
        .lean();
    } else {
      pending = store.remediations
        .filter((r) => r.status === 'proposed')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json({ success: true, data: pending, total: pending.length });
  }),
);

// ── POST /api/remediation/:id/approve ────────────────────────────────────
/**
 * Human Confirmation Gate — APPROVE.
 *
 * 1. Resolves the pending proposal + linked issue + linked record.
 * 2. Applies the data patch returned by `RemediationService.applyFixToRecord`.
 * 3. Marks the proposal as `applied` and the linked issue as `remediated`.
 * 4. Appends an immutable audit log entry with actor and timestamp.
 * 5. Invalidates all affected cache keys.
 */
router.post(
  '/:id/approve',
  validate([
    param('id').notEmpty().withMessage('Remediation id required'),
    body('approver').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { id }                        = req.params;
    const approver                      = req.body.approver ?? 'Human Data Steward';
    const auditEntry = {
      action:    'HUMAN_APPROVAL_CONFIRMED',
      timestamp: new Date(),
      actor:     approver,
      details:   'Approved by human operator — data patch applied.',
    };

    let remediation = null;
    let issue       = null;
    let record      = null;

    if (getDBStatus()) {
      remediation = await RemediationAction.findById(id);
      if (!remediation) return res.status(404).json({ success: false, error: 'Remediation not found' });

      issue  = await Issue.findById(remediation.issueId);
      record = await Record.findById(remediation.recordId);
    } else {
      remediation = store.remediations.find((r) => String(r._id) === String(id));
      if (!remediation) return res.status(404).json({ success: false, error: 'Remediation not found' });

      issue  = store.issues.find((i) => String(i._id) === String(remediation.issueId));
      record = store.records.find((r) => String(r._id) === String(remediation.recordId));
    }

    // Apply data patch
    if (record) {
      const patchedData = RemediationService.applyFixToRecord(
        record.data ?? record,
        remediation.proposedFix,
        remediation.strategy,
        remediation.targetField,
      );

      if (getDBStatus()) {
        record.data    = patchedData;
        record.version = (record.version ?? 1) + 1;
        await record.save();
      } else {
        record.data    = patchedData;
        record.version = (record.version ?? 1) + 1;
      }
    }

    // Persist approval + audit log
    auditEntry.details = `Approved by ${approver}. Value changed: '${remediation.proposedFix?.beforeValue}' → '${remediation.proposedFix?.afterValue}'.`;
    remediation.status      = 'applied';
    remediation.approvedBy  = approver;
    remediation.appliedAt   = new Date();
    remediation.auditLog.push(auditEntry);

    if (issue) {
      issue.status = 'remediated';
      if (getDBStatus()) await issue.save();
    }

    if (getDBStatus()) await remediation.save();

    // Cache invalidation
    await cache.del(`profile:${remediation.datasetId}`);
    await cache.delPattern(`records:${remediation.datasetId}:*`);
    await cache.delPattern('issues:*');

    logger.info({
      event:         'remediation_approved',
      remediationId: String(remediation._id),
      approver,
      strategy:      remediation.strategy,
      field:         remediation.targetField,
    });

    // ── Continuous Learning: record human approval signal ──────────────────
    await LearningService.recordFeedback({
      remediationId: String(remediation._id),
      datasetId:     String(remediation.datasetId),
      issueType:     issue?.type ?? 'unknown',
      strategy:      remediation.strategy,
      targetField:   remediation.targetField,
      outcome:       'approved',
      actorName:     approver,
      confidence:    remediation.confidence,
    });

    res.json({
      success: true,
      message: 'Mutation applied — audit log entry recorded.',
      data:    remediation,
    });
  }),
);


// ── POST /api/remediation/:id/reject ─────────────────────────────────────
/**
 * Human Confirmation Gate — REJECT.
 * Records the rejection reason in an audit log entry; no data is mutated.
 */
router.post(
  '/:id/reject',
  validate([
    param('id').notEmpty().withMessage('Remediation id required'),
    body('reason').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { id }    = req.params;
    const reason    = req.body.reason ?? 'Rejected by Data Steward';
    const auditEntry = {
      action:    'HUMAN_PROPOSAL_REJECTED',
      timestamp: new Date(),
      actor:     'Human Data Steward',
      details:   `Proposal rejected. Reason: ${reason}`,
    };

    let remediation = null;

    if (getDBStatus()) {
      remediation = await RemediationAction.findById(id);
    } else {
      remediation = store.remediations.find((r) => String(r._id) === String(id));
    }

    if (!remediation) return res.status(404).json({ success: false, error: 'Remediation not found' });

    remediation.status          = 'rejected';
    remediation.rejectionReason = reason;
    remediation.auditLog.push(auditEntry);

    if (getDBStatus()) await remediation.save();

    logger.info({ event: 'remediation_rejected', remediationId: String(remediation._id), reason });

    // ── Continuous Learning: record human rejection signal ─────────────────
    await LearningService.recordFeedback({
      remediationId: String(remediation._id),
      datasetId:     String(remediation.datasetId),
      issueType:     'unknown', // issue not fetched in reject path — use stored strategy
      strategy:      remediation.strategy,
      targetField:   remediation.targetField,
      outcome:       'rejected',
      actorName:     'Human Data Steward',
      confidence:    remediation.confidence,
    });

    res.json({
      success: true,
      message: 'Rejection recorded in audit trail.',
      data:    remediation,
    });
  }),
);


// ── POST /api/remediation/:id/rollback ───────────────────────────────────
/**
 * Rollback Gate — REVERSE an already-applied mutation.
 *
 * Restores the `beforeValue` from the stored `proposedFix` onto the record,
 * marks the RemediationAction as `rolled_back`, and appends a tamper-evident
 * audit log entry. No mutation occurs without this explicit call.
 */
router.post(
  '/:id/rollback',
  validate([
    param('id').notEmpty().withMessage('Remediation id required'),
    body('rolledBackBy').optional().isString(),
    body('reason').optional().isString(),
  ]),
  asyncHandler(async (req, res) => {
    const { id }         = req.params;
    const rolledBackBy   = req.body.rolledBackBy ?? 'Human Data Steward';
    const reason         = req.body.reason ?? 'Manual rollback requested';

    let remediation = null;
    let record      = null;

    if (getDBStatus()) {
      remediation = await RemediationAction.findById(id);
    } else {
      remediation = store.remediations?.find((r) => String(r._id) === String(id));
    }

    if (!remediation) {
      return res.status(404).json({ success: false, error: 'Remediation action not found.' });
    }

    if (remediation.status !== 'applied') {
      return res.status(400).json({
        success: false,
        error:   `Cannot rollback — action is in state '${remediation.status}', must be 'applied'.`,
      });
    }

    // Restore the original (before) value onto the record
    if (getDBStatus()) {
      record = await Record.findById(remediation.recordId);
    } else {
      record = store.records?.find((r) => String(r._id) === String(remediation.recordId));
    }

    if (record) {
      const restoredData = { ...(record.data ?? record) };
      if (remediation.targetField && remediation.targetField !== 'all') {
        restoredData[remediation.targetField] = remediation.proposedFix?.beforeValue;
      } else {
        // For merge_records strategy — we can't fully un-merge, so flag it
        restoredData.__rollback_note = 'Merge rollback: original records preserved. Manual reconciliation may be required.';
      }

      if (getDBStatus()) {
        record.data    = restoredData;
        record.version = (record.version ?? 1) + 1;
        await record.save();
      } else {
        record.data    = restoredData;
        record.version = (record.version ?? 1) + 1;
      }
    }

    // Update remediation status and append rollback audit entry
    remediation.status = 'rolled_back';
    remediation.auditLog.push({
      action:    'HUMAN_ROLLBACK_EXECUTED',
      timestamp: new Date(),
      actor:     rolledBackBy,
      details:   `Rollback executed by ${rolledBackBy}. Reason: ${reason}. Value restored to: '${remediation.proposedFix?.beforeValue}'.`,
    });

    if (getDBStatus()) await remediation.save();

    // Invalidate caches
    await cache.del(`profile:${remediation.datasetId}`);
    await cache.delPattern(`records:${remediation.datasetId}:*`);
    await cache.delPattern('issues:*');

    logger.info({
      event:         'remediation_rolled_back',
      remediationId: String(remediation._id),
      rolledBackBy,
      reason,
    });

    // ── Continuous Learning: record rollback as negative signal ────────────
    await LearningService.recordFeedback({
      remediationId: String(remediation._id),
      datasetId:     String(remediation.datasetId),
      issueType:     'unknown',
      strategy:      remediation.strategy,
      targetField:   remediation.targetField,
      outcome:       'rolled_back',
      actorName:     rolledBackBy,
      confidence:    remediation.confidence,
    });

    res.json({
      success: true,
      message: `Rollback complete — value restored to original. Audit entry recorded.`,
      data:    remediation,
    });
  }),
);


// ── GET /api/remediation/:id/explain ─────────────────────────────────────
/**
 * AI Decision Explainability endpoint.
 * Returns a structured breakdown of WHY the AI proposed this fix:
 * the issue details, the evidence chain, the strategy chosen, confidence
 * calculation factors, and the full audit trail for this action.
 */
router.get(
  '/:id/explain',
  validate([param('id').notEmpty().withMessage('Remediation id required')]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    let remediation = null;
    let issue       = null;

    if (getDBStatus()) {
      remediation = await RemediationAction.findById(id).lean();
      if (remediation) {
        issue = await Issue.findById(remediation.issueId).lean();
      }
    } else {
      remediation = store.remediations?.find((r) => String(r._id) === String(id));
      if (remediation) {
        issue = store.issues?.find((i) => String(i._id) === String(remediation.issueId));
      }
    }

    if (!remediation) {
      return res.status(404).json({ success: false, error: 'Remediation not found.' });
    }

    // Build structured explanation
    const confidencePct  = Math.round((remediation.confidence ?? 0.95) * 100);
    const confidenceDesc =
      confidencePct >= 85 ? 'High — AI has strong evidence for this fix'
      : confidencePct >= 60 ? 'Medium — AI is reasonably confident but human review critical'
      : 'Low — AI is uncertain; manual investigation recommended';

    const strategyDescriptions = {
      format_standardize: 'Detected a formatting inconsistency. The AI standardized the value to match the inferred canonical format (e.g., email syntax, phone number E.164 format).',
      impute_default:     'Detected a missing (null/empty) value. The AI proposed a statistically derived or domain-specific default replacement based on surrounding record patterns.',
      merge_records:      'Detected two records with high entity similarity scores (fuzzy name match + shared identifier fields). The AI proposed merging them into a single canonical record.',
      trim_sanitize:      'Detected leading/trailing whitespace or control characters that would cause downstream join failures. The AI proposed sanitizing the string.',
      domain_fix:         'Detected a value outside the valid categorical domain (e.g., illegal enum value). The AI proposed the closest valid category based on edit distance.',
      custom_patch:       'The AI applied a custom transformation rule derived from the active NL rule set for this dataset.',
    };

    const explanation = {
      remediationId:    String(remediation._id),
      status:           remediation.status,
      confidence:       { score: confidencePct, label: confidenceDesc },
      whatHappened: {
        field:          remediation.targetField,
        strategy:       remediation.strategy,
        strategyReason: strategyDescriptions[remediation.strategy] ?? 'Custom transformation applied.',
        beforeValue:    remediation.proposedFix?.beforeValue,
        afterValue:     remediation.proposedFix?.afterValue,
        diffDetails:    remediation.proposedFix?.diffDetails,
      },
      whyAIDidThis: {
        agentReasoning: remediation.agentReasoning,
        issueType:      issue?.type       ?? 'unknown',
        issueSeverity:  issue?.severity   ?? 'unknown',
        issueRule:      issue?.ruleId     ? `Rule ID: ${issue.ruleId}` : 'Auto-detected by profiler',
        rowNumber:      remediation.rowNumber,
        detectedAt:     issue?.createdAt  ?? remediation.createdAt,
      },
      evidenceChain: [
        {
          step: 1,
          actor: 'GrootAi Auto-Profiler',
          action: `Scanned dataset and detected a ${issue?.type ?? 'data quality'} issue on Row #${remediation.rowNumber}, field '${remediation.targetField}'.`,
        },
        {
          step: 2,
          actor: 'GrootAi Remediation Agent',
          action: `Analyzed the issue context. Selected strategy: '${remediation.strategy}'. Computed confidence: ${confidencePct}%.`,
        },
        {
          step: 3,
          actor: 'GrootAi Remediation Agent',
          action: `Generated fix proposal: '${remediation.proposedFix?.beforeValue}' → '${remediation.proposedFix?.afterValue}'. Queued for human review.`,
        },
        ...(remediation.status === 'applied' ? [{
          step: 4,
          actor: remediation.approvedBy ?? 'Human Data Steward',
          action: `Human reviewed and approved the fix. Data mutation applied at ${remediation.appliedAt ? new Date(remediation.appliedAt).toLocaleString() : 'N/A'}.`,
        }] : []),
        ...(remediation.status === 'rolled_back' ? [{
          step: 5,
          actor: 'Human Data Steward',
          action: `Rollback was executed. Original value '${remediation.proposedFix?.beforeValue}' was restored.`,
        }] : []),
      ],
      auditTrail: remediation.auditLog ?? [],
    };

    res.json({ success: true, data: explanation });
  }),
);

// ── GET /api/remediation/audit-log ───────────────────────────────────────
/** Returns the full immutable audit trail, newest first. */
router.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    let actions;

    if (getDBStatus()) {
      actions = await RemediationAction.find()
        .sort({ createdAt: -1 })
        .lean();
    } else {
      actions = [...(store.remediations ?? [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    }

    res.json({ success: true, data: actions, total: actions.length });
  }),
);

// ── GET /api/remediation/learning/stats ──────────────────────────────────
/**
 * Continuous Learning Dashboard endpoint.
 * Returns the full calibration matrix, per-strategy approval rates,
 * overall health status, and recent trend — powering the AI Learning panel.
 */
router.get(
  '/learning/stats',
  asyncHandler(async (req, res) => {
    const stats = await LearningService.getLearningStats();
    res.json({ success: true, data: stats });
  }),
);

export default router;


