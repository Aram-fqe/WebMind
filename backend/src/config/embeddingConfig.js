import dotenv from 'dotenv';

dotenv.config();

export const getEmbeddingConfig = () => {
  return {
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: process.env.EMBEDDING_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '768', 10),
    maxBatchSize: 100 // API safety batch limit per request
  };
};
