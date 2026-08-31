/**
 * @module api
 * @description Centralised fetch wrapper for GrootAi.
 * - Safely parses JSON (never throws on empty / non-JSON bodies)
 * - Attaches JWT Authorization header automatically
 * - Returns { ok, status, data } — never throws for network errors
 */

const TOKEN_KEY = 'grootai_jwt';
export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const storeToken     = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken     = () => localStorage.removeItem(TOKEN_KEY);
export const authHeaders    = () => {
  const t = getStoredToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// In production (Vercel), VITE_API_URL points to the Render backend.
// In development (localhost), it falls back to empty string (relative URL).
const BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Safe JSON parse — returns null if body is empty or not valid JSON.
 * @param {Response} res
 */
async function safeJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Core fetch wrapper.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<{ ok: boolean; status: number; data: any }>}
 */
export async function apiFetch(url, opts = {}) {
  try {
    const res  = await fetch(`${BASE}${url}`, {
      credentials: 'include',
      ...opts,
      headers: {
        ...authHeaders(),
        ...(opts.headers ?? {}),
      },
    });
    const data = await safeJson(res);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    // Network failure — return a safe object so callers never crash
    return { ok: false, status: 0, data: { error: err.message ?? 'Network error' } };
  }
}

/** GET helper */
export const apiGet  = (url) => apiFetch(url);

/** POST helper with JSON body */
export const apiPost = (url, body) =>
  apiFetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

/** PATCH helper with JSON body */
export const apiPatch = (url, body) =>
  apiFetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

/** DELETE helper */
export const apiDelete = (url) => apiFetch(url, { method: 'DELETE' });
