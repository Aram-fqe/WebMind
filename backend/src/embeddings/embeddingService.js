import OpenAI from 'openai';
import { getEmbeddingConfig } from '../config/embeddingConfig.js';
import { saveChunks } from '../db/repository.js';

export class EmbeddingService {
  constructor(customConfig = {}) {
    const config = { ...getEmbeddingConfig(), ...customConfig };
    
    this.model = config.model;
    this.dimension = config.dimension;
    this.maxBatchSize = config.maxBatchSize || 100;
    
    if (config.apiKey) {
      this.openai = new OpenAI({ apiKey: config.apiKey });
    } else {
      this.openai = null;
    }
  }

  /**
   * Generates embedding vectors for an array of input texts.
   * Handles batching, rate limits, empty inputs, and API errors.
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

    if (!this.openai) {
      throw new Error('[EmbeddingService] OPENAI_API_KEY is not configured in environment.');
    }

    const embeddings = new Array(cleanedTexts.length);
    
    // Batch processing to respect API payload limits
    for (let i = 0; i < cleanedTexts.length; i += this.maxBatchSize) {
      const batchTexts = cleanedTexts.slice(i, i + this.maxBatchSize);
      
      // Replace empty strings in batch with placeholder to prevent API error, then blank out vector
      const validBatchTexts = batchTexts.map(t => t || ' ');

      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: validBatchTexts,
          encoding_format: 'float'
        });

        if (!response || !response.data || !Array.isArray(response.data)) {
          throw new Error('[EmbeddingService] Unexpected response format received from OpenAI API.');
        }

        response.data.forEach((item, index) => {
          const originalIndex = i + index;
          if (batchTexts[index] === '') {
            // For empty input, return zero-vector
            embeddings[originalIndex] = new Array(this.dimension).fill(0);
          } else {
            if (item.embedding.length !== this.dimension) {
              console.warn(
                `[EmbeddingService] Dimension mismatch! Expected ${this.dimension}, received ${item.embedding.length}`
              );
            }
            embeddings[originalIndex] = item.embedding;
          }
        });

      } catch (err) {
        if (err.status === 429) {
          throw new Error(`[EmbeddingService] OpenAI Rate limit exceeded (429): ${err.message}`);
        } else if (err.status === 401) {
          throw new Error(`[EmbeddingService] Invalid OpenAI API Key (401). Please check OPENAI_API_KEY.`);
        }
        throw new Error(`[EmbeddingService] OpenAI API Error [${err.status || 'UNKNOWN'}]: ${err.message}`);
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
