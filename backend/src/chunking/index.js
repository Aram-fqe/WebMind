import { TextChunker } from './textChunker.js';

const defaultChunker = new TextChunker();

/**
 * Text chunking abstraction interface.
 * 
 * @param {string} text - Cleaned text content
 * @param {string} [sourceUrl=''] - Source URL for metadata tracking
 * @param {Object} [options] - Custom options (targetTokens: 250|400|600, overlapPercent: 0.15)
 * @returns {Array<{chunk_id: string, source_url: string, chunk_index: number, text: string, metadata: Object}>}
 */
export function chunkText(text, sourceUrl = '', options = {}) {
  return defaultChunker.chunk(text, sourceUrl, options);
}

export { TextChunker };
