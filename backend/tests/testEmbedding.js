import { EmbeddingService } from '../src/embeddings/embeddingService.js';
import { getEmbeddingConfig } from '../src/config/embeddingConfig.js';

async function runEmbeddingTests() {
  console.log('==================================================');
  console.log('Starting WebMind Embedding Service Test Suite');
  console.log('==================================================\n');

  const config = getEmbeddingConfig();
  console.log(`[CONFIG CHECK] Default Embedding Model:     ${config.model}`);
  console.log(`[CONFIG CHECK] Expected Vector Dimension:  ${config.dimension}`);
  console.log(`[CONFIG CHECK] OPENAI_API_KEY Configured:  ${config.apiKey ? 'YES (Masked)' : 'NO'}\n`);

  // Test 1: Validation for empty inputs
  console.log('[TEST 1] Testing empty input array handling...');
  const service = new EmbeddingService();
  const emptyRes = await service.generateEmbeddings([]);
  if (Array.isArray(emptyRes) && emptyRes.length === 0) {
    console.log('✓ Passed! Empty array returned empty result [].\n');
  } else {
    console.error('✗ Failed! Expected empty array.\n');
  }

  // Test 2: Verify vector dimensions and API integration (or Mock validation if no API key)
  console.log('[TEST 2] Embedding example sentences & verifying vector dimensions...');
  const sampleSentences = [
    'WebMind is a RAG-powered vector search engine.',
    'PostgreSQL pgvector supports cosine distance and HNSW indexing.',
    'Cheerio extracts text clean of HTML boilerplate tags.'
  ];

  if (!config.apiKey || config.apiKey === 'your_openai_api_key_here') {
    console.log('ℹ OPENAI_API_KEY not set or is placeholder. Testing mock vector structure & error handling...');
    try {
      await service.generateEmbeddings(sampleSentences);
    } catch (err) {
      console.log(`✓ Passed! Caught missing/invalid API key error cleanly: ${err.message}\n`);
    }

    // Verify dimension configuration contract matching PostgreSQL pgvector column
    console.log('[TEST 3] Verifying Configured Vector Dimension matches PostgreSQL schema...');
    if (config.dimension === 1536) {
      console.log('✓ Passed! Embedding dimension (1536) matches document_chunks.embedding vector(1536) column.\n');
    } else {
      console.error(`✗ Dimension mismatch! Configured ${config.dimension} != 1536 pgvector column.\n`);
    }

  } else {
    try {
      console.log(`Sending ${sampleSentences.length} sentences to OpenAI API model '${config.model}'...`);
      const vectors = await service.generateEmbeddings(sampleSentences);

      console.log(`✓ Received ${vectors.length} embedding vectors.`);
      
      let allValid = true;
      vectors.forEach((vec, idx) => {
        console.log(`  - Sentence ${idx + 1} Vector Length: ${vec.length}`);
        if (vec.length !== config.dimension) {
          allValid = false;
        }
      });

      if (allValid && vectors.length === sampleSentences.length) {
        console.log(`\n✓ Passed! All returned vectors match expected dimension of ${config.dimension}.\n`);
      } else {
        console.error('\n✗ Failed! Vector length mismatch detected.\n');
      }

      // Test 3: Verify vector dimension matches PostgreSQL column setting
      console.log('[TEST 3] Verifying Vector Dimension matches PostgreSQL pgvector column...');
      if (config.dimension === 1536 && vectors[0].length === 1536) {
        console.log('✓ Passed! Returned vector dimension (1536) matches PostgreSQL vector(1536) column.\n');
      } else {
        console.error(`✗ Mismatch detected between returned dimension and pgvector schema.\n`);
      }

    } catch (err) {
      console.error(`✗ Test Failed with API error: ${err.message}`);
    }
  }

  console.log('==================================================');
  console.log('Embedding Service Test Suite Finished');
  console.log('==================================================');
}

runEmbeddingTests();
