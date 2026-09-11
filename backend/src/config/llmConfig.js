import dotenv from 'dotenv';

dotenv.config();

export const getLlmConfig = () => {
  return {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.LLM_MODEL || 'qwen/qwen3.8-27b',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.2'),
  };
};
