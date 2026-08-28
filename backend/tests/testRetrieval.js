/**
 * testRetrieval.js
 *
 * End-to-end test for the POST /search semantic retrieval pipeline.
 *
 * Pipeline tested:
 *   query → embedding → pgvector cosine similarity search → top K chunks
 *
 * Tests:
 *   1. Search with a real query and verify response shape
 *   2. Verify results are ordered by descending similarity score
 *   3. Test configurable topK
 *   4. Test validation error (missing query)
 *
 * Usage:
 *   node tests/testRetrieval.js
 *   (Server must be running: npm run dev)
 *   (At least one webpage must already be ingested)
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const TEST_QUERY = 'What does an LVDT measure?';
const DEFAULT_TOP_K = 5;

// ── Helpers ─────────────────────────────────────────────────────────────────

const divider = (label) => console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
const indent = (str, n = 4) => str.split('\n').map(l => ' '.repeat(n) + l).join('\n');

async function callSearch(query, topK) {
  const body = { query };
  if (topK !== undefined) body.topK = topK;

  const response = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║        WebMind — Semantic Retrieval E2E Test            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nQuery:   "${TEST_QUERY}"`);
  console.log(`Top K:   ${DEFAULT_TOP_K}`);
  console.log(`Server:  ${BASE_URL}`);

  // ── Test 1: Basic semantic search ─────────────────────────────────────
  divider('Test 1 — Semantic Search (default topK=5)');

  console.log('\n[→] Sending POST /search...');
  let result;
  try {
    result = await callSearch(TEST_QUERY);
  } catch (err) {
    console.error('\n[FAIL] Search request failed:', err.message);
    console.error('       Make sure the server is running (npm run dev)');
    console.error('       Make sure at least one webpage has been ingested');
    process.exit(1);
  }

  console.log('\n[✓] Response received:');
  console.log(indent(JSON.stringify({
    query: result.query,
    topK: result.topK,
    results_count: result.results_count,
  }, null, 2)));

  // Validate response shape
  const requiredTopLevel = ['query', 'topK', 'results_count', 'results'];
  const missingTop = requiredTopLevel.filter(f => !(f in result));
  if (missingTop.length > 0) {
    console.error(`\n[FAIL] Response missing top-level fields: ${missingTop.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n[✓] Top-level fields present: ${requiredTopLevel.join(', ')}`);

  // Validate each result chunk
  const requiredChunkFields = ['chunk_id', 'chunk_text', 'source_url', 'page_title', 'similarity_score', 'chunk_index'];

  if (result.results.length > 0) {
    const missingChunk = requiredChunkFields.filter(f => !(f in result.results[0]));
    if (missingChunk.length > 0) {
      console.error(`\n[FAIL] Chunk result missing fields: ${missingChunk.join(', ')}`);
      process.exit(1);
    }
    console.log(`[✓] Chunk fields present: ${requiredChunkFields.join(', ')}`);
  }

  // ── Print retrieved chunks with similarity scores ─────────────────────
  divider('Retrieved Chunks');

  if (result.results.length === 0) {
    console.warn('\n[WARN] No chunks returned — database may be empty or query has no matches.');
  } else {
    result.results.forEach((chunk, i) => {
      console.log(`\n  #${i + 1} ─────────────────────────────────────────────`);
      console.log(`  chunk_id:         ${chunk.chunk_id}`);
      console.log(`  similarity_score: ${chunk.similarity_score}`);
      console.log(`  chunk_index:      ${chunk.chunk_index}`);
      console.log(`  source_url:       ${chunk.source_url}`);
      console.log(`  page_title:       ${chunk.page_title}`);
      console.log(`  chunk_text:       ${chunk.chunk_text.substring(0, 120)}...`);
    });
  }

  // ── Test 2: Verify descending similarity order ────────────────────────
  divider('Test 2 — Similarity Score Ordering');

  if (result.results.length >= 2) {
    let ordered = true;
    for (let i = 1; i < result.results.length; i++) {
      if (result.results[i].similarity_score > result.results[i - 1].similarity_score) {
        ordered = false;
        console.error(
          `\n[FAIL] Results not in descending similarity order at index ${i}: ` +
          `${result.results[i - 1].similarity_score} < ${result.results[i].similarity_score}`
        );
        break;
      }
    }
    if (ordered) {
      console.log('\n[✓] Results correctly ordered by descending similarity score');
    }
  } else {
    console.log('\n[SKIP] Not enough results to verify ordering');
  }

  // ── Test 3: Configurable topK ─────────────────────────────────────────
  divider('Test 3 — Configurable topK (topK=2)');

  console.log('\n[→] Sending POST /search with topK=2...');
  const result2 = await callSearch(TEST_QUERY, 2);

  if (result2.topK === 2) {
    console.log(`[✓] topK correctly set to ${result2.topK}`);
  } else {
    console.error(`[FAIL] Expected topK=2, got topK=${result2.topK}`);
    process.exit(1);
  }

  if (result2.results.length <= 2) {
    console.log(`[✓] Returned ${result2.results.length} result(s) (max 2)`);
  } else {
    console.error(`[FAIL] Expected ≤ 2 results, got ${result2.results.length}`);
    process.exit(1);
  }

  // ── Test 4: Validation error (missing query) ─────────────────────────
  divider('Test 4 — Validation Error (Missing Query)');

  console.log('\n[→] Sending POST /search with empty body...');
  const badResponse = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const badBody = await badResponse.json();

  if (badResponse.status === 400 && badBody.code === 'MISSING_QUERY') {
    console.log(`[✓] Correctly returned 400 MISSING_QUERY: "${badBody.error}"`);
  } else {
    console.error(`[FAIL] Expected 400 MISSING_QUERY, got ${badResponse.status}: ${JSON.stringify(badBody)}`);
    process.exit(1);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                  ALL TESTS PASSED ✓                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('Pipeline trace:');
  console.log(`  Query           → "${result.query}"`);
  console.log(`  Top K           → ${result.topK}`);
  console.log(`  Chunks returned → ${result.results_count}`);
  console.log(`  Similarity      → cosine (1 - distance), via pgvector <=>`);
  if (result.results.length > 0) {
    console.log(`  Best match      → ${result.results[0].similarity_score} (chunk: ${result.results[0].chunk_id})`);
    console.log(`  Worst match     → ${result.results[result.results.length - 1].similarity_score}`);
  }
}

runTest().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
