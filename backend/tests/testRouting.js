import { extract } from '../src/extractors/index.js';
import { ingest } from '../src/services/ingestionService.js';
import assert from 'assert';

async function runTests() {
  console.log('--- Testing Extractor Routing & Fallback ---');

  // Test 1: Static page
  console.log('\nTest 1: Static page (Cheerio only)');
  try {
    const result = await extract('https://example.com');
    assert.strictEqual(result.metadata.extractor, 'cheerio', 'Should use Cheerio for static pages');
    assert(result.text.length >= 150, 'Text length should be sufficient');
    console.log(`✅ Static page test passed.`);
    console.log(`URL: https://example.com`);
    console.log(`Selected extractor: ${result.metadata.extractor}`);
  } catch (err) {
    console.error('❌ Static page test failed:', err);
  }

  // Test 2: JavaScript-heavy page
  console.log('\nTest 2: JavaScript-heavy page (Playwright fallback)');
  try {
    const result = await extract('https://excalidraw.com/');
    assert.strictEqual(result.metadata.extractor, 'playwright', 'Should fallback to Playwright for JS-heavy pages');
    console.log(`✅ Dynamic webpage fallback test passed.`);
    console.log(`URL: https://excalidraw.com/`);
    console.log(`Playwright text length: ${result.text.length}`);
    console.log(`Selected extractor: ${result.metadata.extractor}`);
  } catch (err) {
    console.error('❌ Dynamic webpage test failed:', err);
  }

  // Test 3: Both fail (unreachable URL)
  console.log('\nTest 3: Both fail (unreachable URL)');
  try {
    await extract('http://localhost:9999/non-existent', { timeout: 3000 });
    console.error('❌ Should have failed with connection error');
  } catch (err) {
    console.log(`✅ Failed cleanly with expected error: ${err.message}`);
  }

  // Test 4: Existing ingestion pipeline
  console.log('\nTest 4: Existing ingestion pipeline');
  try {
    // Attempt an ingest on example.com
    const result = await ingest('https://example.com');
    assert.strictEqual(result.status, 'success', 'Ingestion should succeed');
    assert(result.chunks_created > 0, 'Should create chunks');
    console.log(`✅ Ingestion pipeline passed.`);
  } catch (err) {
    console.error('❌ Ingestion pipeline test failed:', err);
  }

  // Test 5: Image URL routed to OCR
  console.log('\nTest 5: Image URL routed to OCR');
  try {
    const imageUrl = 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.jpg';
    const result = await extract(imageUrl, { timeout: 30000 });
    assert.strictEqual(result.metadata.extractor, 'ocr', 'Should use OCR for image URLs');
    assert(result.text.length > 0, 'Should extract text from image');
    console.log(`✅ Image OCR routing test passed.`);
    console.log(`URL: ${imageUrl.substring(0, 60)}...`);
    console.log(`Selected extractor: ${result.metadata.extractor}`);
    console.log(`OCR text length: ${result.text.length}`);
  } catch (err) {
    console.error('❌ Image OCR routing test failed:', err.message);
  }

  console.log('\nAll Extractor Routing tests executed.');
}

runTests();
