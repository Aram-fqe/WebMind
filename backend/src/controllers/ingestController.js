import { ingest } from '../services/ingestionService.js';
import { ValidationError } from '../utils/errors.js';
import { ExtractionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TAG = 'INGEST_CTRL';

/**
 * POST /ingest
 *
 * Request body:  { "url": "https://..." }
 * Success (200): { "source_url": "...", "title": "...", "chunks_created": 12, "status": "success" }
 * Error   (4xx/5xx): { "error": "...", "code": "...", "status": ... }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function ingestController(req, res, next) {
  try {
    const { url } = req.body;

    // ── Input validation ────────────────────────────────────────────────
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new ValidationError(
        'Request body must contain a non-empty "url" string.',
        'MISSING_URL',
        400,
      );
    }

    logger.info(TAG, `Received ingest request`, { url: url.trim() });

    const result = await ingest(url.trim());

    return res.status(200).json(result);
  } catch (err) {
    // Map typed errors to appropriate HTTP status codes
    if (err instanceof ValidationError) {
      logger.warn(TAG, `Validation error`, { message: err.message, code: err.code });
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        status: err.status,
      });
    }

    if (err instanceof ExtractionError) {
      logger.error(TAG, `Extraction error`, { message: err.message, code: err.code, httpStatus: err.status });
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        status: err.status,
      });
    }

    // Pass unexpected errors to the global error handler
    logger.error(TAG, `Unhandled error during ingestion`, { message: err.message });
    next(err);
  }
}
