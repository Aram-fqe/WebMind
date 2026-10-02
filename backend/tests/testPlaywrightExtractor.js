import { PlaywrightExtractor } from '../src/extractors/playwrightExtractor.js';
import { CheerioExtractor } from '../src/extractors/cheerioExtractor.js';
import assert from 'assert';

async function runTests() {
  console.log('--- Testing PlaywrightExtractor ---');
  const extractor = new PlaywrightExtractor();

  // Test 1, 2, 3: Dynamic webpage, Title, URL
  console.log('Test 1, 2, 3: Dynamic webpage extraction');
  const targetUrl = 'https://react.dev/';
  try {
    const result = await extractor.extract(targetUrl, { timeout: 15000 });
    assert(result.url.includes('react.dev'), 'URL should match');
    assert(result.title.includes('React'), 'Title should include React');
    assert(result.text.length > 500, 'Should extract meaningful text from JS rendered page');
    console.log('✅ Dynamic webpage test passed.');
    console.log(`URL: ${result.url}`);
    console.log(`Title: ${result.title}`);
    console.log(`Extracted text length: ${result.text.length}`);
    console.log(`First ~200 characters:\n${result.text.substring(0, 200)}...`);
  } catch (err) {
    console.error('❌ Dynamic webpage test failed:', err);
  }

  // Test 4: Failure/Timeout
  console.log('\nTest 4: Failure/Timeout (invalid URL)');
  try {
    await extractor.extract('http://localhost:9999/non-existent', { timeout: 3000 });
    console.error('❌ Should have failed with connection error');
  } catch (err) {
    console.log(`✅ Failed cleanly with expected error: ${err.message}`);
  }

  // Test 5: Existing Cheerio regression
  console.log('\nTest 5: Existing Cheerio extraction still works');
  const cheerioExtractor = new CheerioExtractor();
  try {
    const cheerioResult = await cheerioExtractor.extract('https://example.com');
    assert(cheerioResult.title.includes('Example Domain'), 'Title should match Example Domain');
    console.log('✅ Cheerio regression test passed.');
  } catch (err) {
    console.error('❌ Cheerio regression test failed:', err);
  }

  console.log('\nAll PlaywrightExtractor tests executed.');
}

runTests();
