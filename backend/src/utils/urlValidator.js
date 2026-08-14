import { ValidationError } from './errors.js';

/**
 * Validates and normalizes a target web URL.
 * @param {string} inputUrl 
 * @returns {URL}
 */
export function validateUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    throw new ValidationError('URL must be a non-empty string.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(inputUrl.trim());
  } catch (err) {
    throw new ValidationError(`Invalid URL format: ${inputUrl}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new ValidationError(`Unsupported URL protocol '${parsedUrl.protocol}'. Only http and https are supported.`);
  }

  return parsedUrl;
}
