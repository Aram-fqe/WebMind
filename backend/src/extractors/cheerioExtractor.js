import * as cheerio from 'cheerio';
import { validateUrl } from '../utils/urlValidator.js';
import { ExtractionError } from '../utils/errors.js';

export class CheerioExtractor {
  /**
   * Extract title, clean text, and metadata from a web page URL.
   * @param {string} targetUrl 
   * @param {Object} [options]
   * @param {number} [options.timeout=15000] Timeout in milliseconds
   * @returns {Promise<{url: string, title: string, text: string, metadata: Object}>}
   */
  async extract(targetUrl, options = {}) {
    const validatedUrl = validateUrl(targetUrl);
    const timeoutMs = options.timeout || 15000;

    let response;
    try {
      response = await fetch(validatedUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebMindExtractor/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new ExtractionError(`Request timed out after ${timeoutMs}ms while fetching ${validatedUrl}`, 'TIMEOUT', 504);
      }
      throw new ExtractionError(`Network error while fetching ${validatedUrl}: ${err.message}`, 'NETWORK_ERROR', 502);
    }

    if (!response.ok) {
      throw new ExtractionError(
        `HTTP Error ${response.status} (${response.statusText}) when fetching ${validatedUrl}`,
        'HTTP_ERROR',
        response.status
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      throw new ExtractionError(
        `Unsupported content-type '${contentType}'. Expected HTML or plain text.`,
        'UNSUPPORTED_CONTENT_TYPE',
        415
      );
    }

    const html = await response.text();
    if (!html || !html.trim()) {
      throw new ExtractionError(`Empty response received from ${validatedUrl}`, 'EMPTY_RESPONSE', 422);
    }

    return this.parseHtml(validatedUrl.toString(), html, contentType);
  }

  /**
   * Parses HTML string and cleans boilerplate.
   * @param {string} url 
   * @param {string} html 
   * @param {string} contentType 
   * @returns {{url: string, title: string, text: string, metadata: Object}}
   */
  parseHtml(url, html, contentType) {
    const $ = cheerio.load(html);

    // Metadata extraction before stripping elements
    const pageTitle = (
      $('head title').text() ||
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      'Untitled Page'
    ).trim().replace(/\s+/g, ' ');

    const description = (
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
    ).trim();

    const canonicalUrl = $('link[rel="canonical"]').attr('href') || url;
    const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content') || 'unknown';

    // Strip scripts, styles, boilerplate, and navigational noise
    const noiseSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'svg',
      'canvas',
      'nav',
      'header',
      'footer',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '.nav',
      '.navbar',
      '.footer',
      '.header',
      '.sidebar',
      '.ad',
      '.ads',
      '.advertisement',
      '#cookie-banner',
      '.cookie-banner'
    ];

    $(noiseSelectors.join(', ')).remove();

    // Prefer main content container if available to avoid sidebars/modals
    let $root = $('main, article, [role="main"]').first();
    if (!$root.length) {
      $root = $('body');
    }
    if (!$root.length) {
      $root = $.root();
    }

    // Replace break tags with explicit newlines
    $root.find('br').replaceWith('\n');

    // Add structural markers and line breaks for key elements
    $root.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const $el = $(el);
      const tag = el.tagName.toLowerCase();
      const level = parseInt(tag.substring(1), 10);
      const prefix = '#'.repeat(level) + ' ';
      $el.text(`\n\n${prefix}${$el.text().trim()}\n`);
    });

    $root.find('p, blockquote, tr, section, div').before('\n');

    $root.find('li').each((_, el) => {
      const $el = $(el);
      $el.text(`\n- ${$el.text().trim()}`);
    });

    // Extract text and normalize line breaks/spaces
    let rawText = $root.text();

    const cleanText = rawText
      .split('\n')
      .map(line => line.replace(/[ \t]+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n\n');

    if (!cleanText || cleanText.length < 10) {
      throw new ExtractionError(`No meaningful readable text could be extracted from ${url}`, 'EMPTY_TEXT', 422);
    }

    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    return {
      url,
      title: pageTitle,
      text: cleanText,
      metadata: {
        canonicalUrl,
        description,
        language,
        contentType,
        wordCount,
        characterCount: cleanText.length,
        extractedAt: new Date().toISOString()
      }
    };
  }
}
