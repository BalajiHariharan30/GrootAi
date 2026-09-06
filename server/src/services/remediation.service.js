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
    const calibrationMap = await LearningService.getCalibrationMap();
    const ruleEngineIface = buildRuleEngineInterface(RuleEngineService, calibrationMap);
    const sanitized = PIIRedactor.sanitizeRecordForLLM(record, issue.field);

    // If ambiguous or calibrated confidence is low (< 0.85), route through LangGraph + RAG state machine
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

    // High-confidence deterministic path (calibrated)
    const proposal = AIClient.generateRemediationProposal(issue, sanitized, calibrationMap);

    // GAP 2 FIX: 5% Canary Spot-Check
    // Randomly select 5% of high-confidence fast-path proposals for explicit audit flagging
    const isCanary = Math.random() < 0.05;
    const canaryNote = isCanary
      ? ' [CANARY SPOT-CHECK: Selected for empirical quality audit]'
      : '';

    return {
      issueId:        issue._id,
      datasetId:      issue.datasetId,
      recordId:       issue.recordId,
      rowNumber:      issue.rowNumber,
      targetField:    proposal.targetField,
      strategy:       proposal.strategy,
      proposedFix:    proposal.proposedFix,
      agentReasoning: `${proposal.agentReasoning}${canaryNote}`,
      confidence:     proposal.confidence,
      status:         'proposed',
      isCanarySpotCheck: isCanary,
      agentEngine:    isCanary
        ? 'Deterministic Rule Engine (Canary Spot-Check Audit)'
        : 'Deterministic Rule Engine (Calibrated)',
      auditLog: [{
        action:    isCanary ? 'CANARY_SPOT_CHECK_QUEUED' : 'PROPOSAL_GENERATED',
        timestamp: new Date(),
        actor:     'GrootAi Remediation Engine',
        details:   `Generated fix proposal using strategy '${proposal.strategy}' with ${(proposal.confidence * 100).toFixed(0)}% confidence (empirically calibrated).${canaryNote}`,
      }],
    };
  }


  /**
   * Batch proposes fixes for up to 50 issues in a single operation.
   * Routes each issue through proposeFix() (confidence gate -> LangGraph + RAG -> AST fallback)
   * with a concurrency pool of 5 to protect LLM rate limits and token budgets.
   */
  static async proposeBatchFixes(items) {
    const CONCURRENCY = 5;
    const results = [];

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      const chunkProposals = await Promise.all(
        chunk.map(async ({ issue, record }) => {
          try {
            return await this.proposeFix(issue, record);
          } catch (err) {
            // Deterministic AST fallback if agent fails
            const calibrationMap = await LearningService.getCalibrationMap();
            const fallback = await AIClient.generateRemediationProposal(issue, record, calibrationMap);
            return {
              issueId:        issue._id,
              datasetId:      issue.datasetId,
              recordId:       issue.recordId,
              rowNumber:      issue.rowNumber,
              targetField:    fallback.targetField,
              strategy:       fallback.strategy,
              proposedFix:    fallback.proposedFix,
              agentReasoning: fallback.agentReasoning,
              confidence:     fallback.confidence,
              status:         'proposed',
              auditLog: [{
                action:    'PROPOSAL_GENERATED',
                timestamp: new Date(),
                actor:     'GrootAi AST Fallback Agent',
                details:   `Batch fallback proposal: ${fallback.strategy}`,
              }],
            };
          }
        })
      );
      results.push(...chunkProposals);
    }

    return results;
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
