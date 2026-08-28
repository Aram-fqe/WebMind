/**
 * runEval.js
 *
 * Evaluation runner for the WebMind RAG pipeline.
 *
 * Reads a dataset from eval/dataset.json, sends each question to POST /ask,
 * and writes a detailed results report to eval/results/.
 *
 * Metrics computed:
 *   - Source accuracy:  did retrieval find the expected source URL?
 *   - Unanswerable detection:  did the system correctly refuse to answer?
 *   - Latency:  per-question and aggregate timing
 *   - Retrieval quality:  similarity scores per question
 *   - Breakdown by question_type
 *
 * Usage:
 *   node eval/runEval.js                    # run full dataset
 *   node eval/runEval.js --page page_1      # run only questions for page_1
 *   node eval/runEval.js --type definition  # run only definition questions
 *
 * Server must be running: npm run dev
 */

import dotenv from 'dotenv';
dotenv.config();

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.join(__dirname, 'dataset.json');
const RESULTS_DIR = path.join(__dirname, 'results');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

// ── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { page: null, type: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--page' && args[i + 1]) {
      options.page = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[++i];
    }
  }

  return options;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const divider = (label) =>
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callAsk(question) {
  const start = Date.now();
  const response = await fetch(`${BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const latency = Date.now() - start;
  const data = await response.json();
  return { status: response.status, ok: response.ok, data, latency };
}

/**
 * Determines if the system correctly identified an unanswerable question.
 * Checks for common refusal phrases in the answer.
 */
function isRefusalAnswer(answer) {
  const refusalPatterns = [
    'do not contain enough information',
    'not available in the provided',
    'cannot be determined from',
    'no information about',
    'not mentioned in',
    'does not contain',
    'not enough information',
    'cannot answer',
    'not present in',
  ];
  const lower = answer.toLowerCase();
  return refusalPatterns.some((p) => lower.includes(p));
}

/**
 * Checks if the expected source URL appears in the returned sources.
 */
function sourceMatchFound(sources, expectedSource) {
  if (!expectedSource) return null; // skip if no expected source set
  return sources.some((s) => s.source_url === expectedSource);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runEval() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         WebMind — Evaluation Runner                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ── Load dataset ──────────────────────────────────────────────────────
  const raw = await readFile(DATASET_PATH, 'utf-8');
  const dataset = JSON.parse(raw);

  const cliOptions = parseArgs();

  let questions = dataset.questions.filter(
    (q) => !q.question.startsWith('PLACEHOLDER'),
  );

  if (cliOptions.page) {
    questions = questions.filter((q) => q.page === cliOptions.page);
    console.log(`\nFilter: page = ${cliOptions.page}`);
  }

  if (cliOptions.type) {
    questions = questions.filter((q) => q.question_type === cliOptions.type);
    console.log(`\nFilter: type = ${cliOptions.type}`);
  }

  if (questions.length === 0) {
    console.error('\n[ERROR] No non-placeholder questions found in dataset.');
    console.error('        Fill in the dataset.json questions before running evaluation.');
    process.exit(1);
  }

  console.log(`\nDataset: ${dataset.description || 'N/A'}`);
  console.log(`Questions to evaluate: ${questions.length}`);
  console.log(`Server: ${BASE_URL}`);

  // ── Run each question ─────────────────────────────────────────────────
  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    divider(`[${i + 1}/${questions.length}] ${q.id} (${q.question_type})`);
    console.log(`  Question:  ${q.question}`);
    console.log(`  Expected:  ${q.expected_answer.substring(0, 100)}${q.expected_answer.length > 100 ? '...' : ''}`);
    console.log(`  Type:      ${q.question_type}`);

    let response;
    let error = null;

    try {
      response = await callAsk(q.question);
    } catch (err) {
      error = err.message;
      console.error(`  [ERROR] Request failed: ${err.message}`);
    }

    const entry = {
      id: q.id,
      page: q.page,
      question: q.question,
      question_type: q.question_type,
      expected_answer: q.expected_answer,
      expected_source: q.expected_source,
      // Results
      actual_answer: response?.data?.answer || null,
      sources: response?.data?.sources || [],
      http_status: response?.status || null,
      latency_ms: response?.latency || null,
      error,
      // Evaluation scores
      source_match: null,
      unanswerable_correct: null,
    };

    // ── Evaluate ──────────────────────────────────────────────────────
    if (response?.ok) {
      // Source match check
      if (q.expected_source) {
        entry.source_match = sourceMatchFound(
          response.data.sources,
          q.expected_source,
        );
        console.log(`  Source match: ${entry.source_match ? '✓' : '✗'}`);
      }

      // Unanswerable detection
      if (q.question_type === 'unanswerable') {
        entry.unanswerable_correct = isRefusalAnswer(response.data.answer);
        console.log(
          `  Unanswerable detection: ${entry.unanswerable_correct ? '✓ (correctly refused)' : '✗ (incorrectly answered)'}`,
        );
      }

      // Print answer preview
      const answerPreview = response.data.answer.substring(0, 120);
      console.log(`  Answer:    ${answerPreview}${response.data.answer.length > 120 ? '...' : ''}`);
      console.log(`  Sources:   ${response.data.sources.length}`);
      console.log(`  Latency:   ${response.latency}ms`);

      if (response.data.sources.length > 0) {
        console.log(`  Top score: ${response.data.sources[0].similarity_score}`);
      }
    }

    results.push(entry);

    // Small delay between requests to avoid hammering the server
    if (i < questions.length - 1) {
      await sleep(500);
    }
  }

  // ── Compute aggregate metrics ─────────────────────────────────────────
  divider('Evaluation Summary');

  const total = results.length;
  const successful = results.filter((r) => r.http_status === 200).length;
  const failed = results.filter((r) => r.error || r.http_status !== 200).length;

  // Source accuracy (only for questions with expected_source set)
  const withExpectedSource = results.filter((r) => r.expected_source);
  const sourceMatches = withExpectedSource.filter((r) => r.source_match === true).length;
  const sourceAccuracy =
    withExpectedSource.length > 0
      ? ((sourceMatches / withExpectedSource.length) * 100).toFixed(1)
      : 'N/A';

  // Unanswerable detection
  const unanswerableQs = results.filter((r) => r.question_type === 'unanswerable');
  const unanswerableCorrect = unanswerableQs.filter((r) => r.unanswerable_correct === true).length;
  const unanswerableAccuracy =
    unanswerableQs.length > 0
      ? ((unanswerableCorrect / unanswerableQs.length) * 100).toFixed(1)
      : 'N/A';

  // Latency
  const latencies = results.filter((r) => r.latency_ms).map((r) => r.latency_ms);
  const avgLatency =
    latencies.length > 0
      ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)
      : 'N/A';
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 'N/A';
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 'N/A';

  // By question type
  const byType = {};
  for (const r of results) {
    if (!byType[r.question_type]) byType[r.question_type] = { total: 0, success: 0 };
    byType[r.question_type].total++;
    if (r.http_status === 200) byType[r.question_type].success++;
  }

  console.log(`\n  Total questions:          ${total}`);
  console.log(`  Successful responses:     ${successful}`);
  console.log(`  Failed requests:          ${failed}`);
  console.log(`  Source accuracy:           ${sourceAccuracy}%  (${sourceMatches}/${withExpectedSource.length})`);
  console.log(`  Unanswerable detection:   ${unanswerableAccuracy}%  (${unanswerableCorrect}/${unanswerableQs.length})`);
  console.log(`  Avg latency:              ${avgLatency}ms`);
  console.log(`  Min / Max latency:        ${minLatency}ms / ${maxLatency}ms`);

  console.log(`\n  By question type:`);
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`    ${type.padEnd(16)} ${stats.success}/${stats.total} successful`);
  }

  // ── Write results to file ─────────────────────────────────────────────
  if (!existsSync(RESULTS_DIR)) {
    await mkdir(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultFile = path.join(RESULTS_DIR, `eval_${timestamp}.json`);

  const report = {
    run_at: new Date().toISOString(),
    dataset_version: dataset.version,
    filters: {
      page: cliOptions.page,
      type: cliOptions.type,
    },
    summary: {
      total_questions: total,
      successful: successful,
      failed: failed,
      source_accuracy: sourceAccuracy === 'N/A' ? null : parseFloat(sourceAccuracy),
      unanswerable_accuracy: unanswerableAccuracy === 'N/A' ? null : parseFloat(unanswerableAccuracy),
      avg_latency_ms: avgLatency === 'N/A' ? null : parseInt(avgLatency),
      min_latency_ms: minLatency === 'N/A' ? null : minLatency,
      max_latency_ms: maxLatency === 'N/A' ? null : maxLatency,
      by_question_type: byType,
    },
    results,
  };

  await writeFile(resultFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n  Results saved to: ${resultFile}`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              Evaluation Complete                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (failed > 0) process.exit(1);
}

runEval().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
