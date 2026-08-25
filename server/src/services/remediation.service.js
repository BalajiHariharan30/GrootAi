import { AIClient }        from '../ai/aiClient.js';
import { LearningService } from './learning.service.js';
import { cache }           from '../cache/redisClient.js';

export class RemediationService {
  /**
   * Generates a remediation action proposal for a flagged issue.
   * Fetches the calibration map from LearningService so that AI confidence
   * scores are informed by real historical human approval rates.
   */
  static async proposeFix(issue, record) {
    // Load the live calibration map (cached for 5 min inside LearningService)
    const calibrationMap = await LearningService.getCalibrationMap();

    const proposal = AIClient.generateRemediationProposal(issue, record, calibrationMap);

    return {
      issueId:        issue._id,
      datasetId:      issue.datasetId,
      recordId:       issue.recordId,
      rowNumber:      issue.rowNumber,
      targetField:    proposal.targetField,
      strategy:       proposal.strategy,
      proposedFix:    proposal.proposedFix,
      agentReasoning: proposal.agentReasoning,
      confidence:     proposal.confidence,
      status:         'proposed',
      auditLog: [{
        action:    'PROPOSAL_GENERATED',
        timestamp: new Date(),
        actor:     'GrootAi Remediation Agent',
        details:   `Generated fix proposal using strategy '${proposal.strategy}' with ${(proposal.confidence * 100).toFixed(0)}% confidence (calibrated from human feedback history).`,
      }],
    };
  }

  /**
   * Applies approved remediation patch to the underlying record
   */
  static applyFixToRecord(recordData, proposedFix, strategy, targetField) {
    const updated = { ...recordData };

    if (strategy === 'merge_records') {
      return updated;
    }

    if (targetField && targetField !== 'all') {
      updated[targetField] = proposedFix.afterValue;
    }

    return updated;
  }
}
