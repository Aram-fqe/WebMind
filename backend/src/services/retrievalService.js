import { EmbeddingService } from '../embeddings/embeddingService.js';
import { searchSimilarChunks as dbSearchSimilarChunks } from '../db/repository.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

const embeddingService = new EmbeddingService();
const TAG = 'RETRIEVAL';

/**
 * Semantic retrieval pipeline:
 *   question → embedding → pgvector cosine similarity search → top K chunks
 *
 * Uses cosine similarity via pgvector's `<=>` operator (cosine distance).
 * Similarity is calculated as: similarity_score = 1 - cosine_distance
 *   - 1.0 = identical vectors (perfect match)
 *   - 0.0 = orthogonal vectors (no similarity)
 *
 * The HNSW index (vector_cosine_ops) on the embedding column accelerates
 * the search to approximate nearest-neighbor instead of brute-force scan.
 *
 * @param {string} queryText - Natural-language question to search for
 * @param {number} [topK=5] - Number of most-similar chunks to return
 * @returns {Promise<{
 *   query: string,
 *   topK: number,
 *   results_count: number,
 *   results: Array<{
 *     chunk_id: string,
 *     chunk_text: string,
 *     source_url: string,
 *     page_title: string,
 *     similarity_score: number,
 *     chunk_index: number
 *   }>
 * }>}
 */
export async function searchSimilarChunks(queryText, topK = 5) {
  // ── Input validation ──────────────────────────────────────────────────
  if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
    throw new ValidationError(
      'Query must be a non-empty string.',
      'INVALID_QUERY',
      400,
    );
  }

  if (!Number.isInteger(topK) || topK < 1) {
    throw new ValidationError(
      'topK must be a positive integer.',
      'INVALID_TOP_K',
      400,
    );
  }

  const cleanQuery = queryText.trim();

  logger.info(TAG, `Starting semantic search`, { query: cleanQuery, topK });

  // ── Step 1: Embed the query ───────────────────────────────────────────
  // The same embedding model (text-embedding-3-small, 1536-dim) used during
  // ingestion is reused here so query and document vectors live in the same
  // vector space — a requirement for cosine similarity to be meaningful.
  logger.info(TAG, `[1/2] Generating query embedding...`);
  const [queryVector] = await embeddingService.generateEmbeddings([cleanQuery]);

  if (!queryVector || queryVector.length === 0) {
    throw new Error('[RetrievalService] Failed to generate embedding for query.');
  }

  logger.info(TAG, `[1/2] Query embedding generated`, {
    dimensions: queryVector.length,
  });

  // ── Step 2: pgvector similarity search ────────────────────────────────
  // Delegates to repository.searchSimilarChunks which runs:
  //   SELECT ... (1 - (embedding <=> $1::vector)) AS similarity_score
  //   ORDER BY embedding <=> $1::vector ASC LIMIT $N
  //
  // <=> is pgvector's cosine distance operator.
  // Lower distance = higher similarity, so we ORDER ASC and compute 1 - distance.
  logger.info(TAG, `[2/2] Searching pgvector for top ${topK} similar chunks...`);
  const results = await dbSearchSimilarChunks(queryVector, { limit: topK });

  // ── Development logging: chunk IDs and similarity scores ──────────────
  logger.info(TAG, `[2/2] Search complete — ${results.length} chunks retrieved`);
  results.forEach((chunk, i) => {
    logger.info(TAG, `  #${i + 1}`, {
      chunk_id: chunk.chunk_id,
      similarity_score: chunk.similarity_score,
      chunk_index: chunk.chunk_index,
      preview: chunk.chunk_text.substring(0, 80) + '...',
    });
  });

  // ── Shape the response (strip internal metadata) ──────────────────────
  const shaped = results.map(chunk => ({
    chunk_id: chunk.chunk_id,
    chunk_text: chunk.chunk_text,
    source_url: chunk.source_url,
    page_title: chunk.page_title,
    similarity_score: chunk.similarity_score,
    chunk_index: chunk.chunk_index,
  }));

  return {
    query: cleanQuery,
    topK,
    results_count: shaped.length,
    results: shaped,
  };
}
