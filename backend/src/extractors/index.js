import { CheerioExtractor } from './cheerioExtractor.js';
import { PlaywrightExtractor } from './playwrightExtractor.js';

const cheerioExtractor = new CheerioExtractor();
const playwrightExtractor = new PlaywrightExtractor();

const MIN_EXTRACTED_TEXT_LENGTH = 150;

/**
 * Main webpage extraction abstraction interface.
 * Hides extraction implementation details.
 * Attempts Cheerio first. If extraction fails due to empty text or returns
 * insufficiently long text (often indicating a JS-rendered SPA), falls back to Playwright.
 * 
 * @param {string} url - Target URL to extract content from
 * @param {Object} [options] - Optional extraction parameters (timeout, etc.)
 * @returns {Promise<{url: string, title: string, text: string, metadata: Object}>}
 */
export async function extract(url, options = {}) {
  try {
    const result = await cheerioExtractor.extract(url, options);
    
    // Evaluate extracted text quality
    if (result.text.length >= MIN_EXTRACTED_TEXT_LENGTH) {
      result.metadata.extractor = 'cheerio';
      return result;
    }
    // If text is too short, we fall through to try Playwright
  } catch (error) {
    // If Cheerio throws EMPTY_TEXT or EMPTY_RESPONSE, it's likely a JS-heavy page.
    // We also want to try Playwright if there is a 403, as sometimes JS-rendered 
    // cloudflare pages or bot-protection block simple fetches.
    // However, for 404, TIMEOUT, or NETWORK_ERROR, we should fail fast as Playwright will likely fail too.
    const failFastCodes = ['TIMEOUT', 'NETWORK_ERROR', 'UNSUPPORTED_CONTENT_TYPE'];
    if (error.code && failFastCodes.includes(error.code)) {
      throw error;
    }
    if (error.status === 404) {
      throw error;
    }
    // For other errors (EMPTY_TEXT, EMPTY_RESPONSE, HTTP 403, etc), fall through to Playwright
  }

  // Fallback to Playwright
  const result = await playwrightExtractor.extract(url, options);
  result.metadata.extractor = 'playwright';
  return result;
}

export { CheerioExtractor, PlaywrightExtractor };
