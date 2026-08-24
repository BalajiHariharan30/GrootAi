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

    res.json({
      success: true,
      message: 'Rejection recorded in audit trail.',
      data:    remediation,
    });
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
      actions = [...store.remediations].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
    }

    res.json({ success: true, data: actions, total: actions.length });
  }),
);

export default router;
