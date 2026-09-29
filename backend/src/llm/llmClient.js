import OpenAI from 'openai';
import { getLlmConfig } from '../config/llmConfig.js';
import { logger } from '../utils/logger.js';

const TAG = 'LLM_CLIENT';

/**
 * Thin wrapper around LLM providers for chat completions.
 *
 * Supported providers:
 *   - 'groq'   — OpenAI-compatible SDK (default, existing behavior)
 *   - 'gemini' — Google Gemini REST API via fetch()
 *
 * Isolates all LLM transport concerns (auth, request format, error handling)
 * so that consumers only deal with messages-in → text-out.
 *
 * Both providers return the same shape:
 *   { text: string, usage: { prompt_tokens, completion_tokens, total_tokens }, finish_reason: string }
 */
export class LlmClient {
  constructor(customConfig = {}) {
    const config = { ...getLlmConfig(), ...customConfig };

    this.provider = config.provider;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;

    if (this.provider === 'gemini') {
      // Gemini path — raw fetch, same pattern as embeddingService
      this.geminiApiKey = config.geminiApiKey;
      this.geminiBaseUrl = config.geminiBaseUrl;
      this.geminiModel = config.geminiModel;
      this.model = config.geminiModel; // for logging consistency
      this.openai = null;

      if (!this.geminiApiKey) {
        logger.warn(TAG, 'LLM_PROVIDER is gemini but GEMINI_API_KEY is not set.');
      }
    } else {
      // Groq path — OpenAI SDK (existing behavior)
      this.model = config.model;

      if (config.apiKey) {
        this.openai = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl,
          maxRetries: 0,
        });
      } else {
        this.openai = null;
      }
    }

    logger.info(TAG, `LLM client initialized`, { provider: this.provider, model: this.model });
  }

  /**
   * Sends a chat completion request and returns the assistant's reply text.
   *
   * @param {string} systemPrompt - System message that sets the model's behavior
   * @param {string} userPrompt   - User message containing the question + context
   * @param {Object} [options]
   * @param {number} [options.maxTokens]   - Override default max tokens for this call
   * @param {number} [options.temperature] - Override default temperature for this call
   * @returns {Promise<{ text: string, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number }, finish_reason: string }>}
   */
  async chatCompletion(systemPrompt, userPrompt, options = {}) {
    if (this.provider === 'gemini') {
      return this._geminiCompletion(systemPrompt, userPrompt, options);
    }
    return this._groqCompletion(systemPrompt, userPrompt, options);
  }

  // ── Groq (OpenAI-compatible) ──────────────────────────────────────────

  async _groqCompletion(systemPrompt, userPrompt, options) {
    if (!this.openai) {
      throw new Error('[LlmClient] GROQ_API_KEY is not configured in environment.');
    }

    const maxTokens = options.maxTokens || this.maxTokens;
    const temperature = options.temperature ?? this.temperature;

    logger.info(TAG, `Sending chat completion request`, {
      provider: 'groq',
      model: this.model,
      maxTokens,
      temperature,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('[LlmClient] Unexpected response format — no choices returned.');
      }

      const text = response.choices[0].message.content || '';
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      logger.info(TAG, `Chat completion received`, {
        provider: 'groq',
        model: this.model,
        finish_reason: response.choices[0].finish_reason,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      });

      return { text, usage, finish_reason: response.choices[0].finish_reason };
    } catch (err) {
      if (err.status === 429) {
        throw new Error(`[LlmClient] LLM provider rate limit exceeded (429): ${err.message}`);
      } else if (err.status === 401) {
        throw new Error(`[LlmClient] Invalid API Key (401). Please check GROQ_API_KEY.`);
      } else if (err.status === 400) {
        throw new Error(`[LlmClient] Bad request (400): ${err.message}`);
      }
      throw new Error(`[LlmClient] LLM API Error [${err.status || 'UNKNOWN'}]: ${err.message}`);
    }
  }

  // ── Gemini (REST API via fetch) ───────────────────────────────────────

  async _geminiCompletion(systemPrompt, userPrompt, options) {
    if (!this.geminiApiKey) {
      throw new Error('[LlmClient] GEMINI_API_KEY is not configured in environment.');
    }

    const maxTokens = options.maxTokens || this.maxTokens;
    const temperature = options.temperature ?? this.temperature;

    logger.info(TAG, `Sending chat completion request`, {
      provider: 'gemini',
      model: this.geminiModel,
      maxTokens,
      temperature,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
    });

    const url = `${this.geminiBaseUrl}/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 429) {
          throw new Error(`[LlmClient] Gemini rate limit exceeded (429): ${errorBody}`);
        } else if (response.status === 401 || response.status === 403) {
          throw new Error(`[LlmClient] Invalid Gemini API Key (${response.status}). Please check GEMINI_API_KEY.`);
        } else if (response.status === 400) {
          throw new Error(`[LlmClient] Gemini bad request (400): ${errorBody}`);
        }
        throw new Error(`[LlmClient] Gemini API Error [${response.status}]: ${errorBody}`);
      }

      const data = await response.json();

      if (!data || !data.candidates || data.candidates.length === 0) {
        throw new Error('[LlmClient] Unexpected Gemini response format — no candidates returned.');
      }

      const candidate = data.candidates[0];
      const text = candidate.content?.parts?.map((p) => p.text).join('') || '';

      // Map Gemini finishReason to OpenAI-style finish_reason
      const geminiFinishReason = (candidate.finishReason || 'STOP').toUpperCase();
      const finish_reason = geminiFinishReason === 'STOP' ? 'stop' : geminiFinishReason.toLowerCase();

      // Map Gemini usageMetadata to OpenAI-style usage object
      const meta = data.usageMetadata || {};
      const usage = {
        prompt_tokens: meta.promptTokenCount || 0,
        completion_tokens: meta.candidatesTokenCount || 0,
        total_tokens: meta.totalTokenCount || 0,
      };

      logger.info(TAG, `Chat completion received`, {
        provider: 'gemini',
        model: this.geminiModel,
        finish_reason,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      });

      return { text, usage, finish_reason };
    } catch (err) {
      // Re-throw our own formatted errors
      if (err.message.startsWith('[LlmClient]')) {
        throw err;
      }
      throw new Error(`[LlmClient] Gemini API Error [UNKNOWN]: ${err.message}`);
    }
  }
}
