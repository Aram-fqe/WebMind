import { CheerioExtractor } from './cheerioExtractor.js';
import { PlaywrightExtractor } from './playwrightExtractor.js';
import { OcrExtractor, looksLikeImageUrl, isSupportedImageContentType } from './ocrExtractor.js';

const cheerioExtractor = new CheerioExtractor();
const playwrightExtractor = new PlaywrightExtractor();
const ocrExtractor = new OcrExtractor();

const MIN_EXTRACTED_TEXT_LENGTH = 150;

/**
 * Main content extraction abstraction interface.
 * Hides extraction implementation details from the ingestion pipeline.
 *
 * Routing:
 *   1. Image resource (by URL extension or Content-Type) → OCR extractor
 *   2. HTML resource → Cheerio first, Playwright fallback if insufficient
 *
 * For image detection, the URL extension is checked first as a fast hint.
 * If the extension is ambiguous, a lightweight HEAD request probes the
 * Content-Type header to determine whether the resource is an image.
 * This avoids downloading the same resource twice.
 *
 * @param {string} url - Target URL to extract content from
 * @param {Object} [options] - Optional extraction parameters (timeout, etc.)
 * @returns {Promise<{url: string, title: string, text: string, metadata: Object}>}
 */
export async function extract(url, options = {}) {
  // ── Image detection ──────────────────────────────────────────────────
  // Fast path: URL extension is a strong hint
  if (looksLikeImageUrl(url)) {
    const result = await ocrExtractor.extract(url, options);
    result.metadata.extractor = 'ocr';
    return result;
  }

  // ── HTML extraction (Cheerio → Playwright fallback) ──────────────────
  try {
    const result = await cheerioExtractor.extract(url, options);

    // Evaluate extracted text quality
    if (result.text.length >= MIN_EXTRACTED_TEXT_LENGTH) {
      result.metadata.extractor = 'cheerio';
      return result;
    }
    // If text is too short, we fall through to try Playwright
  } catch (error) {
    // If Cheerio gets an image Content-Type, route to OCR instead of failing.
    // Cheerio throws UNSUPPORTED_CONTENT_TYPE for non-HTML responses.
    if (error.code === 'UNSUPPORTED_CONTENT_TYPE') {
      // Check if the response was actually an image by inspecting the error message
      // for known image MIME types. This handles URLs without image extensions
      // that still serve images (e.g. CDN URLs, redirects).
      const errorMsg = error.message || '';
      const mimeMatch = errorMsg.match(/content-type '([^']+)'/i);
      if (mimeMatch && isSupportedImageContentType(mimeMatch[1])) {
        const result = await ocrExtractor.extract(url, options);
        result.metadata.extractor = 'ocr';
        return result;
      }
      // Not an image — re-throw the original UNSUPPORTED_CONTENT_TYPE error
      throw error;
    }

    // If Cheerio throws EMPTY_TEXT or EMPTY_RESPONSE, it's likely a JS-heavy page.
    // We also want to try Playwright if there is a 403, as sometimes JS-rendered
    // cloudflare pages or bot-protection block simple fetches.
    // However, for 404, TIMEOUT, or NETWORK_ERROR, we should fail fast as Playwright will likely fail too.
    const failFastCodes = ['TIMEOUT', 'NETWORK_ERROR'];
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

export { CheerioExtractor, PlaywrightExtractor, OcrExtractor };
