/**
 * Canonical WebMind Phase 1 evaluation runner.
 *
 * Dataset: evaluation/dataset.json
 * Results: evaluation/results/runs/eval_<timestamp>.json
 *
 * Assumes source pages have already been ingested:
 *   npm run eval:ingest
 *   npm run eval
 *
 * This runner does not ingest or re-ingest pages.
 *
 * Metrics:
 *   Recall@5 (binary, answerable successes only):
 *     hit if at least one gold relevantChunkId is in the top-5 retrieved chunk IDs
 *   Abstention accuracy (unanswerable successes only):
 *     correct if the generated answer matches a refusal phrase
 *
 * Failed questions are always written to raw results. A run with any
 * failure is PARTIAL, not a complete baseline.
 *
 * Usage (from backend/):
 *   npm run eval
 *   node evaluation/runEval.js
 *   node evaluation/runEval.js --source lvdt
 *   node evaluation/runEval.js --type unanswerable
 */

import dotenv from 'dotenv';
dotenv.config();

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.join(__dirname, 'dataset.json');
const RESULTS_DIR = path.join(__dirname, 'results', 'runs');
const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;
const ASK_TIMEOUT_MS = parseInt(process.env.EVAL_ASK_TIMEOUT_MS || '120000', 10);
const DELAY_MS = parseInt(process.env.EVAL_DELAY_MS || '2000', 10);

const REFUSAL_PATTERNS = [
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

function sanitizeError(message) {
  if (!message) return null;
  return String(message)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|password|secret|authorization)([=:\s]+)\S+/gi, '$1$2[redacted]');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { source: null, type: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      options.source = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[++i];
    }
  }

  return options;
}

function isRefusalAnswer(answer) {
  if (!answer || typeof answer !== 'string') return false;
  const lower = answer.toLowerCase();
  return REFUSAL_PATTERNS.some((p) => lower.includes(p));
}

function isRateLimit(status, errorText) {
  const text = (errorText || '').toLowerCase();
  return status === 429 || text.includes('429') || text.includes('rate limit');
}

async function callAsk(question) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = { error: 'Response was not valid JSON' };
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      latencyMs,
      error: null,
      timedOut: false,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const timedOut = err.name === 'AbortError' || err.name === 'TimeoutError';
    return {
      ok: false,
      status: null,
      data: null,
      latencyMs,
      error: timedOut
        ? `Request timed out after ${ASK_TIMEOUT_MS}ms`
        : sanitizeError(err.message),
      timedOut,
    };
  } finally {
    clearTimeout(timer);
  }
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function runEval() {
  console.log('\nWebMind — Canonical evaluation runner');
  console.log('=====================================');

  const dataset = JSON.parse(await readFile(DATASET_PATH, 'utf-8'));
  const cli = parseArgs();

  let questions = Array.isArray(dataset.questions) ? [...dataset.questions] : [];

  if (cli.source) {
    questions = questions.filter((q) => q.source === cli.source);
    console.log(`Filter: source = ${cli.source}`);
  }
  if (cli.type) {
    questions = questions.filter((q) => q.questionType === cli.type);
    console.log(`Filter: type = ${cli.type}`);
  }

  if (questions.length === 0) {
    console.error('\n[ERROR] No questions matched. Canonical dataset is evaluation/dataset.json.');
    process.exit(1);
  }

  console.log(`Dataset: ${dataset.description || 'N/A'}`);
  console.log(`Questions: ${questions.length}`);
  console.log(`Server: ${BASE_URL}`);
  console.log(`Delay between questions: ${DELAY_MS}ms`);
  console.log('This runner does not ingest pages. Run npm run eval:ingest first if needed.\n');

  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const isUnanswerable = q.questionType === 'unanswerable';

    console.log(`\n[${i + 1}/${questions.length}] id=${q.id} type=${q.questionType} source=${q.source}`);
    console.log(`  Q: ${q.question}`);

    const response = await callAsk(q.question);

    const httpStatus = response.status;
    const generatedAnswer = response.data?.answer ?? null;
    const sources = Array.isArray(response.data?.sources) ? response.data.sources : [];
    const retrievedChunkIds = sources.map((s) => s.chunk_id).filter(Boolean);
    const top5 = retrievedChunkIds.slice(0, 5);
    const goldIds = Array.isArray(q.relevantChunkIds) ? q.relevantChunkIds : [];
    const errorFromBody = response.data?.error ? sanitizeError(response.data.error) : null;
    const error = response.error || (!response.ok ? errorFromBody || `HTTP ${httpStatus}` : null);
    const rateLimited = isRateLimit(httpStatus, error);
    const success = Boolean(response.ok && generatedAnswer != null && !error);

    let recallAt5Hit = null;
    let abstained = null;
    let abstentionCorrect = null;

    if (success) {
      abstained = isRefusalAnswer(generatedAnswer);
      if (!isUnanswerable) {
        recallAt5Hit = goldIds.some((id) => top5.includes(id));
      } else {
        abstentionCorrect = abstained;
      }
    }

    const entry = {
      questionId: q.id,
      source: q.source,
      question: q.question,
      questionType: q.questionType,
      expectedAnswer: q.expectedAnswer,
      expectedSource: q.expectedSource,
      relevantChunkIds: goldIds,
      success,
      httpStatus,
      timedOut: response.timedOut,
      rateLimited,
      error,
      generatedAnswer,
      finishReason: response.data?.finish_reason ?? null,
      retrievedChunkIds,
      similarityScores: sources.map((s) => s.similarity_score ?? null),
      relevanceScores: sources.map((s) => s.relevance_score ?? null),
      sourceUrls: [...new Set(sources.map((s) => s.source_url).filter(Boolean))],
      latencyMs: response.latencyMs,
      abstained,
      recallAt5Hit,
      abstentionCorrect,
    };

    results.push(entry);

    if (success) {
      console.log(`  OK  latency=${entry.latencyMs}ms  recall@5=${recallAt5Hit}  abstained=${abstained}`);
    } else {
      console.error(`  FAIL  status=${httpStatus}  ${error}`);
    }

    if (i < questions.length - 1 && DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  const totalQuestions = results.length;
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const answerable = results.filter((r) => r.questionType !== 'unanswerable');
  const unanswerable = results.filter((r) => r.questionType === 'unanswerable');
  const answerableSuccess = successful.filter((r) => r.questionType !== 'unanswerable');
  const unanswerableSuccess = successful.filter((r) => r.questionType === 'unanswerable');

  const recallHits = answerableSuccess.filter((r) => r.recallAt5Hit === true);
  const recallMisses = answerableSuccess
    .filter((r) => r.recallAt5Hit === false)
    .map((r) => ({
      questionId: r.questionId,
      question: r.question,
      expectedChunkIds: r.relevantChunkIds,
      retrievedTop5: r.retrievedChunkIds.slice(0, 5),
      similarityScores: r.similarityScores.slice(0, 5),
      relevanceScores: r.relevanceScores.slice(0, 5),
      retrievedAtAll: r.relevantChunkIds.some((id) => r.retrievedChunkIds.includes(id)),
    }));

  const abstentionCorrect = unanswerableSuccess.filter((r) => r.abstentionCorrect === true);

  const latencies = successful.map((r) => r.latencyMs).filter((n) => typeof n === 'number');
  const complete = failed.length === 0;
  const runStatus = complete ? 'complete' : 'partial';

  const recallDenominator = answerableSuccess.length;
  const abstentionDenominator = unanswerableSuccess.length;

  const summary = {
    runStatus,
    complete,
    note: complete
      ? 'All selected questions executed successfully. This run may be treated as a complete evaluation of the selected set.'
      : 'One or more questions failed. This is a PARTIAL run, not a complete Phase 1 baseline.',
    totalQuestions,
    successfulQuestions: { numerator: successful.length, denominator: totalQuestions },
    failedQuestions: { numerator: failed.length, denominator: totalQuestions },
    answerableQuestions: answerable.length,
    unanswerableQuestions: unanswerable.length,
    rateLimitFailures: failed.filter((r) => r.rateLimited).length,
    timeoutFailures: failed.filter((r) => r.timedOut).length,
    otherFailures: failed.filter((r) => !r.rateLimited && !r.timedOut).length,
    truncatedAnswers: successful.filter((r) => r.finishReason && r.finishReason !== 'stop').length,
    recallAt5: {
      hits: recallHits.length,
      denominator: recallDenominator,
      percent: recallDenominator > 0 ? Number(((recallHits.length / recallDenominator) * 100).toFixed(2)) : null,
      definition: 'Binary per-question hit: at least one gold relevantChunkId appears in the retrieved top-5 chunk IDs.',
      excludedUnanswerable: unanswerable.length,
      excludedFailedAnswerable: answerable.length - answerableSuccess.length,
      excludedFailedAnswerableNote:
        'Failed answerable questions are excluded from the Recall@5 denominator.',
    },
    abstentionAccuracy: {
      correct: abstentionCorrect.length,
      denominator: abstentionDenominator,
      percent:
        abstentionDenominator > 0
          ? Number(((abstentionCorrect.length / abstentionDenominator) * 100).toFixed(2))
          : null,
      excludedFailedUnanswerable: unanswerable.length - unanswerableSuccess.length,
      excludedFailedUnanswerableNote:
        'Failed unanswerable questions are excluded from the abstention-accuracy denominator.',
    },
    latency: {
      included: 'Successful requests only. Failed requests are excluded from latency aggregates.',
      count: latencies.length,
      averageMs:
        latencies.length > 0
          ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2))
          : null,
      medianMs: latencies.length > 0 ? Number(median(latencies).toFixed(2)) : null,
      minMs: latencies.length > 0 ? Math.min(...latencies) : null,
      maxMs: latencies.length > 0 ? Math.max(...latencies) : null,
    },
    recallMisses,
    answerCorrectness: 'Not automatically calculated. Manual review required.',
    groundedness: 'Not automatically calculated. Manual review required.',
  };

  console.log('\nEvaluation summary');
  console.log(`  Status:                  ${runStatus.toUpperCase()}`);
  console.log(`  Total questions:         ${totalQuestions}`);
  console.log(`  Successful:              ${successful.length}/${totalQuestions}`);
  console.log(`  Failed:                  ${failed.length}/${totalQuestions}`);
  console.log(`  Answerable / unanswerable: ${answerable.length} / ${unanswerable.length}`);
  console.log(
    `  Recall@5:                ${summary.recallAt5.hits}/${summary.recallAt5.denominator}` +
      (summary.recallAt5.percent == null ? '' : ` (${summary.recallAt5.percent}%)`) +
      `  [excluded failed answerable: ${summary.recallAt5.excludedFailedAnswerable}]`,
  );
  console.log(
    `  Abstention accuracy:     ${summary.abstentionAccuracy.correct}/${summary.abstentionAccuracy.denominator}` +
      (summary.abstentionAccuracy.percent == null ? '' : ` (${summary.abstentionAccuracy.percent}%)`) +
      `  [excluded failed unanswerable: ${summary.abstentionAccuracy.excludedFailedUnanswerable}]`,
  );
  console.log(
    `  Latency (success only):  avg=${summary.latency.averageMs} min=${summary.latency.minMs} max=${summary.latency.maxMs}`,
  );
  if (!complete) {
    console.log('\n  PARTIAL RUN — do not treat this as a complete Phase 1 baseline.');
  }

  if (!existsSync(RESULTS_DIR)) {
    await mkdir(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultFile = path.join(RESULTS_DIR, `eval_${timestamp}.json`);
  const report = {
    run_at: new Date().toISOString(),
    dataset_path: 'evaluation/dataset.json',
    dataset_version: dataset.version,
    filters: cli,
    server: BASE_URL,
    summary,
    results,
  };

  await writeFile(resultFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nResults written to: ${resultFile}`);
  console.log('Historical files evaluation/results/raw_results.json and aggregate_metrics.json were not overwritten.\n');

  if (!complete) process.exit(1);
}

runEval().catch((err) => {
  console.error('\n[FATAL]', sanitizeError(err.message));
  process.exit(1);
});
