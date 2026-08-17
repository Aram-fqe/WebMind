import { chunkText } from '../src/chunking/index.js';

function runChunkerTests() {
  console.log('==================================================');
  console.log('Starting WebMind Text Chunker Test Suite');
  console.log('==================================================\n');

  // Test 1: Empty text handling
  console.log('[TEST 1] Testing empty/whitespace text...');
  const emptyChunks = chunkText('', 'https://example.com');
  const spaceChunks = chunkText('   \n\n  ', 'https://example.com');
  if (emptyChunks.length === 0 && spaceChunks.length === 0) {
    console.log('✓ Passed! Empty text returns empty array [].\n');
  } else {
    console.error('✗ Failed! Expected empty array for empty text.\n');
  }

  // Test 2: Short text handling (single chunk)
  console.log('[TEST 2] Testing short text (fits inside 1 chunk)...');
  const shortText = '# Introduction to WebMind\n\nWebMind is a lightweight RAG assistant designed for web page QA.';
  const shortChunks = chunkText(shortText, 'https://example.com/short');
  console.log(`Chunks returned: ${shortChunks.length}`);
  if (shortChunks.length === 1) {
    console.log('✓ Passed! Short text produced exactly 1 chunk.');
    console.log(`  Chunk ID: ${shortChunks[0].chunk_id}`);
    console.log(`  Estimated Tokens: ${shortChunks[0].metadata.tokenCount}\n`);
  } else {
    console.error('✗ Failed! Expected exactly 1 chunk.\n');
  }

  // Test 3: Long text & multi-chunk generation
  console.log('[TEST 3] Testing long multi-paragraph text...');
  const paragraphs = [];
  for (let i = 1; i <= 15; i++) {
    paragraphs.push(`Paragraph ${i}: This is structured text segment number ${i} of the long webpage content. It contains technical descriptions, domain knowledge, and structural information that needs to be properly segmented into chunks for embedding generation and vector retrieval.`);
  }
  const longText = paragraphs.join('\n\n');
  const longChunks = chunkText(longText, 'https://example.com/long', { targetTokens: 100, overlapPercent: 0.20 });
  console.log(`Total text character count: ${longText.length}`);
  console.log(`Total chunks created: ${longChunks.length}`);
  if (longChunks.length > 1) {
    console.log('✓ Passed! Long text split into multiple chunks.');
    longChunks.forEach(c => {
      console.log(`  - Chunk ${c.chunk_index}: ${c.metadata.characterCount} chars (~${c.metadata.tokenCount} tokens)`);
    });
    console.log('');
  } else {
    console.error('✗ Failed! Expected multiple chunks for long text.\n');
  }

  // Test 4: Overlap verification
  console.log('[TEST 4] Verifying overlap between consecutive chunks...');
  if (longChunks.length >= 2) {
    const chunk0 = longChunks[0].text;
    const chunk1 = longChunks[1].text;

    // Check if the last paragraph of chunk 0 exists in chunk 1
    const linesChunk0 = chunk0.split('\n\n');
    const lastParagraphChunk0 = linesChunk0[linesChunk0.length - 1];

    const hasOverlap = chunk1.includes(lastParagraphChunk0);
    if (hasOverlap) {
      console.log('✓ Passed! Overlap verified between Chunk 0 and Chunk 1.');
      console.log(`  Overlapping segment: "${lastParagraphChunk0.substring(0, 60)}..."\n`);
    } else {
      console.error('✗ Failed! Overlap not found between Chunk 0 and Chunk 1.\n');
    }
  }

  // Test 5: Configurable target token sizes (250 vs 400 vs 600)
  console.log('[TEST 5] Testing custom token target configs (250 vs 400 vs 600)...');
  const chunks250 = chunkText(longText, 'https://example.com/doc', { targetTokens: 250 });
  const chunks400 = chunkText(longText, 'https://example.com/doc', { targetTokens: 400 });
  const chunks600 = chunkText(longText, 'https://example.com/doc', { targetTokens: 600 });
  
  console.log(`  - Target 250 tokens -> Chunks: ${chunks250.length}`);
  console.log(`  - Target 400 tokens -> Chunks: ${chunks400.length}`);
  console.log(`  - Target 600 tokens -> Chunks: ${chunks600.length}`);
  
  if (chunks250.length >= chunks400.length && chunks400.length >= chunks600.length) {
    console.log('✓ Passed! Larger token targets correctly yield fewer, larger chunks.\n');
  } else {
    console.error('✗ Failed! Chunk counts do not scale inversely with target token size.\n');
  }

  console.log('==================================================');
  console.log('Text Chunker Test Suite Finished');
  console.log('==================================================');
}

runChunkerTests();
