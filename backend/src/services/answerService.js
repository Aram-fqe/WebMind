import { LlmClient } from '../llm/llmClient.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TAG = 'ANSWER_GEN';
const llmClient = new LlmClient();

// ── System prompt ──────────────────────────────────────────────────────────
// Instructs the LLM to act as a grounded QA system that only uses the
// supplied webpage context. This is the core RAG contract.

const SYSTEM_PROMPT = `You are WebMind, a precise question-answering assistant.

RULES — follow these strictly:
1. Answer using ONLY the supplied webpage context below. Do not rely on outside knowledge.
2. If the answer cannot be determined from the provided context, explicitly say: "The provided sources do not contain enough information to answer this question."
3. Do not invent facts, speculate, or hallucinate details that are not directly supported by the context.
4. Keep the answer concise and directly useful — no filler or unnecessary preamble.
5. When referencing specific information, mentally note which context chunk it came from.
6. Preserve the distinction between what the sources directly state and any inference. If you must infer, say so explicitly.
7. If the context chunks are only partially relevant, answer what you can and acknowledge the gaps.`;

/**
 * Builds the user-facing prompt that combines the question with retrieved
 * context chunks. Each chunk is labelled with its index, source URL, and
 * chunk_id so the model (and post-processing) can trace provenance.
 *
 * @param {string} question
 * @param {Array<{chunk_id: string, chunk_text: string, source_url: string, page_title: string, similarity_score: number, chunk_index: number}>} chunks
 * @returns {string}
 */
function buildUserPrompt(question, chunks) {
  const contextBlock = chunks
    .map((chunk, i) => {
      return [
        `--- Context Chunk ${i + 1} ---`,
        `chunk_id: ${chunk.chunk_id}`,
        `source_url: ${chunk.source_url}`,
        `page_title: ${chunk.page_title || 'N/A'}`,
        `chunk_index: ${chunk.chunk_index}`,
        '',
        chunk.chunk_text,
      ].join('\n');
    })
    .join('\n\n');

  return `CONTEXT:\n${contextBlock}\n\nQUESTION:\n${question}`;
}

/**
 * Generates a grounded answer from retrieved chunks using an LLM.
 *
 * Pipeline:  question + chunks → prompt → LLM → { answer, sources }
 *
 * This function does NOT perform retrieval — it expects pre-retrieved chunks
 * as input, keeping the LLM layer fully isolated from retrieval and database code.
 *
 * @param {string} question - The user's natural-language question
 * @param {Array<{chunk_id: string, chunk_text: string, source_url: string, page_title: string, similarity_score: number, chunk_index: number}>} chunks - Retrieved chunks from the retrieval service
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
export async function generateAnswer(question, chunks) {
  // ── Input validation ──────────────────────────────────────────────────
  if (!question || typeof question !== 'string' || !question.trim()) {
    throw new ValidationError(
      'Question must be a non-empty string.',
      'INVALID_QUESTION',
      400,
    );
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new ValidationError(
      'At least one retrieved chunk is required for answer generation.',
      'NO_CHUNKS',
      400,
    );
  }

  const cleanQuestion = question.trim();

  logger.info(TAG, `Generating grounded answer`, {
    question: cleanQuestion,
    chunk_count: chunks.length,
  });

  // ── Build prompt ──────────────────────────────────────────────────────
  const userPrompt = buildUserPrompt(cleanQuestion, chunks);

  logger.info(TAG, `Prompt constructed`, {
    user_prompt_length: userPrompt.length,
  });

  // ── LLM call ──────────────────────────────────────────────────────────
  const { text: answer, usage } = await llmClient.chatCompletion(
    SYSTEM_PROMPT,
    userPrompt,
  );

  logger.info(TAG, `Answer generated`, {
    answer_length: answer.length,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  });

  // ── Shape sources array ───────────────────────────────────────────────
  // Each source gets a short text preview (first 150 chars) for quick
  // reference without exposing the full chunk text in the response.
  const sources = chunks.map(chunk => ({
    chunk_id: chunk.chunk_id,
    source_url: chunk.source_url,
    chunk_index: chunk.chunk_index,
    similarity_score: chunk.similarity_score,
    text_preview: chunk.chunk_text.substring(0, 150) + (chunk.chunk_text.length > 150 ? '...' : ''),
  }));

  return { answer, sources };
}
