import { AIClient, PIIRedactor } from '../ai/aiClient.js';
import { LearningService }        from './learning.service.js';
import { RuleEngineService }      from './ruleEngine.service.js';
import { ragStore }               from '../ai/ragStore.js';
import {
  buildRemediationGraph,
  shouldUseAgent,
  buildRuleEngineInterface,
}                                 from '../ai/remediationGraph.js';
import { cache }                  from '../cache/redisClient.js';

export class RemediationService {
  /**
   * Generates a remediation action proposal for a flagged issue.
   *
   * Flow:
   * 1. Check confidence gate via `shouldUseAgent`. If ruleEngine is already confident,
   *    uses deterministic rule generation for maximum speed and zero token cost.
   * 2. If confidence is ambiguous or issue is complex, invokes LangGraph with RAG context
   *    retrieval and Execute-Before-Trust verification.
   * 3. Sanitizes PII before processing.
   */
  static async proposeFix(issue, record) {
    const ruleEngineIface = buildRuleEngineInterface(RuleEngineService);
    const sanitized = PIIRedactor.sanitizeRecordForLLM(record, issue.field);

    // If ambiguous or low-confidence, route through LangGraph + RAG state machine
    if (shouldUseAgent(issue, sanitized, ruleEngineIface)) {
      try {
        const graph = await buildRemediationGraph({
          ruleEngineService: RuleEngineService,
          ragStore,
        });

        const threadId = String(issue._id || issue.id || Date.now());
        const graphResult = await graph.invoke(
          { issue, record: sanitized },
          { configurable: { thread_id: threadId } }
        );

        if (graphResult.candidateFix && graphResult.candidateFix.status === 'PROPOSED') {
          const fix = graphResult.candidateFix;
          const cited = fix.citedChunkIds?.length ? ` [Citations: ${fix.citedChunkIds.join(', ')}]` : '';
          return {
            issueId:        issue._id,
            datasetId:      issue.datasetId,
            recordId:       issue.recordId,
            rowNumber:      issue.rowNumber,
            targetField:    issue.field,
            strategy:       fix.strategy || 'agentic_rag_patch',
            proposedFix:    fix.proposedValue,
            agentReasoning: `${fix.rationale || 'Synthesized and validated via LangGraph agent.'}${cited}`,
            confidence:     fix.confidence || 0.90,
            status:         'proposed',
            citedChunkIds:  fix.citedChunkIds || [],
            agentEngine:    'LangGraph + Dual-Tier RAG',
            auditLog: [{
              action:    'PROPOSAL_GENERATED',
              timestamp: new Date(),
              actor:     'GrootAi LangGraph Agent',
              details:   `Synthesized fix via LangGraph RAG with ${(Number(fix.confidence || 0.9) * 100).toFixed(0)}% confidence.${cited}`,
            }],
          };
        }
      } catch (err) {
        console.warn(`[RemediationService] LangGraph execution fallback: ${err.message}`);
      }
    }

    // High-confidence deterministic path (or graceful fallback)
    const calibrationMap = await LearningService.getCalibrationMap();
    const proposal = AIClient.generateRemediationProposal(issue, sanitized, calibrationMap);

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
      agentEngine:    'Deterministic Rule Engine (Calibrated)',
      auditLog: [{
        action:    'PROPOSAL_GENERATED',
        timestamp: new Date(),
        actor:     'GrootAi Remediation Engine',
        details:   `Generated fix proposal using strategy '${proposal.strategy}' with ${(proposal.confidence * 100).toFixed(0)}% confidence (calibrated from human feedback history).`,
      }],
    };
  }

  /**
   * Batch proposes fixes for up to 50 issues in a single operation.
   */
  static async proposeBatchFixes(items) {
    const calibrationMap = await LearningService.getCalibrationMap();
    const batchResults = await AIClient.generateBatchRemediations(items, calibrationMap);

    return batchResults.map(({ issueId, proposal }) => {
      const originalItem = items.find((i) => String(i.issue._id) === String(issueId));
      const issue = originalItem?.issue;
      return {
        issueId:        issue?._id ?? issueId,
        datasetId:      issue?.datasetId,
        recordId:       issue?.recordId,
        rowNumber:      issue?.rowNumber,
        targetField:    proposal.targetField,
        strategy:       proposal.strategy,
        proposedFix:    proposal.proposedFix,
        agentReasoning: proposal.agentReasoning,
        confidence:     proposal.confidence,
        status:         'proposed',
        auditLog: [{
          action:    'PROPOSAL_GENERATED',
          timestamp: new Date(),
          actor:     'GrootAi Batch Remediation Agent',
          details:   `Batch-generated fix proposal using strategy '${proposal.strategy}' with ${(proposal.confidence * 100).toFixed(0)}% confidence.`,
        }],
      };
    });
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
