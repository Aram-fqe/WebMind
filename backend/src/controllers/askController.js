import { ask } from '../services/askService.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TAG = 'ASK_CTRL';

/**
 * POST /ask
 *
 * Full RAG pipeline: question → retrieval → LLM answer
 *
 * Request body:  { "question": "What does an LVDT measure?" }
 * Success (200): { "answer": "...", "sources": [...] }
 * Error   (4xx): { "error": "...", "code": "...", "status": ... }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function askController(req, res, next) {
  try {
    const { question } = req.body;

    // ── Input validation ──────────────────────────────────────────────
    if (!question || typeof question !== 'string' || !question.trim()) {
      throw new ValidationError(
        'Request body must contain a non-empty "question" string.',
        'MISSING_QUESTION',
        400,
      );
    }

    logger.info(TAG, `Received ask request`, { question: question.trim() });

    const result = await ask(question.trim());

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      logger.warn(TAG, `Validation error`, { message: err.message, code: err.code });
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        status: err.status,
      });
    }

    logger.error(TAG, `Unhandled error during ask`, { message: err.message });
    next(err);
  }
}
