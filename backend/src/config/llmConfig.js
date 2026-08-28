import dotenv from 'dotenv';

dotenv.config();

export const getLlmConfig = () => {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.2'),
  };
};
