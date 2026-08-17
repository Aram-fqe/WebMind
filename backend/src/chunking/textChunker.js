import { getChunkingConfig } from '../config/chunkingConfig.js';

export class TextChunker {
  /**
   * Estimates token count based on character length.
   * @param {string} text 
   * @param {number} approxCharsPerToken 
   * @returns {number}
   */
  estimateTokens(text, approxCharsPerToken = 4) {
    if (!text) return 0;
    return Math.ceil(text.length / approxCharsPerToken);
  }

  /**
   * Splits input text into structured paragraphs and sentences if necessary.
   * @param {string} text 
   * @param {number} maxCharsPerUnit 
   * @returns {string[]}
   */
  splitIntoUnits(text, maxCharsPerUnit) {
    if (!text || !text.trim()) return [];

    // First split by double newlines (paragraphs)
    const rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const units = [];

    for (const paragraph of rawParagraphs) {
      if (paragraph.length <= maxCharsPerUnit) {
        units.push(paragraph);
      } else {
        // Break large paragraphs down by sentences or single newlines
        const sentences = paragraph.split(/(?<=[.?!])\s+|\n+/).map(s => s.trim()).filter(Boolean);
        let tempUnit = '';

        for (const sentence of sentences) {
          if ((tempUnit + ' ' + sentence).length <= maxCharsPerUnit) {
            tempUnit = tempUnit ? `${tempUnit} ${sentence}` : sentence;
          } else {
            if (tempUnit) units.push(tempUnit);
            if (sentence.length > maxCharsPerUnit) {
              // Fallback for extremely long single strings without spaces/punctuation
              for (let i = 0; i < sentence.length; i += maxCharsPerUnit) {
                units.push(sentence.substring(i, i + maxCharsPerUnit));
              }
              tempUnit = '';
            } else {
              tempUnit = sentence;
            }
          }
        }
        if (tempUnit) units.push(tempUnit);
      }
    }

    return units;
  }

  /**
   * Main chunking method preserving section/paragraph boundaries.
   * @param {string} text Cleaned webpage text
   * @param {string} [sourceUrl=''] Source webpage URL
   * @param {Object} [options] Custom chunking options (targetTokens, overlapPercent, etc.)
   * @returns {Array<{chunk_id: string, source_url: string, chunk_index: number, text: string, metadata: Object}>}
   */
  chunk(text, sourceUrl = '', options = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return [];
    }

    const config = getChunkingConfig(options);
    const units = this.splitIntoUnits(text, config.targetChars);

    if (units.length === 0) return [];

    const chunks = [];
    let currentUnits = [];
    let currentChars = 0;
    let chunkIndex = 0;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const unitChars = unit.length + 2; // accounting for \n\n joining

      if (currentChars + unitChars > config.targetChars && currentUnits.length > 0) {
        // Finalize current chunk
        const chunkText = currentUnits.join('\n\n');
        chunks.push(this.createChunkObject(chunkText, sourceUrl, chunkIndex++, config));

        // Compute overlap buffer for next chunk
        const overlapUnits = [];
        let overlapAccumulator = 0;

        for (let j = currentUnits.length - 1; j >= 0; j--) {
          const revUnit = currentUnits[j];
          if (overlapAccumulator + revUnit.length <= config.overlapChars || overlapUnits.length === 0) {
            overlapUnits.unshift(revUnit);
            overlapAccumulator += revUnit.length;
          } else {
            break;
          }
        }

        currentUnits = [...overlapUnits, unit];
        currentChars = currentUnits.reduce((acc, u) => acc + u.length + 2, 0);
      } else {
        currentUnits.push(unit);
        currentChars += unitChars;
      }
    }

    // Push final remaining chunk
    if (currentUnits.length > 0) {
      const finalChunkText = currentUnits.join('\n\n');
      if (finalChunkText.length >= config.minChunkLength || chunks.length === 0) {
        chunks.push(this.createChunkObject(finalChunkText, sourceUrl, chunkIndex++, config));
      }
    }

    return chunks;
  }

  /**
   * Helper to format a single chunk result object.
   * @param {string} text 
   * @param {string} sourceUrl 
   * @param {number} chunkIndex 
   * @param {Object} config 
   * @returns {{chunk_id: string, source_url: string, chunk_index: number, text: string, metadata: Object}}
   */
  createChunkObject(text, sourceUrl, chunkIndex, config) {
    const tokenCount = this.estimateTokens(text, config.approxCharsPerToken);
    const cleanUrl = sourceUrl || 'unknown-source';
    const chunkId = `${cleanUrl}#chunk-${chunkIndex}`;

    return {
      chunk_id: chunkId,
      source_url: sourceUrl,
      chunk_index: chunkIndex,
      text,
      metadata: {
        tokenCount,
        characterCount: text.length,
        targetTokensConfigured: config.targetTokens,
        overlapPercentConfigured: config.overlapPercent
      }
    };
  }
}
