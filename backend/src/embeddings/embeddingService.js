import { getEmbeddingConfig } from '../config/embeddingConfig.js';
import { saveChunks } from '../db/repository.js';

export class EmbeddingService {
  constructor(customConfig = {}) {
    const config = { ...getEmbeddingConfig(), ...customConfig };
    
    this.model = config.model;
    this.dimension = config.dimension;
    this.maxBatchSize = config.maxBatchSize || 100;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  /**
   * Generates embedding vectors for an array of input texts using Google Gemini.
   * Handles batching, rate limits, empty inputs, and API errors.
   * 
   * Uses the Gemini batchEmbedContents endpoint:
   *   POST /v1beta/models/{model}:batchEmbedContents?key={apiKey}
   * 
   * @param {string[]} texts Array of text strings to embed
   * @returns {Promise<number[][]>} Array of embedding vectors matching input texts index-for-index
   */
  async generateEmbeddings(texts) {
    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return [];
    }

    // Filter out completely empty/whitespace items while preserving indices structure
    const cleanedTexts = texts.map(t => (typeof t === 'string' ? t.trim() : ''));
    
    if (cleanedTexts.every(t => t.length === 0)) {
      throw new Error('[EmbeddingService] Input array contains no valid non-empty text strings.');
    }

    if (!this.apiKey) {
      throw new Error('[EmbeddingService] GEMINI_API_KEY is not configured in environment.');
    }

    const embeddings = new Array(cleanedTexts.length);
    
    // Batch processing to respect API payload limits
    for (let i = 0; i < cleanedTexts.length; i += this.maxBatchSize) {
      const batchTexts = cleanedTexts.slice(i, i + this.maxBatchSize);
      
      // Replace empty strings in batch with placeholder to prevent API error, then blank out vector
      const validBatchTexts = batchTexts.map(t => t || ' ');

      try {
        // Build Gemini batchEmbedContents request body
        const requests = validBatchTexts.map(text => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          outputDimensionality: this.dimension,
        }));

        const url = `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 429) {
            throw new Error(`[EmbeddingService] Gemini rate limit exceeded (429): ${errorBody}`);
          } else if (response.status === 401 || response.status === 403) {
            throw new Error(`[EmbeddingService] Invalid API Key (${response.status}). Please check GEMINI_API_KEY.`);
          }
          throw new Error(`[EmbeddingService] Gemini API Error [${response.status}]: ${errorBody}`);
        }

        const data = await response.json();

        if (!data || !data.embeddings || !Array.isArray(data.embeddings)) {
          throw new Error('[EmbeddingService] Unexpected response format received from Gemini embedding API.');
        }

        data.embeddings.forEach((item, index) => {
          const originalIndex = i + index;
          if (batchTexts[index] === '') {
            // For empty input, return zero-vector
            embeddings[originalIndex] = new Array(this.dimension).fill(0);
          } else {
            const vector = item.values;
            if (vector.length !== this.dimension) {
              console.warn(
                `[EmbeddingService] Dimension mismatch! Expected ${this.dimension}, received ${vector.length}`
              );
            }
            embeddings[originalIndex] = vector;
          }
        });

      } catch (err) {
        // Re-throw our own formatted errors, wrap unexpected ones
        if (err.message.startsWith('[EmbeddingService]')) {
          throw err;
        }
        throw new Error(`[EmbeddingService] Embedding API Error: ${err.message}`);
      }
    }

    return embeddings;
  }

  /**
   * Accepts chunks, generates embeddings for each, and persists them into pgvector via database layer.
   * 
   * @param {number} webpageId 
   * @param {Array<{chunk_id: string, source_url: string, page_title?: string, chunk_index: number, text: string, metadata?: Object}>} chunks 
   * @returns {Promise<Array>} Inserted database records
   */
  async embedAndStoreChunks(webpageId, chunks) {
    if (!chunks || chunks.length === 0) return [];

    const texts = chunks.map(c => c.text);
    const vectors = await this.generateEmbeddings(texts);

    const chunksWithEmbeddings = chunks.map((chunk, idx) => ({
      ...chunk,
      embedding: vectors[idx]
    }));

    return saveChunks(webpageId, chunksWithEmbeddings);
  }
}

export const embeddingService = new EmbeddingService();
