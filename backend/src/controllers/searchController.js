import { searchSimilarChunks } from '../services/retrievalService.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TAG = 'SEARCH_CTRL';

/**
 * POST /search
 *
 * Request body:  { "query": "What does an LVDT measure?", "topK": 5 }
 * Success (200): { "query": "...", "topK": 5, "results_count": 5, "results": [...] }
 * Error   (4xx): { "error": "...", "code": "...", "status": ... }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function searchController(req, res, next) {
  try {
    const { query, topK } = req.body;

    // ── Input validation ────────────────────────────────────────────────
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new ValidationError(
        'Request body must contain a non-empty "query" string.',
        'MISSING_QUERY',
        400,
      );
    }

    const parsedTopK = topK !== undefined ? parseInt(topK, 10) : 5;

    if (isNaN(parsedTopK) || parsedTopK < 1) {
      throw new ValidationError(
        '"topK" must be a positive integer.',
        'INVALID_TOP_K',
        400,
      );
    }

    logger.info(TAG, `Received search request`, { query: query.trim(), topK: parsedTopK });

    const result = await searchSimilarChunks(query.trim(), parsedTopK);

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

    logger.error(TAG, `Unhandled error during search`, { message: err.message });
    next(err);
  }
}
