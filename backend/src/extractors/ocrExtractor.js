import { createWorker } from 'tesseract.js';
import { validateUrl } from '../utils/urlValidator.js';
import { ExtractionError } from '../utils/errors.js';

// Maximum image download size (10 MB) — prevents memory exhaustion on huge files
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Minimum meaningful OCR text length (after trimming)
const MIN_OCR_TEXT_LENGTH = 10;

// Supported image MIME types
const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

// URL extensions that strongly suggest an image resource
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Checks whether a URL path ends with a known image extension.
 * Used as a preliminary hint; Content-Type is the authoritative signal.
 * @param {string} urlString
 * @returns {boolean}
 */
export function looksLikeImageUrl(urlString) {
  try {
    const pathname = new URL(urlString).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Checks whether a Content-Type header value is a supported image MIME type.
 * @param {string} contentType
 * @returns {boolean}
 */
export function isSupportedImageContentType(contentType) {
  if (!contentType) return false;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return SUPPORTED_IMAGE_TYPES.includes(mime);
}

export class OcrExtractor {
  /**
   * Extract text from an image URL using Tesseract.js OCR.
   *
   * Follows the same interface as CheerioExtractor and PlaywrightExtractor:
   *   extract(targetUrl, options) → { url, title, text, metadata }
   *
   * Pipeline:
   *   1. Validate URL
   *   2. Download image (with size limit)
   *   3. Validate Content-Type is a supported image MIME
   *   4. Run Tesseract OCR on the image buffer
   *   5. Validate extracted text is meaningful
   *   6. Return result in the standard extractor shape
   *
   * @param {string} targetUrl
   * @param {Object} [options]
   * @param {number} [options.timeout=30000] Timeout in milliseconds
   * @returns {Promise<{url: string, title: string, text: string, metadata: Object}>}
   */
  async extract(targetUrl, options = {}) {
    const validatedUrl = validateUrl(targetUrl);
    const timeoutMs = options.timeout || 30000;

    // ── Step 1: Download the image ────────────────────────────────────────
    let response;
    try {
      response = await fetch(validatedUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebMindExtractor/1.0',
          'Accept': 'image/png,image/jpeg,image/webp,*/*',
        },
      });
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new ExtractionError(
          `Request timed out after ${timeoutMs}ms while fetching ${validatedUrl}`,
          'TIMEOUT',
          504,
        );
      }
      throw new ExtractionError(
        `Network error while fetching ${validatedUrl}: ${err.message}`,
        'NETWORK_ERROR',
        502,
      );
    }

    if (!response.ok) {
      throw new ExtractionError(
        `HTTP Error ${response.status} (${response.statusText}) when fetching ${validatedUrl}`,
        'HTTP_ERROR',
        response.status,
      );
    }

    // ── Step 2: Validate Content-Type ─────────────────────────────────────
    const contentType = response.headers.get('content-type') || '';
    if (!isSupportedImageContentType(contentType)) {
      throw new ExtractionError(
        `Unsupported content-type '${contentType}' for OCR. Expected one of: ${SUPPORTED_IMAGE_TYPES.join(', ')}.`,
        'UNSUPPORTED_CONTENT_TYPE',
        415,
      );
    }

    // ── Step 3: Download image bytes with size guard ──────────────────────
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
      throw new ExtractionError(
        `Image too large (${contentLength} bytes). Maximum allowed: ${MAX_IMAGE_BYTES} bytes.`,
        'IMAGE_TOO_LARGE',
        413,
      );
    }

    let imageBuffer;
    try {
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
        throw new ExtractionError(
          `Image too large (${arrayBuffer.byteLength} bytes). Maximum allowed: ${MAX_IMAGE_BYTES} bytes.`,
          'IMAGE_TOO_LARGE',
          413,
        );
      }
      if (arrayBuffer.byteLength === 0) {
        throw new ExtractionError(
          `Empty image response received from ${validatedUrl}`,
          'EMPTY_RESPONSE',
          422,
        );
      }
      imageBuffer = Buffer.from(arrayBuffer);
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError(
        `Failed to download image from ${validatedUrl}: ${err.message}`,
        'DOWNLOAD_ERROR',
        502,
      );
    }

    // ── Step 4: Run Tesseract OCR ─────────────────────────────────────────
    let ocrText;
    let worker;
    try {
      worker = await createWorker('eng');
      const { data } = await worker.recognize(imageBuffer);
      ocrText = data.text;
    } catch (err) {
      throw new ExtractionError(
        `OCR processing failed for ${validatedUrl}: ${err.message}`,
        'OCR_FAILED',
        422,
      );
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }

    // ── Step 5: Validate OCR output ───────────────────────────────────────
    const cleanText = (ocrText || '')
      .split('\n')
      .map(line => line.replace(/[ \t]+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n\n');

    if (!cleanText || cleanText.length < MIN_OCR_TEXT_LENGTH) {
      throw new ExtractionError(
        `OCR produced no meaningful text from image at ${validatedUrl}`,
        'EMPTY_TEXT',
        422,
      );
    }

    // ── Step 6: Build result in the standard extractor shape ──────────────
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
    const filename = validatedUrl.pathname.split('/').pop() || 'Untitled Image';

    return {
      url: validatedUrl.toString(),
      title: `OCR: ${filename}`,
      text: cleanText,
      metadata: {
        contentType: contentType.split(';')[0].trim(),
        wordCount,
        characterCount: cleanText.length,
        imageSize: imageBuffer.length,
        extractedAt: new Date().toISOString(),
      },
    };
  }
}
