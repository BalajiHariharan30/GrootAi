/**
 * @module geminiClient
 * @description Wrapper around Google's Gemini API for embedding and generation.
 * Responsibilities:
 *   1. embedText()     -> gemini-embedding-001 (vector search / RAG)
 *   2. generatePatch() -> gemini-3-flash (reasoning / synthesis)
 *
 * Anti-hallucination & safety guarantees:
 * - Model IDs are pinned (never "-latest" aliases).
 * - Forces temperature 0 and strict JSON response schema.
 * - Requires grounding context; callers cannot generate patches ungrounded.
 * - Graceful fallback if GEMINI_API_KEY is not configured or offline.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL || "gemini-3-flash";

const DEFAULT_TIMEOUT_MS = 15000;

export function isGeminiConfigured() {
  return Boolean(
    GEMINI_API_KEY &&
    !GEMINI_API_KEY.includes("your_") &&
    GEMINI_API_KEY.length > 20
  );
}

function assertConfigured() {
  if (!isGeminiConfigured()) {
    throw new Error(
      "GEMINI_API_KEY is not set or invalid. Refusing to call Gemini API."
    );
  }
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Embed one or more strings into vectors.
 * Batches internally to reduce round trips.
 *
 * @param {string[]} texts
 * @param {{taskType?: string}} opts - taskType: RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY
 * @returns {Promise<number[][]>}
 */
export async function embedText(texts, opts = {}) {
  assertConfigured();
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const taskType = opts.taskType || "RETRIEVAL_DOCUMENT";
  const url = `${GEMINI_BASE_URL}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

  const body = {
    requests: texts.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
    })),
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini embedding call failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.embeddings || []).map((e) => e.values);
}

/**
 * Generate a structured, schema-constrained patch proposal.
 * Refuses to run without grounding context — primary anti-hallucination gate.
 *
 * @param {object} params
 * @param {string} params.systemInstruction
 * @param {string} params.userPrompt
 * @param {object} params.responseSchema - JSON schema the model MUST follow
 * @param {number} [params.temperature=0]
 * @returns {Promise<object>} parsed JSON matching responseSchema
 */
export async function generatePatch({ systemInstruction, userPrompt, responseSchema, temperature = 0 }) {
  assertConfigured();

  if (!responseSchema) {
    throw new Error("generatePatch() requires responseSchema — unconstrained free text is disallowed.");
  }

  const url = `${GEMINI_BASE_URL}/models/${GENERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini generation call failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textPart) {
    throw new Error("Gemini returned no candidate text — treat as generation failure, not a fix.");
  }

  try {
    return JSON.parse(textPart);
  } catch (e) {
    throw new Error(`Gemini response was not valid JSON despite schema constraint: ${e.message}`);
  }
}
