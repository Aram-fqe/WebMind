import dotenv from 'dotenv';

dotenv.config();

export const getLlmConfig = () => {
  return {
    // Provider selection: 'groq' (default) or 'gemini'
    provider: (process.env.LLM_PROVIDER || 'groq').toLowerCase(),

    // Groq settings (OpenAI-compatible)
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.LLM_MODEL || 'qwen/qwen3.8-27b',

    // Gemini settings (reuses the same API key used for embeddings)
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiBaseUrl: process.env.EMBEDDING_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    geminiModel: process.env.GEMINI_LLM_MODEL || 'gemini-3.5-flash-lite',

    // Shared generation settings
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '768', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.2'),
  };
};
