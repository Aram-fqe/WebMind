import { EmbeddingService } from '../embeddings/embeddingService.js';
import { searchSimilarChunks as dbSearchSimilarChunks } from '../db/repository.js';
import { rerankChunks } from './rerankService.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

const embeddingService = new EmbeddingService();
const TAG = 'RETRIEVAL';

/**
 * Semantic retrieval pipeline:
 *   question → embedding → pgvector cosine similarity search → Cohere rerank → top K chunks
 *
 * Uses cosine similarity via pgvector's `<=>` operator (cosine distance).
 * Similarity is calculated as: similarity_score = 1 - cosine_distance
 *   - 1.0 = identical vectors (perfect match)
 *   - 0.0 = orthogonal vectors (no similarity)
 *
 * The HNSW index (vector_cosine_ops) on the embedding column accelerates
 * the search to approximate nearest-neighbor instead of brute-force scan.
 *
 * After vector search, Cohere reranking (cross-encoder) re-scores candidates
 * for semantic relevance, producing much better ordering than cosine alone.
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
 *     relevance_score: number,
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
  // The same embedding model (text-embedding-004, 768-dim) used during
  // ingestion is reused here so query and document vectors live in the same
  // vector space — a requirement for cosine similarity to be meaningful.
  logger.info(TAG, `[1/3] Generating query embedding...`);
  const t0 = performance.now();
  const [queryVector] = await embeddingService.generateEmbeddings([cleanQuery]);
  const t1 = performance.now();

  if (!queryVector || queryVector.length === 0) {
    throw new Error('[RetrievalService] Failed to generate embedding for query.');
  }

  logger.info(TAG, `[1/3] Query embedding generated`, {
    dimensions: queryVector.length,
  });

  // ── Step 2: pgvector similarity search ────────────────────────────────
  // Over-fetch candidates (topK * 3) to give the reranker a wider pool.
  // Delegates to repository.searchSimilarChunks which runs:
  //   SELECT ... (1 - (embedding <=> $1::vector)) AS similarity_score
  //   ORDER BY embedding <=> $1::vector ASC LIMIT $N
  //
  // <=> is pgvector's cosine distance operator.
  // Lower distance = higher similarity, so we ORDER ASC and compute 1 - distance.
  const candidateCount = topK * 3;
  logger.info(TAG, `[2/3] Searching pgvector for top ${candidateCount} candidates...`);
  const candidates = await dbSearchSimilarChunks(queryVector, { limit: candidateCount });
  const t2 = performance.now();

  logger.info(TAG, `[2/3] Vector search complete — ${candidates.length} candidates retrieved`);
  candidates.forEach((chunk, i) => {
    logger.info(TAG, `  #${i + 1}`, {
      chunk_id: chunk.chunk_id,
      similarity_score: chunk.similarity_score,
      chunk_index: chunk.chunk_index,
      preview: chunk.chunk_text.substring(0, 80) + '...',
    });
  });

  // ── Step 3: Cohere reranking ──────────────────────────────────────────
  // Cross-encoder reranker re-scores each (query, chunk) pair for
  // semantic relevance, producing much better ordering than cosine alone.
  logger.info(TAG, `[3/3] Reranking candidates with Cohere...`);
  const reranked = await rerankChunks(cleanQuery, candidates, { topN: topK });
  const t3 = performance.now();

  logger.info(TAG, `[3/3] Reranking complete — ${reranked.length} chunks selected`);

  // ── Shape the response (strip internal metadata) ──────────────────────
  const shaped = reranked.map(chunk => ({
    chunk_id: chunk.chunk_id,
    chunk_text: chunk.chunk_text,
    source_url: chunk.source_url,
    page_title: chunk.page_title,
    similarity_score: chunk.similarity_score,
    relevance_score: chunk.relevance_score,
    chunk_index: chunk.chunk_index,
  }));

  return {
    query: cleanQuery,
    topK,
    results_count: shaped.length,
    results: shaped,
    timings: {
      embedding_latency_ms: t1 - t0,
      retrieval_latency_ms: t2 - t1,
      rerank_latency_ms: t3 - t2,
    }
  };
}
