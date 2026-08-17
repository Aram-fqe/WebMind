import { query } from './client.js';

/**
 * Inserts or updates a webpage entry.
 * @param {{url: string, title: string, text: string, metadata: Object}} page 
 * @returns {Promise<number>} webpage record id
 */
export async function upsertWebpage({ url, title, text, metadata }) {
  const sql = `
    INSERT INTO webpages (url, title, extracted_text, metadata)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (url) DO UPDATE SET
      title = EXCLUDED.title,
      extracted_text = EXCLUDED.extracted_text,
      metadata = EXCLUDED.metadata,
      created_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;
  const result = await query(sql, [url, title || '', text, JSON.stringify(metadata || {})]);
  return result.rows[0].id;
}

/**
 * Inserts an array of text chunks with their vector embeddings into document_chunks.
 * @param {number} webpageId 
 * @param {Array<{chunk_id: string, source_url: string, chunk_index: number, text: string, embedding?: number[], metadata?: Object}>} chunks 
 */
export async function saveChunks(webpageId, chunks) {
  if (!chunks || chunks.length === 0) return [];

  // Delete old chunks for this webpage if re-indexing
  await query('DELETE FROM document_chunks WHERE webpage_id = $1;', [webpageId]);

  const inserted = [];
  for (const chunk of chunks) {
    const vectorString = chunk.embedding ? `[${chunk.embedding.join(',')}]` : null;
    
    const sql = `
      INSERT INTO document_chunks (chunk_id, webpage_id, source_url, chunk_index, text, embedding, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
      RETURNING id, chunk_id, chunk_index, text, metadata;
    `;
    const params = [
      chunk.chunk_id,
      webpageId,
      chunk.source_url,
      chunk.chunk_index,
      chunk.text,
      vectorString,
      JSON.stringify(chunk.metadata || {})
    ];

    const res = await query(sql, params);
    inserted.push(res.rows[0]);
  }

  return inserted;
}

/**
 * Performs semantic vector similarity search using cosine distance (<=>).
 * Returns chunks with calculated similarity_score = (1 - cosine_distance).
 * 
 * @param {number[]} queryVector - 1536-dimensional embedding vector
 * @param {Object} [options]
 * @param {number} [options.limit=5] - Number of top chunks to retrieve (Top-K)
 * @param {string} [options.sourceUrl] - Optional URL filter
 * @returns {Promise<Array<{chunk_id: string, source_url: string, chunk_index: number, text: string, similarity_score: number, metadata: Object}>>}
 */
export async function searchSimilarChunks(queryVector, options = {}) {
  const limit = options.limit || 5;
  const sourceUrl = options.sourceUrl || null;

  const vectorString = `[${queryVector.join(',')}]`;

  let sql = `
    SELECT 
      chunk_id,
      source_url,
      chunk_index,
      text,
      metadata,
      (1 - (embedding <=> $1::vector)) AS similarity_score
    FROM document_chunks
    WHERE embedding IS NOT NULL
  `;

  const params = [vectorString];

  if (sourceUrl) {
    params.push(sourceUrl);
    sql += ` AND source_url = $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY embedding <=> $1::vector ASC LIMIT $${params.length};`;

  const result = await query(sql, params);

  return result.rows.map(row => ({
    chunk_id: row.chunk_id,
    source_url: row.source_url,
    chunk_index: row.chunk_index,
    text: row.text,
    similarity_score: parseFloat(row.similarity_score.toFixed(4)),
    metadata: row.metadata
  }));
}
