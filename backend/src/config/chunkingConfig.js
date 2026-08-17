import dotenv from 'dotenv';
dotenv.config();

export const CHUNKING_CONFIG = {
  // Default target tokens per chunk (e.g., 250, 400, 600)
  targetTokens: parseInt(process.env.CHUNK_TARGET_TOKENS || '400', 10),
  
  // Percentage of overlap between consecutive chunks (0.10 = 10%, 0.20 = 20%)
  overlapPercent: parseFloat(process.env.CHUNK_OVERLAP_PERCENT || '0.15'),
  
  // Approximation ratio for token calculation (English text ~4 chars/token)
  approxCharsPerToken: 4,
  
  // Minimum chunk character length to be considered valid
  minChunkLength: 20
};

/**
 * Returns merged chunking settings overriding defaults with custom options.
 * @param {Object} [customOptions] 
 * @returns {Object}
 */
export function getChunkingConfig(customOptions = {}) {
  const targetTokens = customOptions.targetTokens || CHUNKING_CONFIG.targetTokens;
  const overlapPercent = customOptions.overlapPercent !== undefined ? customOptions.overlapPercent : CHUNKING_CONFIG.overlapPercent;
  const approxCharsPerToken = customOptions.approxCharsPerToken || CHUNKING_CONFIG.approxCharsPerToken;
  
  const targetChars = Math.round(targetTokens * approxCharsPerToken);
  const overlapTokens = Math.round(targetTokens * overlapPercent);
  const overlapChars = Math.round(overlapTokens * approxCharsPerToken);

  return {
    targetTokens,
    overlapPercent,
    targetChars,
    overlapTokens,
    overlapChars,
    approxCharsPerToken,
    minChunkLength: CHUNKING_CONFIG.minChunkLength
  };
}
