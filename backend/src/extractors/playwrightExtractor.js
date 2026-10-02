import { chromium } from 'playwright';
import { validateUrl } from '../utils/urlValidator.js';
import { ExtractionError } from '../utils/errors.js';
import { CheerioExtractor } from './cheerioExtractor.js';

const cheerioExtractor = new CheerioExtractor();

export class PlaywrightExtractor {
  /**
   * Extract title, clean text, and metadata from a web page URL using Playwright.
   * Useful for JavaScript-rendered applications.
   * @param {string} targetUrl 
   * @param {Object} [options]
   * @param {number} [options.timeout=15000] Timeout in milliseconds
   * @returns {Promise<{url: string, title: string, text: string, metadata: Object}>}
   */
  async extract(targetUrl, options = {}) {
    const validatedUrl = validateUrl(targetUrl);
    const timeoutMs = options.timeout || 15000;

    let browser;
    try {
      const browserOptions = { headless: true };
      if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) {
        browserOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
      }
      browser = await chromium.launch(browserOptions);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebMindExtractor/1.0 (Playwright)',
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(timeoutMs);

      let response;
      try {
        response = await page.goto(validatedUrl.toString(), {
          waitUntil: 'domcontentloaded',
        });
      } catch (err) {
        if (err.name === 'TimeoutError' || err.message.includes('Timeout')) {
          throw new ExtractionError(`Request timed out after ${timeoutMs}ms while fetching ${validatedUrl}`, 'TIMEOUT', 504);
        }
        throw new ExtractionError(`Network error while fetching ${validatedUrl}: ${err.message}`, 'NETWORK_ERROR', 502);
      }

      if (!response) {
        throw new ExtractionError(`Empty response received from ${validatedUrl}`, 'EMPTY_RESPONSE', 422);
      }

      const status = response.status();
      if (status >= 400) {
        throw new ExtractionError(
          `HTTP Error ${status} (${response.statusText()}) when fetching ${validatedUrl}`,
          'HTTP_ERROR',
          status
        );
      }

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
        throw new ExtractionError(
          `Unsupported content-type '${contentType}'. Expected HTML or plain text.`,
          'UNSUPPORTED_CONTENT_TYPE',
          415
        );
      }

      // Wait a bit for JS to render. Networkidle is often too slow and flaky, so we wait for a sensible state.
      // We will just wait for load state 'networkidle' with a short timeout, and catch if it times out, 
      // continuing with whatever HTML we have.
      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch (e) {
        // Ignore timeout for networkidle, we just take the HTML as is after DOM content loaded + 3s
      }

      const html = await page.content();
      if (!html || !html.trim()) {
        throw new ExtractionError(`Empty response received from ${validatedUrl}`, 'EMPTY_TEXT', 422);
      }

      // Reuse the existing Cheerio HTML parser to maintain identical text cleaning and formatting
      const finalUrl = page.url();
      return cheerioExtractor.parseHtml(finalUrl, html, contentType);

    } catch (error) {
      if (error instanceof ExtractionError) {
        throw error;
      }
      throw new ExtractionError(`Playwright extraction failed: ${error.message}`, 'INTERNAL_ERROR', 500);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}
