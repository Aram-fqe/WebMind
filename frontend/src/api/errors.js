/**
 * Custom error class for WebMind API responses.
 *
 * Normalizes all API error sources (network failures, HTTP errors, backend
 * error responses) into a single predictable shape that UI components can
 * rely on without parsing raw fetch exceptions.
 *
 * Shape:
 *   - message  — human-readable, safe to display to the user
 *   - code     — machine-readable error code from the backend (e.g. 'MISSING_URL')
 *                or a client-side code (e.g. 'NETWORK_ERROR', 'PARSE_ERROR')
 *   - status   — HTTP status number, or 0 for network failures
 */
export class ApiError extends Error {
  /**
   * @param {string} message  — User-friendly error message
   * @param {string} code     — Machine-readable error code
   * @param {number} status   — HTTP status code (0 if not applicable)
   */
  constructor(message, code = 'UNKNOWN_ERROR', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}
