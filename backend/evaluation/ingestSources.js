/**
 * ingestSources.js
 *
 * Ingests the five canonical evaluation source pages via the existing
 * POST /ingest API. Does not duplicate ingestion logic.
 *
 * WARNING: Re-ingestion replaces existing chunks for each URL. Chunk IDs
 * are {url}#chunk-{index} and can shift if Wikipedia content or chunking
 * output changes. After re-ingestion, validate gold relevantChunkIds in
 * evaluation/dataset.json before treating Recall@5 as comparable to a
 * previous baseline.
 *
 * Prerequisites:
 *   Server must be running (npm run dev / npm start)
 *
 * Usage (from backend/):
 *   npm run eval:ingest
 *   node evaluation/ingestSources.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.join(__dirname, 'dataset.json');
const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;
const INGEST_TIMEOUT_MS = 180000;

function sanitizeError(message) {
  if (!message) return null;
  return String(message)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|password|secret|authorization)([=:\s]+)\S+/gi, '$1$2[redacted]');
}

async function ingestUrl(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = { error: 'Response was not valid JSON' };
    }
    return { ok: response.ok, status: response.status, data, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const timedOut = err.name === 'AbortError' || err.name === 'TimeoutError';
    return {
      ok: false,
      status: null,
      data: null,
      latencyMs,
      error: timedOut
        ? `Ingest timed out after ${INGEST_TIMEOUT_MS}ms`
        : sanitizeError(err.message),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('\nWebMind — Evaluation source ingestion');
  console.log('=====================================');
  console.log('\nWARNING: Re-ingestion deletes and recreates chunks for each URL.');
  console.log('         Gold relevantChunkIds in evaluation/dataset.json may become invalid.');
  console.log('         Validate chunk IDs after this command before running npm run eval.\n');
  console.log(`Server: ${BASE_URL}`);
  console.log(`Dataset: ${DATASET_PATH}\n`);

  const dataset = JSON.parse(await readFile(DATASET_PATH, 'utf-8'));
  const sources = dataset.sources || [];

  if (sources.length === 0) {
    console.error('[ERROR] No sources found in evaluation/dataset.json');
    process.exit(1);
  }

  const results = [];
  let failed = 0;

  for (const source of sources) {
    console.log(`[${source.id}] POST /ingest ${source.url}`);
    const result = await ingestUrl(source.url);
    results.push({
      id: source.id,
      url: source.url,
      ok: result.ok,
      httpStatus: result.status,
      chunksCreated: result.data?.chunks_created ?? null,
      title: result.data?.title ?? null,
      latencyMs: result.latencyMs,
      error: result.error || (result.ok ? null : sanitizeError(result.data?.error || `HTTP ${result.status}`)),
    });

    if (result.ok) {
      console.log(`  OK  chunks=${result.data?.chunks_created}  ${result.latencyMs}ms`);
    } else {
      failed += 1;
      console.error(`  FAIL  ${results[results.length - 1].error}`);
    }
  }

  console.log('\nSummary');
  console.log(`  Sources: ${sources.length}`);
  console.log(`  Succeeded: ${sources.length - failed}`);
  console.log(`  Failed: ${failed}`);
  console.log('\nNext: validate relevantChunkIds if this was a re-ingest, then run: npm run eval\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[FATAL]', sanitizeError(err.message));
  process.exit(1);
});
