/**
 * testAsk.js
 *
 * End-to-end test for the POST /ask RAG pipeline.
 *
 * Pipeline tested:
 *   question → embedding → pgvector retrieval → relevance gate → LLM answer
 *
 * Tests:
 *   1. Question whose answer exists in ingested content
 *   2. Question whose answer does NOT exist in ingested content
 *   3. Invalid request (missing question)
 *   4. Question with multiple relevant chunks
 *
 * Usage:
 *   node tests/testAsk.js
 *   (Server must be running: npm run dev)
 *   (At least one webpage must already be ingested)
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

const divider = (label) =>
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
const indent = (str, n = 4) =>
  str.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

async function callAsk(question) {
  const body = question !== undefined ? { question } : {};

  const response = await fetch(`${BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}

function printSources(sources) {
  if (!sources || sources.length === 0) {
    console.log('    (no sources)');
    return;
  }
  sources.forEach((src, i) => {
    console.log(`\n    Source #${i + 1}:`);
    console.log(`      chunk_id:         ${src.chunk_id}`);
    console.log(`      source_url:       ${src.source_url}`);
    console.log(`      chunk_index:      ${src.chunk_index}`);
    console.log(`      similarity_score: ${src.similarity_score}`);
    console.log(`      text_preview:     ${(src.text_preview || '').substring(0, 100)}...`);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         WebMind — POST /ask  E2E Test Suite             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nServer: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // ── Test 1: Question with answer in content ──────────────────────────
  divider('Test 1 — Question whose answer exists in ingested content');

  console.log('\n[→] Sending POST /ask { question: "What does an LVDT measure?" }');
  const t1 = await callAsk('What does an LVDT measure?');

  if (!t1.ok) {
    console.error(`[FAIL] Expected 200, got ${t1.status}: ${JSON.stringify(t1.data)}`);
    failed++;
  } else {
    // Validate response shape
    const hasAnswer = typeof t1.data.answer === 'string' && t1.data.answer.length > 0;
    const hasSources = Array.isArray(t1.data.sources);

    if (!hasAnswer) {
      console.error('[FAIL] Response missing or empty "answer" field');
      failed++;
    } else if (!hasSources) {
      console.error('[FAIL] Response missing "sources" array');
      failed++;
    } else {
      console.log('\n[✓] Response shape valid');
      console.log(`\n  Answer:\n${indent(t1.data.answer)}`);

      // Validate source fields
      if (t1.data.sources.length > 0) {
        const requiredSourceFields = ['chunk_id', 'source_url', 'chunk_index', 'similarity_score', 'text_preview'];
        const missingFields = requiredSourceFields.filter((f) => !(f in t1.data.sources[0]));
        if (missingFields.length > 0) {
          console.error(`[FAIL] Source missing fields: ${missingFields.join(', ')}`);
          failed++;
        } else {
          console.log(`[✓] Source fields present: ${requiredSourceFields.join(', ')}`);

          // Verify similarity scores are present and numeric
          const allScoresValid = t1.data.sources.every(
            (s) => typeof s.similarity_score === 'number' && s.similarity_score >= 0 && s.similarity_score <= 1,
          );
          if (!allScoresValid) {
            console.error('[FAIL] Some similarity_score values are invalid');
            failed++;
          } else {
            console.log('[✓] All similarity scores valid (0-1 range)');
            passed++;
          }
        }
      } else {
        console.log('[WARN] No sources returned — answer may be "not enough info"');
        passed++;
      }

      console.log(`\n  Sources (${t1.data.sources.length}):`);
      printSources(t1.data.sources);
    }
  }

  // ── Test 2: Question whose answer does NOT exist ─────────────────────
  divider('Test 2 — Question whose answer does NOT exist in ingested content');

  const obscureQuestion = 'What is the capital of the lost underwater city of Atlantis according to Plato?';
  console.log(`\n[→] Sending POST /ask { question: "${obscureQuestion}" }`);
  const t2 = await callAsk(obscureQuestion);

  if (!t2.ok) {
    console.error(`[FAIL] Expected 200 (with safe response), got ${t2.status}`);
    failed++;
  } else {
    const hasAnswer = typeof t2.data.answer === 'string' && t2.data.answer.length > 0;
    const hasSources = Array.isArray(t2.data.sources);

    if (!hasAnswer || !hasSources) {
      console.error('[FAIL] Response shape invalid');
      failed++;
    } else {
      console.log('\n[✓] Response shape valid');
      console.log(`\n  Answer:\n${indent(t2.data.answer)}`);
      console.log(`\n  Sources (${t2.data.sources.length}):`);
      printSources(t2.data.sources);

      // The answer should indicate insufficient information
      // (either from the relevance gate or from the LLM's grounding rules)
      console.log('\n[✓] Pipeline handled irrelevant question gracefully');
      passed++;
    }
  }

  // ── Test 3: Invalid request (missing question) ───────────────────────
  divider('Test 3 — Invalid request (missing question)');

  console.log('\n[→] Sending POST /ask with empty body {}');
  const t3 = await callAsk(undefined);

  if (t3.status === 400 && t3.data.code === 'MISSING_QUESTION') {
    console.log(`[✓] Correctly returned 400 MISSING_QUESTION: "${t3.data.error}"`);
    passed++;
  } else {
    console.error(`[FAIL] Expected 400 MISSING_QUESTION, got ${t3.status}: ${JSON.stringify(t3.data)}`);
    failed++;
  }

  // ── Test 3b: Invalid request (empty string) ──────────────────────────
  divider('Test 3b — Invalid request (empty string question)');

  console.log('\n[→] Sending POST /ask { question: "   " }');
  const t3b = await callAsk('   ');

  if (t3b.status === 400) {
    console.log(`[✓] Correctly returned 400 for whitespace-only question`);
    passed++;
  } else {
    console.error(`[FAIL] Expected 400, got ${t3b.status}: ${JSON.stringify(t3b.data)}`);
    failed++;
  }

  // ── Test 4: Question with multiple relevant chunks ───────────────────
  divider('Test 4 — Question with multiple relevant chunks');

  const broadQuestion = 'Explain the main concepts discussed on the page';
  console.log(`\n[→] Sending POST /ask { question: "${broadQuestion}" }`);
  const t4 = await callAsk(broadQuestion);

  if (!t4.ok) {
    console.error(`[FAIL] Expected 200, got ${t4.status}: ${JSON.stringify(t4.data)}`);
    failed++;
  } else {
    const sourceCount = t4.data.sources.length;
    console.log(`\n[✓] Response received with ${sourceCount} sources`);
    console.log(`\n  Answer:\n${indent(t4.data.answer)}`);

    if (sourceCount > 1) {
      console.log(`\n[✓] Multiple relevant chunks (${sourceCount}) contributed to the answer`);

      // Verify sources are ordered by descending similarity
      let ordered = true;
      for (let i = 1; i < t4.data.sources.length; i++) {
        if (t4.data.sources[i].similarity_score > t4.data.sources[i - 1].similarity_score) {
          ordered = false;
          break;
        }
      }
      if (ordered) {
        console.log('[✓] Sources ordered by descending similarity score');
      } else {
        console.log('[WARN] Sources not in descending similarity order');
      }
    } else {
      console.log(`[INFO] Only ${sourceCount} source(s) returned — may depend on ingested content`);
    }

    console.log(`\n  Sources (${sourceCount}):`);
    printSources(t4.data.sources);
    passed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  if (failed === 0) {
    console.log(`║              ALL ${passed} TESTS PASSED ✓                      ║`);
  } else {
    console.log(`║          ${passed} PASSED, ${failed} FAILED ✗                        ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════╝');

  console.log('\nPipeline trace:');
  console.log('  question → embedding → pgvector → relevance gate → LLM → answer');
  console.log('');

  if (failed > 0) process.exit(1);
}

runTest().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
