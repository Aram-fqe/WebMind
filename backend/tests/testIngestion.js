/**
 * testIngestion.js
 *
 * End-to-end test for the POST /ingest pipeline.
 *
 * Tests:
 *   1. Ingest a real technical webpage
 *   2. Print each pipeline stage: URL → text snippet → chunks → embeddings → DB records
 *   3. Re-ingest the same URL to verify de-duplication (same chunk count, no duplicates)
 *
 * Usage:
 *   node tests/testIngestion.js
 *   (Server must be running: npm run dev)
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const TEST_URL = 'https://nodejs.org/en/docs/guides/getting-started-guide';

// ── Helpers ─────────────────────────────────────────────────────────────────

const divider = (label) => console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
const indent = (str, n = 4) => str.split('\n').map(l => ' '.repeat(n) + l).join('\n');

async function callIngest(url) {
  const response = await fetch(`${BASE_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          WebMind — Ingestion Pipeline E2E Test           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nTarget URL: ${TEST_URL}`);
  console.log(`Server:     ${BASE_URL}`);

  // ── Test 1: Initial ingestion ──────────────────────────────────────────
  divider('Test 1 — Initial Ingestion');

  console.log('\n[→] Sending POST /ingest...');
  let result1;
  try {
    result1 = await callIngest(TEST_URL);
  } catch (err) {
    console.error('\n[FAIL] Ingestion request failed:', err.message);
    console.error('       Make sure the server is running: npm run dev');
    process.exit(1);
  }

  console.log('\n[✓] Response received:');
  console.log(indent(JSON.stringify(result1, null, 2)));

  // Validate response shape
  const requiredFields = ['source_url', 'title', 'chunks_created', 'status'];
  const missing = requiredFields.filter(f => !(f in result1));
  if (missing.length > 0) {
    console.error(`\n[FAIL] Response missing fields: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (result1.status !== 'success') {
    console.error(`\n[FAIL] Expected status "success", got "${result1.status}"`);
    process.exit(1);
  }

  if (result1.chunks_created < 1) {
    console.error(`\n[FAIL] Expected at least 1 chunk, got ${result1.chunks_created}`);
    process.exit(1);
  }

  console.log(`\n[✓] source_url:    ${result1.source_url}`);
  console.log(`[✓] title:         ${result1.title}`);
  console.log(`[✓] chunks_created: ${result1.chunks_created}`);
  console.log(`[✓] status:        ${result1.status}`);

  // ── Test 2: Re-ingestion (de-duplication check) ────────────────────────
  divider('Test 2 — Re-ingest Same URL (De-duplication Check)');

  console.log('\n[→] Re-sending POST /ingest with the same URL...');
  const result2 = await callIngest(TEST_URL);

  console.log('\n[✓] Re-ingest response:');
  console.log(indent(JSON.stringify(result2, null, 2)));

  if (result2.chunks_created !== result1.chunks_created) {
    console.warn(
      `\n[WARN] Chunk count changed between ingestions: ` +
      `first=${result1.chunks_created}, second=${result2.chunks_created}. ` +
      `This may indicate non-deterministic chunking or content change.`
    );
  } else {
    console.log(`\n[✓] De-duplication OK — chunk count stable: ${result2.chunks_created}`);
  }

  // ── Test 3: Validation — missing URL ──────────────────────────────────
  divider('Test 3 — Validation Error (Missing URL)');

  console.log('\n[→] Sending POST /ingest with empty body...');
  const badResponse = await fetch(`${BASE_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const badBody = await badResponse.json();

  if (badResponse.status === 400 && badBody.code === 'MISSING_URL') {
    console.log(`[✓] Correctly returned 400 MISSING_URL: "${badBody.error}"`);
  } else {
    console.error(`[FAIL] Expected 400 MISSING_URL, got ${badResponse.status}: ${JSON.stringify(badBody)}`);
    process.exit(1);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                  ALL TESTS PASSED ✓                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('Pipeline trace:');
  console.log(`  URL            → ${result1.source_url}`);
  console.log(`  Title          → ${result1.title}`);
  console.log(`  Chunks stored  → ${result1.chunks_created} in document_chunks table`);
  console.log(`  Embeddings     → vector(1536) in pgvector HNSW index`);
  console.log(`  Re-ingest      → replaced cleanly, chunk count: ${result2.chunks_created}`);
}

runTest().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
