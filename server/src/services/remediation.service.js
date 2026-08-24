import { AIClient } from '../ai/aiClient.js';
import { cache } from '../cache/redisClient.js';

export class RemediationService {
  /**
   * Generates a remediation action proposal for a flagged issue
   */
  static async proposeFix(issue, record) {
    const proposal = AIClient.generateRemediationProposal(issue, record);

    return {
      issueId: issue._id,
      datasetId: issue.datasetId,
      recordId: issue.recordId,
      rowNumber: issue.rowNumber,
      targetField: proposal.targetField,
      strategy: proposal.strategy,
      proposedFix: proposal.proposedFix,
      agentReasoning: proposal.agentReasoning,
      confidence: proposal.confidence,
      status: 'proposed',
      auditLog: [{
        action: 'PROPOSAL_GENERATED',
        timestamp: new Date(),
        actor: 'GrootAi Agent (CLAIRE AI)',
        details: `Generated fix proposal using strategy '${proposal.strategy}' with ${(proposal.confidence * 100).toFixed(0)}% confidence.`
      }]
    };
  }

  /**
   * Applies approved remediation patch to the underlying record
   */
  static applyFixToRecord(recordData, proposedFix, strategy, targetField) {
    const updated = { ...recordData };

    if (strategy === 'merge_records') {
      // In merge, retain most complete values
      return updated;
    }

    if (targetField && targetField !== 'all') {
      updated[targetField] = proposedFix.afterValue;
    }

    return updated;
  }
}
