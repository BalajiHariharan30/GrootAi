/**
 * @module promptTemplates
 * @description Anti-hallucination prompt templates and JSON schemas for remediation.
 * Rules:
 *   1. Use ONLY information in SCHEMA/POLICY CONTEXT and PAST DECISIONS.
 *   2. Must cite exact chunk id(s) relied on in citedChunkIds.
 *   3. If context is insufficient, must set status: "ABSTAIN".
 *   4. Output must conform strictly to PATCH_RESPONSE_SCHEMA.
 */

export const PATCH_SYSTEM_INSTRUCTION = `You are a data remediation assistant for GrootAi enterprise data quality system.

STRICT RULES:
- Use ONLY the information in the "SCHEMA/POLICY CONTEXT" and "PAST DECISIONS" sections below. Never invent field formats, regulations, or conventions that are not present there.
- Every fix you propose must cite the exact chunk id(s) it is grounded in, in the "citedChunkIds" field.
- If the provided context does not give you enough information to propose a confident, specific fix, you MUST set "status" to "ABSTAIN" and leave "proposedValue" empty. Do not guess. Abstaining is the correct and expected behavior when evidence is insufficient — it is not a failure.
- Do not explain your reasoning in prose outside the JSON fields provided.
- Output must strictly conform to the provided JSON schema.`;

/** Hard cap per chunk to keep prompt token budget small. */
const CHUNK_TEXT_LIMIT = 160;
const trim = (text) => text.length > CHUNK_TEXT_LIMIT ? text.slice(0, CHUNK_TEXT_LIMIT) + "…" : text;

export function buildPatchUserPrompt({ issue, record, specChunks, decisionChunks, priorValidationError }) {
  const specSection = specChunks.length
    ? specChunks.map((c) => `[${c.id}] ${trim(c.text)}`).join("\n")
    : "(none retrieved)";

  const decisionSection = decisionChunks.length
    ? decisionChunks.map((c) => `[${c.id}] ${trim(c.text)}`).join("\n")
    : "(none retrieved)";

  const retrySection = priorValidationError
    ? `\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${priorValidationError}\nAdjust your proposed fix to address this specific failure. If you cannot address it with the given context, ABSTAIN.\n`
    : "";

  const rawVal = record?.data?.[issue.field] ?? record?.[issue.field] ?? issue.currentValue;

  return `ISSUE
Field: ${issue.field}
Issue type: ${issue.issueType || issue.type}
Current value: ${JSON.stringify(rawVal)}
Description: ${issue.description || issue.explanation || "(none provided)"}

SCHEMA/POLICY CONTEXT
${specSection}

PAST DECISIONS
${decisionSection}
${retrySection}
Propose a fix for this issue, grounded strictly in the context above.`;
}


export const PATCH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["PROPOSED", "ABSTAIN"] },
    proposedValue: { type: "string" },
    strategy: { type: "string" },
    citedChunkIds: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["status", "citedChunkIds", "confidence"],
};
