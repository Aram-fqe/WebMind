import { extract } from '../extractors/index.js';
import { TextChunker } from '../chunking/textChunker.js';
import { EmbeddingService } from '../embeddings/embeddingService.js';
import { upsertWebpage } from '../db/repository.js';
import { logger } from '../utils/logger.js';

const chunker = new TextChunker();
const embeddingService = new EmbeddingService();

const TAG = 'INGEST';

/**
 * Runs the full ingestion pipeline for a given URL:
 *   extract → chunk → generate embeddings → store in PostgreSQL/pgvector
 *
 * De-duplication:
 *   - upsertWebpage uses ON CONFLICT (url) DO UPDATE, so only one row per URL.
 *   - saveChunks (called inside embedAndStoreChunks) deletes existing chunks for
 *     the webpage before inserting, so re-ingesting the same URL replaces chunks cleanly.
 *
 * @param {string} url - The target webpage URL to ingest.
 * @returns {Promise<{ source_url: string, title: string, chunks_created: number, status: 'success' }>}
 * @throws {ExtractionError|ValidationError|Error}
 */
export async function ingest(url) {
  logger.info(TAG, `Starting ingestion pipeline`, { url });

  // ── Stage 1: Extraction ─────────────────────────────────────────────────
  logger.info(TAG, `[1/4] Extracting content from URL...`);
  const { title, text, metadata } = await extract(url);
  logger.info(TAG, `[1/4] Extraction complete`, {
    title,
    wordCount: metadata.wordCount,
    characterCount: metadata.characterCount,
    language: metadata.language,
  });

  // ── Stage 2: Chunking ────────────────────────────────────────────────────
  logger.info(TAG, `[2/4] Chunking extracted text...`);
  const rawChunks = chunker.chunk(text, url);
  logger.info(TAG, `[2/4] Chunking complete`, { chunks_created: rawChunks.length });

  if (rawChunks.length === 0) {
    throw new Error(`[IngestionService] No chunks produced from extracted text for URL: ${url}`);
  }

  // Attach page_title to each chunk for traceability in DB
  const chunks = rawChunks.map((chunk) => ({
    ...chunk,
    page_title: title,
  }));

  // ── Stage 3: Upsert webpage record ──────────────────────────────────────
  logger.info(TAG, `[3/4] Upserting webpage record into database...`);
  const webpageId = await upsertWebpage({ url, title, text, metadata });
  logger.info(TAG, `[3/4] Webpage record saved`, { webpageId, url });

  // ── Stage 4: Embed chunks and persist to pgvector ───────────────────────
  logger.info(TAG, `[4/4] Generating embeddings and storing ${chunks.length} chunks...`);
  const savedChunks = await embeddingService.embedAndStoreChunks(webpageId, chunks);
  logger.info(TAG, `[4/4] Embedding and storage complete`, {
    stored: savedChunks.length,
    webpageId,
  });

  logger.info(TAG, `Pipeline finished successfully`, {
    url,
    title,
    chunks_created: savedChunks.length,
  });

  return {
    source_url: url,
    title,
    chunks_created: savedChunks.length,
    status: 'success',
  };
}
