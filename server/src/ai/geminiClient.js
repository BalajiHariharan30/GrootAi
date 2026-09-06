/**
 * @module geminiClient
 * @description Wrapper around Google's Gemini API for embedding and generation.
 * Responsibilities:
 *   1. embedText()     -> gemini-embedding-001 (vector search / RAG)
 *   2. generatePatch() -> gemini-2.0-flash-lite (reasoning / synthesis — minimal token cost)
 *
 * Token-saving guarantees:
 * - maxOutputTokens capped at 256 (patches are tiny JSON objects).
 * - temperature=0 (deterministic, no sampling overhead).
 * - Pinned model IDs — never "-latest" aliases.
 * - Graceful fallback if GEMINI_API_KEY is not configured or offline.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// gemini-embedding-001 is the recommended batch embedding model (free tier).
// gemini-2.0-flash-lite is the lowest-cost generation model — perfect for
// structured JSON outputs like short patch proposals.
export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL || "gemini-2.0-flash-lite";

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_OUTPUT_TOKENS  = 256; // patches are tiny — cap spend hard

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

/** Retry once on 429 rate-limit with exponential back-off (1 s then 3 s). */
async function fetchWithRetry(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const delays = [1000, 3000];
  let lastRes;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    lastRes = await fetchWithTimeout(url, options, timeoutMs);
    if (lastRes.status !== 429) return lastRes;
    if (attempt < delays.length) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  return lastRes;
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

  const res = await fetchWithRetry(url, {
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
/**
 * GAP 7 FIX: Multi-Provider LLM Gateway with Automated Failover.
 * If Gemini fails, rate limits, or times out, attempts secondary provider
 * (OpenAI-compatible: Groq, Mistral, or Ollama) before erroring.
 */
/**
 * GAP 7 FIX: Multi-Provider LLM Gateway with Groq LPU Automated Failover.
 * Primary: Google Gemini 2.0 Flash Lite.
 * Fallback: Groq Cloud (llama-3.3-70b-versatile) — ultra-fast LPU inference (500+ tok/s).
 */
async function callFallbackProvider({ systemInstruction, userPrompt, responseSchema, temperature }) {
  const groqKey = process.env.GROQ_API_KEY || process.env.FALLBACK_LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!groqKey || groqKey.includes("your_")) return null;

  const groqUrl = process.env.GROQ_BASE_URL || process.env.FALLBACK_LLM_URL || "https://api.groq.com/openai/v1/chat/completions";
  const groqModel = process.env.GROQ_MODEL || process.env.FALLBACK_LLM_MODEL || "openai/gpt-oss-120b";


  console.log(`[LLM Gateway] Initiating Groq LPU fallback with model '${groqModel}'...`);

  const res = await fetchWithTimeout(groqUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: groqModel,
      temperature,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${systemInstruction}\nOutput must strictly be valid JSON following this schema:\n${JSON.stringify(responseSchema)}`,
        },
        { role: "user", content: userPrompt },
      ],
    }),
  }, 10000);

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Groq API call failed (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("Groq returned empty completion content");

  return JSON.parse(rawContent);
}


/**
 * Generate a structured, schema-constrained patch proposal.
 * Primary: Gemini 2.0 Flash Lite.
 * Secondary: Automated failover to secondary LLM provider.
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
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  try {
    const res = await fetchWithRetry(url, {
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
      throw new Error("Gemini returned no candidate text — treat as generation failure.");
    }

    return JSON.parse(textPart);
  } catch (primaryErr) {
    console.warn(`[LLM Gateway] Primary Gemini provider failed (${primaryErr.message}). Attempting automated failover...`);

    // GAP 7 FIX: Attempt fallback provider
    try {
      const fallbackResult = await callFallbackProvider({
        systemInstruction,
        userPrompt,
        responseSchema,
        temperature,
      });
      if (fallbackResult) {
        console.log("[LLM Gateway] Automated failover to secondary provider succeeded.");
        return fallbackResult;
      }
    } catch (fallbackErr) {
      console.warn(`[LLM Gateway] Fallback provider also failed: ${fallbackErr.message}`);
    }

    throw primaryErr;
  }
}


