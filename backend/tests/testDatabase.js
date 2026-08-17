import { initDb, upsertWebpage, saveChunks, searchSimilarChunks, pool } from '../src/db/index.js';

async function runDatabaseTests() {
  console.log('==================================================');
  console.log('Starting WebMind Database & pgvector Test Suite');
  console.log('==================================================\n');

  try {
    // 1. Initialize schema & vector extension
    console.log('[TEST 1] Testing Database Schema Initialization...');
    await initDb();
    console.log('✓ Passed! Database schema & pgvector index initialized.\n');

    // 2. Test webpage insertion
    console.log('[TEST 2] Testing Webpage Upsert...');
    const testPage = {
      url: 'https://example.com/db-test',
      title: 'Database Test Page',
      text: 'This is a test page for verifying PostgreSQL + pgvector persistence.',
      metadata: { test: true, wordCount: 10 }
    };
    const webpageId = await upsertWebpage(testPage);
    console.log(`✓ Passed! Webpage saved with ID: ${webpageId}\n`);

    // 3. Test chunk insertion with synthetic 1536-dim vector embeddings
    console.log('[TEST 3] Testing Chunk & Vector Insertion...');
    const dummyVector1 = new Array(1536).fill(0.1);
    const dummyVector2 = new Array(1536).fill(0.2);

    const testChunks = [
      {
        chunk_id: 'https://example.com/db-test#chunk-0',
        source_url: testPage.url,
        chunk_index: 0,
        text: 'Chunk 0: First segment of database test content.',
        embedding: dummyVector1,
        metadata: { tokenCount: 8 }
      },
      {
        chunk_id: 'https://example.com/db-test#chunk-1',
        source_url: testPage.url,
        chunk_index: 1,
        text: 'Chunk 1: Second segment of database test content.',
        embedding: dummyVector2,
        metadata: { tokenCount: 8 }
      }
    ];

    const savedChunks = await saveChunks(webpageId, testChunks);
    console.log(`✓ Passed! Saved ${savedChunks.length} chunks with 1536-dimensional embeddings.\n`);

    // 4. Test vector similarity search (<=>)
    console.log('[TEST 4] Testing Top-K Cosine Similarity Search (<=>)...');
    const queryVector = new Array(1536).fill(0.105); // Close to vector1
    const searchResults = await searchSimilarChunks(queryVector, { limit: 2 });
    
    console.log(`Retrieved ${searchResults.length} top matching chunks:`);
    searchResults.forEach((match, idx) => {
      console.log(`  Match ${idx + 1}:`);
      console.log(`    Chunk ID:          ${match.chunk_id}`);
      console.log(`    Similarity Score:  ${match.similarity_score}`);
      console.log(`    Text:              "${match.text}"`);
    });

    if (searchResults.length > 0 && searchResults[0].similarity_score > 0.95) {
      console.log('\n✓ Passed! Semantic vector similarity search returned expected top matches.\n');
    } else {
      console.error('\n✗ Vector search returned unexpected similarity scores.\n');
    }

  } catch (err) {
    console.error(`✗ Database Test Error: ${err.message}`);
    console.error(err.stack);
  } finally {
    await pool.end();
    console.log('==================================================');
    console.log('Database & pgvector Test Suite Finished');
    console.log('==================================================');
  }
}

runDatabaseTests();
