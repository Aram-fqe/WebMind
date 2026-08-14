import { extract } from '../src/extractors/index.js';

async function runTests() {
  console.log('==================================================');
  console.log('Starting WebMind Extractor Test Suite');
  console.log('==================================================\n');

  // Test 1: Real static page extraction
  const testUrl = 'https://example.com';
  console.log(`[TEST 1] Extracting real webpage: ${testUrl}`);
  try {
    const result = await extract(testUrl);
    console.log('✓ Extraction Success!');
    console.log('--------------------------------------------------');
    console.log(`URL:           ${result.url}`);
    console.log(`Title:         ${result.title}`);
    console.log(`Word Count:    ${result.metadata.wordCount}`);
    console.log(`Char Count:    ${result.metadata.characterCount}`);
    console.log(`Extracted At:  ${result.metadata.extractedAt}`);
    console.log('--------------------------------------------------');
    console.log('Extracted Clean Text Preview:');
    console.log(result.text);
    console.log('--------------------------------------------------\n');
  } catch (err) {
    console.error(`✗ Test 1 Failed: ${err.message}`);
  }

  // Test 2: Invalid URL handling
  console.log('[TEST 2] Testing invalid URL handling...');
  try {
    await extract('not-a-valid-url');
    console.error('✗ Test 2 Failed: Expected validation error but request succeeded');
  } catch (err) {
    console.log(`✓ Caught expected error: [${err.code || err.name}] ${err.message}\n`);
  }

  // Test 3: HTTP 404 handling
  console.log('[TEST 3] Testing HTTP 404 handling...');
  try {
    await extract('https://example.com/non-existent-page-404-test');
    console.error('✗ Test 3 Failed: Expected 404 error but request succeeded');
  } catch (err) {
    console.log(`✓ Caught expected error: [${err.code || err.name}] ${err.message}\n`);
  }

  console.log('==================================================');
  console.log('Extractor Test Suite Finished');
  console.log('==================================================');
}

runTests();
