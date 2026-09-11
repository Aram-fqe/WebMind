import dotenv from 'dotenv';

dotenv.config();

export const getRerankConfig = () => {
  return {
    apiKey: process.env.COHERE_API_KEY,
    model: process.env.RERANK_MODEL || 'rerank-v3.5',
    topN: parseInt(process.env.RERANK_TOP_N || '5', 10),
  };
};
