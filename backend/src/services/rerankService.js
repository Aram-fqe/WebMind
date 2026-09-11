import { getRerankConfig } from '../config/rerankConfig.js';
import { logger } from '../utils/logger.js';

const TAG = 'RERANK';

/**
 * Reranks a list of retrieved chunks against a query using the Cohere Rerank API.
 *
 * Cohere Rerank v2 endpoint:
 *   POST https://api.cohere.com/v2/rerank
 *
 * This is a cross-encoder reranker — it scores each (query, document) pair
 * for semantic relevance, producing much more accurate ordering than
 * embedding cosine similarity alone.
 *
 * @param {string} query - The user's question
 * @param {Array<{chunk_id: string, chunk_text: string, source_url: string, page_title: string, similarity_score: number, chunk_index: number}>} chunks - Retrieved chunks to rerank
 * @param {Object} [options]
 * @param {number} [options.topN] - Number of top results to return (default from config)
 * @returns {Promise<Array<{chunk_id: string, chunk_text: string, source_url: string, page_title: string, similarity_score: number, relevance_score: number, chunk_index: number}>>}
 */
export async function rerankChunks(query, chunks, options = {}) {
  const config = getRerankConfig();

  if (!config.apiKey) {
    logger.warn(TAG, 'COHERE_API_KEY not configured — skipping reranking, returning chunks as-is');
    return chunks;
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  // If only 1 chunk, reranking is pointless
  if (chunks.length === 1) {
    return chunks.map(c => ({ ...c, relevance_score: 1.0 }));
  }

  const topN = options.topN || config.topN || chunks.length;
  const model = config.model;

  logger.info(TAG, `Reranking ${chunks.length} chunks with Cohere`, { model, topN });

  try {
    const documents = chunks.map(c => c.chunk_text);

    const response = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: Math.min(topN, chunks.length),
        return_documents: false, // We already have the docs, just need indices + scores
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 429) {
        logger.warn(TAG, `Cohere rate limit hit (429) — falling back to original order`);
        return chunks;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`[RerankService] Invalid Cohere API Key (${response.status}). Check COHERE_API_KEY.`);
      }
      throw new Error(`[RerankService] Cohere API Error [${response.status}]: ${errorBody}`);
    }

    const data = await response.json();

    if (!data || !data.results || !Array.isArray(data.results)) {
      throw new Error('[RerankService] Unexpected response format from Cohere rerank API.');
    }

    // Map reranked results back to original chunks with relevance scores
    const reranked = data.results.map(result => ({
      ...chunks[result.index],
      relevance_score: result.relevance_score,
    }));

    logger.info(TAG, `Reranking complete`, {
      input_count: chunks.length,
      output_count: reranked.length,
      top_relevance: reranked[0]?.relevance_score,
      bottom_relevance: reranked[reranked.length - 1]?.relevance_score,
    });

    // Log individual reranked results for debugging
    reranked.forEach((chunk, i) => {
      logger.info(TAG, `  #${i + 1}`, {
        chunk_id: chunk.chunk_id,
        relevance_score: chunk.relevance_score,
        similarity_score: chunk.similarity_score,
        preview: chunk.chunk_text.substring(0, 80) + '...',
      });
    });

    return reranked;
  } catch (err) {
    if (err.message.startsWith('[RerankService]')) {
      throw err;
    }
    // On unexpected errors, gracefully fall back to original order
    logger.error(TAG, `Reranking failed — falling back to original order`, { error: err.message });
    return chunks;
  }
}
