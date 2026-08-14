import { CheerioExtractor } from './cheerioExtractor.js';

const defaultExtractor = new CheerioExtractor();

/**
 * Main webpage extraction abstraction interface.
 * Hides extraction implementation details (Cheerio now, Playwright in Phase 2).
 * 
 * @param {string} url - Target URL to extract content from
 * @param {Object} [options] - Optional extraction parameters (timeout, etc.)
 * @returns {Promise<{url: string, title: string, text: string, metadata: Object}>}
 */
export async function extract(url, options = {}) {
  return defaultExtractor.extract(url, options);
}

export { CheerioExtractor };
