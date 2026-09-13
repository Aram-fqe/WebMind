import fs from 'fs';
import path from 'path';

import 'dotenv/config';

const datasetPath = path.resolve('evaluation/dataset.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;

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

async function callAsk(question) {
  const start = Date.now();
  let response;
  try {
    response = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ question }),
    });
  } catch (err) {
    if (err.message.includes('fetch failed')) {
      console.log('Fetch failed (likely keep-alive timeout), retrying...');
      await sleep(1000);
      response = await fetch(`${BASE_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
        body: JSON.stringify({ question }),
      });
    } else {
      throw err;
    }
  }
  const latency = Date.now() - start;
  const data = await response.json();
  return { status: response.status, ok: response.ok, data, latency };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const results = [];
  const metrics = {
    totalEvaluated: 0,
    failedEvaluations: 0,
    otherFailures: 0,
    rateLimitFailures: 0,
    recallAt5Hits: 0,
    recallAt5Total: 0,
    abstentionCorrect: 0,
    abstentionTotal: 0,
    truncatedAnswers: 0,
    latencies: [],
    recallMisses: []
  };

  for (const q of dataset.questions) {
    console.log(`Evaluating [${q.id}]: ${q.question}`);
    let response;
    try {
      response = await callAsk(q.question);
    } catch (e) {
      console.error(`Error on question ${q.id}: ${e.message}`);
      metrics.failedEvaluations++;
      metrics.otherFailures++;
      continue;
    }

    if (!response.ok) {
      console.error(`Error on question ${q.id}: HTTP ${response.status}`);
      metrics.failedEvaluations++;
      if (response.status === 429 || (response.data && response.data.error && response.data.error.includes('429'))) {
        metrics.rateLimitFailures++;
      } else {
        metrics.otherFailures++;
      }
      continue;
    }

    metrics.totalEvaluated++;
    metrics.latencies.push(response.latency);

    const generatedAnswer = response.data.answer;
    const sources = response.data.sources || [];
    const finishReason = response.data.finish_reason;
    if (finishReason && finishReason !== 'stop') {
      metrics.truncatedAnswers++;
      console.warn(`Truncated answer for [${q.id}], finish_reason: ${finishReason}`);
    }
    
    // Extracted arrays
    const retrievedChunkIds = sources.map(s => s.chunk_id);
    const similarityScores = sources.map(s => s.similarity_score);
    const relevanceScores = sources.map(s => s.relevance_score || null);
    const sourceUrls = [...new Set(sources.map(s => s.source_url))];
    
    const abstained = isRefusalAnswer(generatedAnswer);

    // Compute Recall@5 for answerable
    let recallHit = false;
    if (q.questionType !== 'unanswerable') {
      metrics.recallAt5Total++;
      const top5 = retrievedChunkIds.slice(0, 5);
      recallHit = q.relevantChunkIds.some(expectedId => top5.includes(expectedId));
      if (recallHit) {
        metrics.recallAt5Hits++;
      } else {
        metrics.recallMisses.push({
          questionId: q.id,
          question: q.question,
          expectedChunkIds: q.relevantChunkIds,
          retrievedTop5: top5,
          similarityScores: similarityScores.slice(0, 5),
          relevanceScores: relevanceScores.slice(0, 5),
          retrievedAtAll: q.relevantChunkIds.some(expectedId => retrievedChunkIds.includes(expectedId))
        });
      }
    } else {
      metrics.abstentionTotal++;
      if (abstained) metrics.abstentionCorrect++;
    }

    results.push({
      questionId: q.id,
      question: q.question,
      questionType: q.questionType,
      expectedAnswer: q.expectedAnswer,
      generatedAnswer,
      finishReason,
      retrievedChunkIds,
      relevantChunkIds: q.relevantChunkIds,
      similarityScores,
      relevanceScores,
      sourceUrls,
      latencyMs: response.latency,
      abstained,
      recallAt5Hit: q.questionType !== 'unanswerable' ? recallHit : null
    });

    console.log(`Pacing... sleeping 20s to avoid rate limits.`);
    await sleep(20000); // 20 second delay
  }

  // Aggregate stats
  const latenciesSorted = [...metrics.latencies].sort((a, b) => a - b);
  const medianLatency = latenciesSorted.length > 0 ? 
    (latenciesSorted.length % 2 === 0 ? 
      (latenciesSorted[latenciesSorted.length / 2 - 1] + latenciesSorted[latenciesSorted.length / 2]) / 2 
      : latenciesSorted[Math.floor(latenciesSorted.length / 2)]) : 0;

  const avgLatency = metrics.latencies.length > 0 ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length : 0;
  const minLatency = metrics.latencies.length > 0 ? Math.min(...metrics.latencies) : 0;
  const maxLatency = metrics.latencies.length > 0 ? Math.max(...metrics.latencies) : 0;
  
  const recallAt5 = metrics.recallAt5Total > 0 ? (metrics.recallAt5Hits / metrics.recallAt5Total) * 100 : 0;
  const abstentionAccuracy = metrics.abstentionTotal > 0 ? (metrics.abstentionCorrect / metrics.abstentionTotal) * 100 : 0;

  const aggregateMetrics = {
    totalEvaluated: metrics.totalEvaluated,
    successfulQuestions: metrics.totalEvaluated,
    failedEvaluations: metrics.failedEvaluations,
    rateLimitFailures: metrics.rateLimitFailures,
    otherFailures: metrics.otherFailures,
    recallAt5: `${recallAt5.toFixed(2)}%`,
    abstentionAccuracy: `${abstentionAccuracy.toFixed(2)}%`,
    truncatedAnswers: metrics.truncatedAnswers,
    latency: {
      averageMs: avgLatency.toFixed(2),
      medianMs: medianLatency.toFixed(2),
      minMs: minLatency,
      maxMs: maxLatency
    },
    recallMisses: metrics.recallMisses,
    answerCorrectness: "Not automatically calculated. Preserved existing methodology (manual evaluation required).",
    groundedness: "Not automatically calculated. Preserved existing methodology (manual evaluation required)."
  };

  fs.mkdirSync(path.resolve('evaluation/results'), { recursive: true });
  fs.writeFileSync(path.resolve('evaluation/results/raw_results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.resolve('evaluation/results/aggregate_metrics.json'), JSON.stringify(aggregateMetrics, null, 2));

  console.log('\n========================================');
  console.log('EVALUATION COMPLETE');
  console.log('========================================');
  console.log(JSON.stringify(aggregateMetrics, null, 2));
}

run().catch(console.error);
