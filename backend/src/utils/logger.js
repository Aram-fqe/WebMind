/**
 * Lightweight structured logger for WebMind backend.
 * Outputs ISO timestamps + log levels to stdout/stderr.
 * NEVER logs API keys, passwords, or connection strings.
 */

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /database_url/i,
];

/**
 * Redact sensitive fields from an object before logging.
 * @param {unknown} value
 * @returns {unknown}
 */
function redact(value) {
  if (typeof value !== 'object' || value === null) return value;
  const safe = Array.isArray(value) ? [...value] : { ...value };
  for (const key of Object.keys(safe)) {
    if (SENSITIVE_PATTERNS.some((p) => p.test(key))) {
      safe[key] = '[REDACTED]';
    } else if (typeof safe[key] === 'object') {
      safe[key] = redact(safe[key]);
    }
  }
  return safe;
}

function formatMessage(level, tag, message, meta) {
  const ts = new Date().toISOString();
  const tagStr = tag ? `[${tag}] ` : '';
  const metaStr = meta !== undefined ? ' ' + JSON.stringify(redact(meta)) : '';
  return `${ts} ${level} ${tagStr}${message}${metaStr}`;
}

export const logger = {
  info(tag, message, meta) {
    console.log(formatMessage('[INFO] ', tag, message, meta));
  },
  warn(tag, message, meta) {
    console.warn(formatMessage('[WARN] ', tag, message, meta));
  },
  error(tag, message, meta) {
    console.error(formatMessage('[ERROR]', tag, message, meta));
  },
};
