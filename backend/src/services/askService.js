import { searchSimilarChunks } from './retrievalService.js';
import { generateAnswer } from './answerService.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TAG = 'ASK';

/**
 * Minimum cosine similarity threshold. Chunks below this are considered
 * irrelevant — if ALL chunks fall below, the LLM is never called and a
 * safe "not enough information" response is returned instead.
 */
const MIN_SIMILARITY_THRESHOLD = 0.20;

const NOT_ENOUGH_INFO_ANSWER =
  'The provided sources do not contain enough information to answer this question.';

/**
 * Full RAG pipeline:
 *   question → embedding → pgvector retrieval → relevance gate → LLM answer
 *
 * Orchestrates retrievalService and answerService while keeping them
 * fully decoupled — neither knows about the other.
 *
 * @param {string} question - Natural-language question
 * @param {Object} [options]
 * @param {number} [options.topK=5] - Number of chunks to retrieve
 * @returns {Promise<{
 *   answer: string,
 *   sources: Array<{
 *     chunk_id: string,
 *     source_url: string,
 *     chunk_index: number,
 *     similarity_score: number,
 *     text_preview: string
 *   }>
 * }>}
 */
export async function ask(question, options = {}) {
  const topK = options.topK || 5;

  // ── Input validation ──────────────────────────────────────────────────
  if (!question || typeof question !== 'string' || !question.trim()) {
    throw new ValidationError(
      'Request body must contain a non-empty "question" string.',
      'MISSING_QUESTION',
      400,
    );
  }

  const cleanQuestion = question.trim();

  logger.info(TAG, `Starting RAG pipeline`, { question: cleanQuestion, topK });

  // ── Step 1: Semantic retrieval ────────────────────────────────────────
  logger.info(TAG, `[1/3] Retrieving top ${topK} chunks...`);
  let retrieval;
  try {
    retrieval = await searchSimilarChunks(cleanQuestion, topK);
  } catch (err) {
    logger.error(TAG, `[1/3] Retrieval failed`, { message: err.message });
    throw err;
  }

  const chunks = retrieval.results;

  // ── Step 2: Relevance gate ────────────────────────────────────────────
  // If no chunks were returned, or every chunk is below the similarity
  // threshold, short-circuit with a safe response — never let the LLM
  // answer without grounding context.
  if (chunks.length === 0) {
    logger.warn(TAG, `[2/3] No chunks retrieved — returning safe response`);
    return { answer: NOT_ENOUGH_INFO_ANSWER, sources: [] };
  }

  const relevantChunks = chunks.filter(
    (c) => c.similarity_score >= MIN_SIMILARITY_THRESHOLD,
  );

  if (relevantChunks.length === 0) {
    logger.warn(TAG, `[2/3] All ${chunks.length} chunks below similarity threshold (${MIN_SIMILARITY_THRESHOLD})`, {
      best_score: chunks[0].similarity_score,
    });
    // Still return the sources so the caller can see what was found
    const sources = chunks.map((c) => ({
      chunk_id: c.chunk_id,
      source_url: c.source_url,
      chunk_index: c.chunk_index,
      similarity_score: c.similarity_score,
      text_preview: c.chunk_text.substring(0, 150) + (c.chunk_text.length > 150 ? '...' : ''),
    }));
    return { answer: NOT_ENOUGH_INFO_ANSWER, sources };
  }

  logger.info(TAG, `[2/3] ${relevantChunks.length}/${chunks.length} chunks above threshold`, {
    threshold: MIN_SIMILARITY_THRESHOLD,
    best_score: relevantChunks[0].similarity_score,
    worst_score: relevantChunks[relevantChunks.length - 1].similarity_score,
  });

  // ── Step 3: LLM answer generation ────────────────────────────────────
  logger.info(TAG, `[3/3] Generating grounded answer...`);
  let result;
  try {
    result = await generateAnswer(cleanQuestion, relevantChunks);
  } catch (err) {
    logger.error(TAG, `[3/3] LLM answer generation failed`, { message: err.message });
    throw err;
  }

  logger.info(TAG, `RAG pipeline complete`, {
    answer_length: result.answer.length,
    source_count: result.sources.length,
  });

  return result;
}
