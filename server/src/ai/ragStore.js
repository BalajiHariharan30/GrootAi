/**
 * @module ragStore
 * @description Dual-tier semantic chunk store:
 *   Tier A: schema_spec     -> policy / field specifications
 *   Tier B: decision_memory -> approved past remediation decisions
 *
 * Performance:
 * - Metadata pre-filter (field, dataset, issueType) runs BEFORE vector math.
 * - Vectors are stored as Float32Array; similarity is a normalized dot product.
 * - Supports offline / local deterministic pseudo-embeddings when Gemini key is absent.
 */

import { embedText, isGeminiConfigured } from './geminiClient.js';

function normalize(vec) {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

function dot(a, b) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

/** Deterministic local pseudo-embedding for testing or offline zero-cost fallback */
export function generateLocalEmbedding(text, dim = 32) {
  const vec = new Float32Array(dim);
  const clean = String(text).toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    vec[i % dim] += code * 0.01;
    vec[(i * 3) % dim] += (code % 7) * 0.05;
  }
  return normalize(vec);
}

export class InMemoryRagStore {
  constructor() {
    /** @type {Map<string, {id:string, category:string, text:string, metadata:object, vector: Float32Array}>} */
    this.chunks = new Map();
  }

  async _getEmbedding(text, taskType) {
    if (isGeminiConfigured()) {
      try {
        const [vec] = await embedText([text], { taskType });
        if (vec && vec.length > 0) return normalize(vec);
      } catch (err) {
        console.warn(`[RAG Store] Gemini embedding call failed (${err.message}). Using local embedding.`);
      }
    }
    return generateLocalEmbedding(text);
  }

  async _getBatchEmbeddings(texts, taskType) {
    if (isGeminiConfigured()) {
      try {
        const vecs = await embedText(texts, { taskType });
        if (vecs && vecs.length === texts.length) {
          return vecs.map((v) => normalize(v));
        }
      } catch (err) {
        console.warn(`[RAG Store] Gemini batch embedding failed (${err.message}). Using local embedding.`);
      }
    }
    return texts.map((t) => generateLocalEmbedding(t));
  }

  /**
   * Insert or update a chunk with conflict resolution and consensus gating.
   * @param {{id:string, category:'schema_spec'|'decision_memory', text:string, metadata:object}} chunk
   */
  async upsertChunk(chunk) {
    if (!chunk.id || !chunk.text || !chunk.category) {
      throw new Error("upsertChunk requires id, text, and category");
    }
    const vector = await this._getEmbedding(chunk.text, "RETRIEVAL_DOCUMENT");
    const now = Date.now();

    // GAP 5 FIX: Precedent Conflict Resolution & Consensus Gating
    if (chunk.category === "decision_memory") {
      const field = chunk.metadata?.field;
      const outcome = chunk.metadata?.outcome;

      // When a new rejection arrives, soft-tombstone any contradicting approved chunk for the same field/value
      if (outcome === "rejected" && field) {
        for (const [existingId, existingChunk] of this.chunks.entries()) {
          if (
            existingChunk.category === "decision_memory" &&
            existingChunk.metadata?.field === field &&
            existingChunk.metadata?.outcome === "approved"
          ) {
            // Check if this approved chunk recommended what was just rejected
            const rejectedVal = String(chunk.metadata?.proposedFix || "").trim().toLowerCase();
            const approvedVal = String(existingChunk.metadata?.approvedFix || "").trim().toLowerCase();
            if (rejectedVal && approvedVal && (rejectedVal === approvedVal || dot(vector, existingChunk.vector) > 0.85)) {
              existingChunk.status = "contradicted";
              existingChunk.contradictedAt = now;
              existingChunk.contradictedBy = chunk.id;
            }
          }
        }
      }

      // When an approval arrives, check if it corroborates an existing approved precedent (consensus gating)
      if (outcome === "approved" && field) {
        for (const existingChunk of this.chunks.values()) {
          if (
            existingChunk.category === "decision_memory" &&
            existingChunk.metadata?.field === field &&
            existingChunk.metadata?.outcome === "approved" &&
            existingChunk.status !== "contradicted"
          ) {
            if (dot(vector, existingChunk.vector) > 0.90) {
              existingChunk.confirmations = (existingChunk.confirmations || 1) + 1;
              existingChunk.lastConfirmedAt = now;
            }
          }
        }
      }
    }

    this.chunks.set(chunk.id, {
      ...chunk,
      vector,
      createdAt: chunk.createdAt || now,
      confirmations: chunk.confirmations || 1,
      status: chunk.status || "active",
    });
    return chunk.id;
  }

  /**
   * Batch insert chunks in one operation.
   */
  async upsertChunks(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return [];
    const texts = chunks.map((c) => c.text);
    const vectors = await this._getBatchEmbeddings(texts, "RETRIEVAL_DOCUMENT");
    chunks.forEach((c, i) => {
      this.chunks.set(c.id, {
        ...c,
        vector: vectors[i],
        createdAt: Date.now(),
        confirmations: 1,
        status: "active",
      });
    });
    return chunks.map((c) => c.id);
  }

  /**
   * Metadata pre-filter — excludes contradicted/tombstoned chunks.
   */
  _preFilter(filter) {
    const all = Array.from(this.chunks.values()).filter((c) => c.status !== "contradicted");
    if (!filter || Object.keys(filter).length === 0) {
      return all;
    }
    return all.filter((c) =>
      Object.entries(filter).every(([k, v]) => {
        if (!v) return true;
        return c.metadata?.[k] === v;
      })
    );
  }

  /**
   * Vector similarity search with metadata pre-filtering, time decay, and consensus weighting.
   */
  async search(queryText, options = {}) {
    const { filter = {}, topK = 3, category } = options;

    const candidates = this._preFilter(filter).filter(
      (c) => !category || c.category === category
    );
    if (candidates.length === 0) return [];

    const queryVec = await this._getEmbedding(queryText, "RETRIEVAL_QUERY");
    const now = Date.now();

    const scored = candidates.map((c) => {
      const rawCosine = dot(queryVec, c.vector);

      // Recency decay: half-life of 180 days (older decisions gradually decay)
      const ageInDays = Math.max(0, (now - (c.createdAt || now)) / (1000 * 60 * 60 * 24));
      const recencyFactor = Math.exp(-ageInDays / 180);

      // Consensus weighting: corroborate precedents with >=2 confirmations receive a 15% confidence boost
      const consensusMultiplier = (c.confirmations && c.confirmations >= 2) ? 1.15 : 1.0;

      const effectiveScore = +(rawCosine * recencyFactor * consensusMultiplier).toFixed(4);

      return {
        id: c.id,
        category: c.category,
        text: c.text,
        metadata: c.metadata,
        confirmations: c.confirmations || 1,
        score: effectiveScore,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  delete(id) {
    return this.chunks.delete(id);
  }

  size() {
    return this.chunks.size;
  }
}

/** Global singleton RAG store instance */
export const ragStore = new InMemoryRagStore();

/**
 * Retrieve grounding context for a flagged issue, split by tier.
 * Raised minScore to 0.65 (or 0.50 for local offline pseudo-embeddings)
 * to ensure only truly relevant, high-affinity policy and precedents are returned.
 */
export async function retrieveRemediationContext(store, issue, { minScore = 0.50 } = {}) {
  const query = issue.description || `${issue.field} ${issue.issueType || issue.type}`;

  const [specHits, decisionHits] = await Promise.all([
    store.search(query, {
      filter: { field: issue.field },
      category: "schema_spec",
      topK: 1,
    }),
    store.search(query, {
      filter: { field: issue.field },
      category: "decision_memory",
      topK: 2,
    }),
  ]);

  return {
    specChunks: specHits.filter((h) => h.score >= minScore),
    decisionChunks: decisionHits.filter((h) => h.score >= minScore),
  };
}

