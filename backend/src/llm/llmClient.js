import OpenAI from 'openai';
import { getLlmConfig } from '../config/llmConfig.js';
import { logger } from '../utils/logger.js';

const TAG = 'LLM_CLIENT';

/**
 * Thin wrapper around the OpenAI Chat Completions API.
 *
 * Isolates all LLM transport concerns (auth, request format, error handling)
 * so that consumers only deal with messages-in → text-out.
 */
export class LlmClient {
  constructor(customConfig = {}) {
    const config = { ...getLlmConfig(), ...customConfig };

    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;

    if (config.apiKey) {
      this.openai = new OpenAI({ apiKey: config.apiKey });
    } else {
      this.openai = null;
    }
  }

  /**
   * Sends a chat completion request and returns the assistant's reply text.
   *
   * @param {string} systemPrompt - System message that sets the model's behavior
   * @param {string} userPrompt   - User message containing the question + context
   * @param {Object} [options]
   * @param {number} [options.maxTokens]   - Override default max tokens for this call
   * @param {number} [options.temperature] - Override default temperature for this call
   * @returns {Promise<{ text: string, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } }>}
   */
  async chatCompletion(systemPrompt, userPrompt, options = {}) {
    if (!this.openai) {
      throw new Error('[LlmClient] OPENAI_API_KEY is not configured in environment.');
    }

    const maxTokens = options.maxTokens || this.maxTokens;
    const temperature = options.temperature ?? this.temperature;

    logger.info(TAG, `Sending chat completion request`, {
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
        model: this.model,
        finish_reason: response.choices[0].finish_reason,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      });

      return { text, usage };
    } catch (err) {
      if (err.status === 429) {
        throw new Error(`[LlmClient] OpenAI rate limit exceeded (429): ${err.message}`);
      } else if (err.status === 401) {
        throw new Error(`[LlmClient] Invalid OpenAI API Key (401). Please check OPENAI_API_KEY.`);
      } else if (err.status === 400) {
        throw new Error(`[LlmClient] Bad request (400): ${err.message}`);
      }
      throw new Error(`[LlmClient] OpenAI API Error [${err.status || 'UNKNOWN'}]: ${err.message}`);
    }
  }
}
