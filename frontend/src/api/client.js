/**
 * WebMind API Client
 *
 * Centralized HTTP layer for communicating with the WebMind backend.
 * All backend calls go through this module — components never use fetch() directly.
 *
 * Responsibilities:
 *   - Base URL resolution from VITE_API_BASE_URL
 *   - JSON request/response handling
 *   - Error normalization (network, HTTP, backend errors → ApiError)
 *   - Single place to add auth headers, logging, or retry logic later
 *
 * Usage:
 *   import { checkHealth, ingestUrl, searchChunks, askQuestion } from '../api/client';
 *
 *   const health = await checkHealth();
 *   const result = await ingestUrl('https://example.com');
 *   const search = await searchChunks('what is LVDT?', 5);
 *   const answer = await askQuestion('What does an LVDT measure?');
 */

import { ApiError } from './errors.js';

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

/**
 * Backend API base URL, read once from Vite environment.
 * Falls back to empty string (same-origin) when not set — this is correct
 * when the production frontend is served from the same Express server.
 * In development, set VITE_API_BASE_URL=http://localhost:3000 in frontend/.env.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Core fetch wrapper. Sends a request and normalizes all failure modes
 * into ApiError instances.
 *
 * @param {string} path     — URL path (e.g. '/health')
 * @param {object} [options] — fetch options (method, body, headers, etc.)
 * @returns {Promise<any>}   — Parsed JSON response body on success
 * @throws {ApiError}        — On network failure, non-2xx response, or parse error
 */
async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  const headers = {
    'Accept': 'application/json',
    ...options.headers,
  };

  // Add Content-Type for requests with a body
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (_err) {
    // Network failure — server unreachable, DNS error, CORS blocked, etc.
    throw new ApiError(
      'Unable to connect to the server. Check your connection and try again.',
      'NETWORK_ERROR',
      0,
    );
  }

  // Parse response body (may be JSON or empty)
  let body;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        'Received an invalid response from the server.',
        'PARSE_ERROR',
        response.status,
      );
    }
  } else {
    // Non-JSON response (e.g. HTML error page from a proxy)
    if (!response.ok) {
      throw new ApiError(
        'An unexpected server error occurred.',
        'NON_JSON_ERROR',
        response.status,
      );
    }
    body = null;
  }

  // Handle non-2xx responses with a backend error payload
  // Backend returns: { error: string, code: string, status: number }
  if (!response.ok) {
    throw new ApiError(
      body?.error || `Request failed with status ${response.status}.`,
      body?.code || 'SERVER_ERROR',
      body?.status || response.status,
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

// ── Health ────────────────────────────────────────────────────────────────

/**
 * Check backend and database health.
 *
 * GET /health
 *
 * @returns {Promise<HealthResponse>}
 * @throws {ApiError}
 *
 * @typedef {object} HealthResponse
 * @property {'ok' | 'degraded'} status     — 'ok' or 'degraded'
 * @property {string}            message    — Human-readable status message
 * @property {'connected' | 'disconnected'} database — Database connection status
 * @property {string}            timestamp  — ISO 8601 timestamp
 * @property {string}            [error]    — Present only when status is 'degraded'
 */
export async function checkHealth() {
  return request('/health');
}

// ── Ingestion ─────────────────────────────────────────────────────────────

/**
 * Ingest a webpage URL through the full RAG pipeline:
 * extract → chunk → embed → store in PostgreSQL/pgvector.
 *
 * POST /ingest
 *
 * @param {string} url — Target webpage URL to ingest
 * @returns {Promise<IngestResponse>}
 * @throws {ApiError}
 *
 * @typedef {object} IngestResponse
 * @property {string} source_url      — The URL that was ingested
 * @property {string} title           — Extracted page title
 * @property {number} chunks_created  — Number of chunks stored
 * @property {'success'} status       — Always 'success' on 200
 */
export async function ingestUrl(url) {
  return request('/ingest', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Semantic search over ingested document chunks.
 *
 * POST /search
 *
 * @param {string} query   — Natural-language search query
 * @param {number} [topK=5] — Number of top chunks to retrieve
 * @returns {Promise<SearchResponse>}
 * @throws {ApiError}
 *
 * @typedef {object} SearchResponse
 * @property {string}        query         — The query that was searched
 * @property {number}        topK          — Requested top-K
 * @property {number}        results_count — Number of results returned
 * @property {SearchResult[]} results      — Retrieved chunks, sorted by relevance
 * @property {object}        timings       — Latency breakdown
 * @property {number}        timings.embedding_latency_ms
 * @property {number}        timings.retrieval_latency_ms
 * @property {number}        timings.rerank_latency_ms
 *
 * @typedef {object} SearchResult
 * @property {string} chunk_id         — Unique chunk identifier
 * @property {string} chunk_text       — Full chunk text
 * @property {string} source_url       — Source webpage URL
 * @property {string} page_title       — Source page title
 * @property {number} similarity_score — Cosine similarity (0–1)
 * @property {number} relevance_score  — Cohere rerank score (0–1)
 * @property {number} chunk_index      — Position of chunk in source document
 */
export async function searchChunks(query, topK = 5) {
  return request('/search', {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  });
}

// ── Ask ───────────────────────────────────────────────────────────────────

/**
 * Full RAG pipeline: question → retrieval → rerank → LLM grounded answer.
 *
 * POST /ask
 *
 * Note: When no chunks meet the relevance threshold (similarity < 0.20),
 * the backend returns HTTP 200 with the answer:
 *   "The provided sources do not contain enough information to answer this question."
 * This is NOT an error — render it as a normal response.
 *
 * @param {string} question — Natural-language question
 * @returns {Promise<AskResponse>}
 * @throws {ApiError}
 *
 * @typedef {object} AskResponse
 * @property {string}       answer        — Grounded LLM answer
 * @property {AskSource[]}  sources       — Retrieved source chunks used for the answer
 * @property {object}       timings       — Latency breakdown
 * @property {number}       timings.embedding_latency_ms
 * @property {number}       timings.retrieval_latency_ms
 * @property {number}       timings.rerank_latency_ms
 * @property {number}       timings.context_build_latency_ms
 * @property {number}       timings.generation_latency_ms
 * @property {number}       timings.total_latency_ms
 * @property {object}       usage         — Token usage from the LLM
 * @property {number}       usage.prompt_tokens
 * @property {number}       usage.completion_tokens
 * @property {number}       usage.total_tokens
 * @property {string|null}  finish_reason — LLM finish reason ('stop', etc.)
 *
 * @typedef {object} AskSource
 * @property {string} chunk_id         — Unique chunk identifier
 * @property {string} source_url       — Source webpage URL
 * @property {number} chunk_index      — Position of chunk in source document
 * @property {number} similarity_score — Cosine similarity (0–1)
 * @property {number} relevance_score  — Cohere rerank score (0–1)
 * @property {string} text_preview     — First 150 characters of the chunk text
 */
export async function askQuestion(question) {
  return request('/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}
