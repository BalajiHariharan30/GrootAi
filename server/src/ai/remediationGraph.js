/**
 * @module remediationGraph
 * @description LangGraph.js state machine implementing the 5-node remediation flow.
 *
 * Performance:
 * - shouldUseAgent() gate: only invoked when deterministic confidence is low.
 * - Node 3 (verify) is 100% deterministic using ruleEngine.service.js.
 *
 * Anti-hallucination:
 * - Refuses to call LLM if RAG retrieval has no grounding chunks (ABSTAIN_NO_GROUNDING).
 * - verifyCitations(): cross-checks all citedChunkIds against actual retrieved context.
 * - verifyPatch(): independently verifies proposed value against rule engine syntax.
 * - Bounded retries (MAX_RETRIES) with failure feedback injected into retry prompt.
 *
 * Persistence:
 * - Uses MemorySaver (or MongoDBSaver) for safe interrupt() state checkpointing.
 */

import { StateGraph, Annotation, interrupt, START, END } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { generatePatch, isGeminiConfigured } from "./geminiClient.js";
import { retrieveRemediationContext } from "./ragStore.js";
import {
  PATCH_SYSTEM_INSTRUCTION,
  buildPatchUserPrompt,
  PATCH_RESPONSE_SCHEMA,
} from "./promptTemplates.js";

export const MAX_RETRIES = 2;
export const MIN_RAG_SCORE = 0.45;
export const AGENT_CONFIDENCE_THRESHOLD = 0.85;

export const RemediationState = Annotation.Root({
  issue: Annotation({ reducer: (_, b) => b }),
  record: Annotation({ reducer: (_, b) => b }),
  ragContext: Annotation({ reducer: (_, b) => b, default: () => ({ specChunks: [], decisionChunks: [] }) }),
  candidateFix: Annotation({ reducer: (_, b) => b, default: () => null }),
  validationResult: Annotation({ reducer: (_, b) => b, default: () => null }),
  retryCount: Annotation({ reducer: (_, b) => b, default: () => 0 }),
  status: Annotation({ reducer: (_, b) => b, default: () => "PENDING" }),
});

/**
 * Wire this to real deterministic engine.
 */
export function buildRuleEngineInterface(ruleEngineService) {
  return {
    getConfidence: (issue, record) => ruleEngineService.getConfidence(issue, record),
    validatePatch: (issue, record, proposedValue) =>
      ruleEngineService.validatePatch(issue, record, proposedValue),
  };
}

/** Gate: should this issue even be routed through the LLM+RAG graph? */
export function shouldUseAgent(issue, record, ruleEngineIface, { confidenceThreshold = AGENT_CONFIDENCE_THRESHOLD } = {}) {
  const confidence = ruleEngineIface.getConfidence(issue, record);
  return confidence < confidenceThreshold;
}

export function verifyCitations(citedChunkIds, ragContext) {
  const validIds = new Set([
    ...(ragContext?.specChunks || []).map((c) => c.id),
    ...(ragContext?.decisionChunks || []).map((c) => c.id),
  ]);
  const bad = (citedChunkIds || []).filter((id) => !validIds.has(id));
  return { ok: bad.length === 0, invalidIds: bad };
}

export async function buildRemediationGraph({ ruleEngineService, ragStore, onCommit, checkpointer }) {
  const ruleEngineIface = buildRuleEngineInterface(ruleEngineService);

  // --- Node 1: RAG Context Retrieval ---
  async function retrieveContext(state) {
    const ragContext = await retrieveRemediationContext(ragStore, state.issue, {
      minScore: MIN_RAG_SCORE,
    });

    const hasGrounding =
      ragContext.specChunks.length > 0 || ragContext.decisionChunks.length > 0;

    return {
      ragContext,
      status: hasGrounding ? "CONTEXT_READY" : "ABSTAIN_NO_GROUNDING",
    };
  }

  // --- Node 2: Patch Synthesis ---
  async function synthesizePatch(state) {
    if (state.status === "ABSTAIN_NO_GROUNDING") {
      return { candidateFix: { status: "ABSTAIN", rationale: "No grounding context retrieved above threshold." }, status: "ABSTAINED" };
    }

    const priorValidationError = state.validationResult?.error;

    // If Gemini is not configured, synthesize deterministically using RAG context
    if (!isGeminiConfigured()) {
      const topDecision = state.ragContext.decisionChunks[0];
      const topSpec = state.ragContext.specChunks[0];

      if (topDecision && topDecision.metadata?.approvedFix) {
        return {
          candidateFix: {
            status: "PROPOSED",
            proposedValue: topDecision.metadata.approvedFix,
            strategy: topDecision.metadata.strategy || "rag_precedent",
            citedChunkIds: [topDecision.id],
            confidence: 0.90,
            rationale: `Grounded in past approved steward decision [${topDecision.id}].`,
          },
          status: "SYNTHESIZED",
        };
      }

      if (topSpec) {
        const raw = state.record?.data?.[state.issue.field] ?? state.record?.[state.issue.field] ?? state.issue.currentValue;
        let fixVal = String(raw);
        if (state.issue.field === "phone" && !fixVal.startsWith("+")) {
          fixVal = `+91 ${fixVal.trim()}`;
        }
        return {
          candidateFix: {
            status: "PROPOSED",
            proposedValue: fixVal,
            strategy: "spec_grounded_format",
            citedChunkIds: [topSpec.id],
            confidence: 0.88,
            rationale: `Grounded in schema policy specification [${topSpec.id}].`,
          },
          status: "SYNTHESIZED",
        };
      }

      return { candidateFix: { status: "ABSTAIN", rationale: "Insufficient evidence to synthesize fix without LLM." }, status: "ABSTAINED" };
    }

    const userPrompt = buildPatchUserPrompt({
      issue: state.issue,
      record: state.record,
      specChunks: state.ragContext.specChunks,
      decisionChunks: state.ragContext.decisionChunks,
      priorValidationError,
    });

    try {
      const result = await generatePatch({
        systemInstruction: PATCH_SYSTEM_INSTRUCTION,
        userPrompt,
        responseSchema: PATCH_RESPONSE_SCHEMA,
        temperature: 0,
      });

      if (result.status === "ABSTAIN") {
        return { candidateFix: result, status: "ABSTAINED" };
      }

      const citationCheck = verifyCitations(result.citedChunkIds, state.ragContext);
      if (!citationCheck.ok) {
        return {
          candidateFix: result,
          validationResult: {
            valid: false,
            error: `Cited chunk id(s) not found in retrieved context: ${citationCheck.invalidIds.join(", ")}. Only cite ids that were actually provided.`,
          },
          status: "CITATION_INVALID",
        };
      }

      return { candidateFix: result, status: "SYNTHESIZED" };
    } catch (err) {
      return {
        candidateFix: { status: "ABSTAIN", rationale: `Synthesis error: ${err.message}` },
        status: "ABSTAINED",
      };
    }
  }

  // --- Node 3: Execute-Before-Trust Verification ---
  async function verifyPatch(state) {
    if (state.status === "ABSTAINED") {
      return { validationResult: { valid: false, error: "Model abstained" }, status: "ABSTAINED" };
    }

    const result = ruleEngineIface.validatePatch(
      state.issue,
      state.record,
      state.candidateFix?.proposedValue
    );

    return {
      validationResult: result,
      status: result.valid ? "VALIDATED" : "VALIDATION_FAILED",
    };
  }

  // --- Routing after verification: retry, abstain, or proceed ---
  function routeAfterVerify(state) {
    if (state.status === "VALIDATED") return "stewardGate";
    if (state.status === "ABSTAINED") return "stewardGate";
    if (state.retryCount >= MAX_RETRIES) return "stewardGate";
    return "incrementRetry";
  }

  function incrementRetry(state) {
    return { retryCount: state.retryCount + 1, status: "RETRYING" };
  }

  // --- Node 4: Human-in-the-Loop Steward Gate ---
  async function stewardGate(state) {
    // Check if running in headless/mock test mode or live interactive mode
    if (typeof interrupt === "function") {
      const decision = interrupt({
        issue: state.issue,
        candidateFix: state.candidateFix,
        validationResult: state.validationResult,
        ragContext: state.ragContext,
        retryCount: state.retryCount,
      });
      return { status: decision?.approved ? "APPROVED" : "REJECTED" };
    }
    return { status: "STAGED_FOR_STEWARD" };
  }

  // --- Node 5: Commit & Vector Memorization ---
  async function commitAndMemorize(state) {
    if (state.status !== "APPROVED") {
      return { status: state.status };
    }

    if (onCommit && typeof onCommit === "function") {
      await onCommit(state.issue, state.record, state.candidateFix);
    }

    const rawVal = state.record?.data?.[state.issue.field] ?? state.record?.[state.issue.field] ?? state.issue.currentValue;

    const decisionChunk = {
      id: `decision_${state.issue.field}_${Date.now()}`,
      category: "decision_memory",
      text: `Issue: ${state.issue.issueType || state.issue.type} on field '${state.issue.field}' with raw value '${JSON.stringify(rawVal)}'. Strategy: ${state.candidateFix?.strategy}. Approved Fix: '${state.candidateFix?.proposedValue}'.`,
      metadata: {
        field: state.issue.field,
        issueType: state.issue.issueType || state.issue.type,
        strategy: state.candidateFix?.strategy,
        approvedFix: state.candidateFix?.proposedValue,
        outcome: "approved",
      },
    };

    if (ragStore && typeof ragStore.upsertChunk === "function") {
      await ragStore.upsertChunk(decisionChunk);
    }

    return { status: "COMMITTED" };
  }

  const graph = new StateGraph(RemediationState)
    .addNode("retrieveContext", retrieveContext)
    .addNode("synthesizePatch", synthesizePatch)
    .addNode("verifyPatch", verifyPatch)
    .addNode("incrementRetry", incrementRetry)
    .addNode("stewardGate", stewardGate)
    .addNode("commitAndMemorize", commitAndMemorize)
    .addEdge(START, "retrieveContext")
    .addEdge("retrieveContext", "synthesizePatch")
    .addEdge("synthesizePatch", "verifyPatch")
    .addConditionalEdges("verifyPatch", routeAfterVerify, {
      incrementRetry: "incrementRetry",
      stewardGate: "stewardGate",
    })
    .addEdge("incrementRetry", "synthesizePatch")
    .addEdge("stewardGate", "commitAndMemorize")
    .addEdge("commitAndMemorize", END);

  // Prefer persistent MongoDBSaver so state survives server restarts.
  // Falls back to MemorySaver for local dev or if MongoDB isn't available.
  let activeCheckpointer = checkpointer;
  if (!activeCheckpointer) {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      try {
        activeCheckpointer = await MongoDBSaver.fromConnString(mongoUri, {
          dbName: "grootai",
          collectionName: "langgraph_checkpoints",
        });
      } catch (err) {
        console.warn(`[LangGraph] MongoDBSaver init failed (${err.message}). Falling back to MemorySaver.`);
        activeCheckpointer = new MemorySaver();
      }
    } else {
      activeCheckpointer = new MemorySaver();
    }
  }

  return graph.compile({ checkpointer: activeCheckpointer });
}

