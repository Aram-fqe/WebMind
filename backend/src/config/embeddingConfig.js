import dotenv from 'dotenv';

dotenv.config();

export const getEmbeddingConfig = () => {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10),
    maxBatchSize: 100 // OpenAI API safety batch limit per request
  };
};
