import { OcrExtractor } from '../src/extractors/ocrExtractor.js';
import { extract } from '../src/extractors/index.js';
import assert from 'assert';

// Small JPEG with readable text (W3C accessibility example — a table with words)
const TEST_IMAGE_URL = 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.jpg';

async function runTests() {
  console.log('--- Testing OCR Extractor ---');
  const extractor = new OcrExtractor();

  // Test 1: Real image with readable text
  console.log('\nTest 1: Real image with readable text');
  try {
    const result = await extractor.extract(TEST_IMAGE_URL, { timeout: 30000 });
    assert(result.url, 'URL should be present');
    assert(result.title, 'Title should be present');
    assert(result.text.length > 0, 'OCR text should be non-empty');
    assert(result.metadata, 'Metadata should be present');
    assert(result.metadata.contentType.startsWith('image/'), 'Content type should be image');
    assert(result.metadata.wordCount > 0, 'Word count should be positive');
    assert(result.metadata.imageSize > 0, 'Image size should be tracked');
    assert(result.metadata.extractedAt, 'Extraction timestamp should be present');
    console.log('✅ Real image OCR test passed.');
    console.log(`URL: ${result.url}`);
    console.log(`Title: ${result.title}`);
    console.log(`Content-Type: ${result.metadata.contentType}`);
    console.log(`Extracted text length: ${result.text.length}`);
    console.log(`Word count: ${result.metadata.wordCount}`);
    console.log(`Image size: ${result.metadata.imageSize} bytes`);
    console.log(`Text preview: ${result.text.substring(0, 200)}...`);
  } catch (err) {
    console.error('❌ Real image OCR test failed:', err.message);
  }

  // Test 2: Invalid/unreachable image URL
  console.log('\nTest 2: Invalid/unreachable image URL');
  try {
    await extractor.extract('http://localhost:9999/non-existent.png', { timeout: 3000 });
    console.error('❌ Should have failed with network error');
  } catch (err) {
    assert(err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT', `Expected NETWORK_ERROR or TIMEOUT, got ${err.code}`);
    console.log(`✅ Invalid URL test passed. Error: [${err.code}] ${err.message.substring(0, 80)}...`);
  }

  // Test 3: Non-image resource given to OCR extractor
  console.log('\nTest 3: Non-image resource (HTML) given to OCR');
  try {
    await extractor.extract('https://example.com');
    console.error('❌ Should have failed with unsupported content type');
  } catch (err) {
    assert(err.code === 'UNSUPPORTED_CONTENT_TYPE', `Expected UNSUPPORTED_CONTENT_TYPE, got ${err.code}`);
    console.log(`✅ Non-image resource test passed. Error: [${err.code}] ${err.message.substring(0, 80)}...`);
  }

  // Test 4: Routing — image URL goes through extract() to OCR
  console.log('\nTest 4: Routing — image URL through extract() goes to OCR');
  try {
    const result = await extract(TEST_IMAGE_URL, { timeout: 30000 });
    assert.strictEqual(result.metadata.extractor, 'ocr', 'Should use OCR extractor for image URLs');
    assert(result.text.length > 0, 'Should extract text from image');
    console.log('✅ OCR routing test passed.');
    console.log(`Extractor: ${result.metadata.extractor}`);
    console.log(`Text length: ${result.text.length}`);
  } catch (err) {
    console.error('❌ OCR routing test failed:', err.message);
  }

  // Test 5: Routing — HTML URL still uses Cheerio (regression)
  console.log('\nTest 5: Regression — HTML URL still uses Cheerio');
  try {
    const result = await extract('https://example.com');
    assert.strictEqual(result.metadata.extractor, 'cheerio', 'HTML should still use Cheerio');
    console.log('✅ Cheerio regression test passed.');
    console.log(`Extractor: ${result.metadata.extractor}`);
  } catch (err) {
    console.error('❌ Cheerio regression test failed:', err.message);
  }

  console.log('\nAll OCR Extractor tests executed.');
}

runTests();
