import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const TAG = 'EVAL_LOG';

// Resolve log directory relative to backend root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'ask_requests.jsonl');

/**
 * Ensures the logs directory exists. Called once on first write.
 */
let dirReady = false;
async function ensureLogDir() {
  if (dirReady) return;
  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true });
  }
  dirReady = true;
}

/**
 * Records a structured log entry for every /ask request.
 *
 * Each entry is a single JSON line (JSONL format) containing all the
 * information needed to evaluate retrieval quality and answer accuracy
 * after the fact — without storing any API keys or sensitive data.
 *
 * @param {Object} entry
 * @param {string} entry.question - The user's question
 * @param {string} entry.answer - The generated answer
 * @param {Array<{chunk_id: string, source_url: string, chunk_index: number, similarity_score: number, text_preview?: string}>} entry.sources - Retrieved sources
 * @param {number} entry.retrieval_count - Number of chunks retrieved before filtering
 * @param {number} entry.relevant_count - Number of chunks above similarity threshold
 * @param {boolean} entry.relevance_gate_passed - Whether chunks met the threshold
 * @param {number} entry.latency_ms - Total pipeline latency
 */
export async function logAskRequest(entry) {
  try {
    await ensureLogDir();

    const record = {
      timestamp: new Date().toISOString(),
      question: entry.question,
      answer: entry.answer,
      source_urls: [...new Set((entry.sources || []).map((s) => s.source_url))],
      retrieved_chunks: (entry.sources || []).map((s) => ({
        chunk_id: s.chunk_id,
        chunk_index: s.chunk_index,
        similarity_score: s.similarity_score,
      })),
      retrieval_count: entry.retrieval_count ?? 0,
      relevant_count: entry.relevant_count ?? 0,
      relevance_gate_passed: entry.relevance_gate_passed ?? false,
      latency_ms: entry.latency_ms ?? null,
    };

    const line = JSON.stringify(record) + '\n';
    await appendFile(LOG_FILE, line, 'utf-8');

    logger.info(TAG, `Logged ask request`, {
      question: record.question.substring(0, 60),
      source_count: record.retrieved_chunks.length,
    });
  } catch (err) {
    // Logging failures must never break the pipeline
    logger.error(TAG, `Failed to write eval log`, { message: err.message });
  }
}
