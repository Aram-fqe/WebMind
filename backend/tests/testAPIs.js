/**
 * Quick smoke test for all three API integrations:
 *   1. Gemini Embeddings
 *   2. Cohere Reranking
 *   3. Groq LLM Generation
 *
 * Usage: node tests/testAPIs.js
 */
import dotenv from 'dotenv';
dotenv.config();

const PASS = '✅';
const FAIL = '❌';
const SKIP = '⏭️';

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Gemini Embeddings
// ─────────────────────────────────────────────────────────────────────────────
async function testGeminiEmbeddings() {
  console.log('\n━━━ Test 1: Gemini Embeddings ━━━');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(`${SKIP} GEMINI_API_KEY not set — skipping`);
    return false;
  }

  const model = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
  const dimension = parseInt(process.env.EMBEDDING_DIMENSION || '768', 10);
  const baseUrl = process.env.EMBEDDING_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

  const testTexts = [
    'What is machine learning?',
    'PostgreSQL is a relational database.',
  ];

  try {
    const url = `${baseUrl}/models/${model}:batchEmbedContents?key=${apiKey}`;
    const requests = testTexts.map(text => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      outputDimensionality: dimension,
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`${FAIL} Gemini API returned ${response.status}: ${err}`);
      return false;
    }

    const data = await response.json();
    const embeddings = data.embeddings;

    console.log(`${PASS} Gemini API connected successfully`);
    console.log(`   Model: ${model}`);
    console.log(`   Texts embedded: ${embeddings.length}`);
    console.log(`   Vector dimension: ${embeddings[0].values.length} (expected ${dimension})`);
    console.log(`   First 5 values: [${embeddings[0].values.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
    return true;
  } catch (err) {
    console.log(`${FAIL} Gemini test failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Cohere Reranking
// ─────────────────────────────────────────────────────────────────────────────
async function testCohereRerank() {
  console.log('\n━━━ Test 2: Cohere Reranking ━━━');

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    console.log(`${SKIP} COHERE_API_KEY not set — skipping`);
    return false;
  }

  const model = process.env.RERANK_MODEL || 'rerank-v3.5';
  const query = 'What is machine learning?';
  const documents = [
    'Machine learning is a subset of artificial intelligence that enables systems to learn from data.',
    'PostgreSQL supports JSONB columns for storing semi-structured data.',
    'Neural networks are inspired by the structure of biological brains and are used in deep learning.',
    'CSS Grid is a layout system for building responsive web pages.',
  ];

  try {
    const response = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents,
        top_n: 2,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`${FAIL} Cohere API returned ${response.status}: ${err}`);
      return false;
    }

    const data = await response.json();

    console.log(`${PASS} Cohere API connected successfully`);
    console.log(`   Model: ${model}`);
    console.log(`   Query: "${query}"`);
    console.log(`   Results returned: ${data.results.length}`);
    data.results.forEach((r, i) => {
      console.log(`   #${i + 1}: doc[${r.index}] relevance=${r.relevance_score.toFixed(6)} → "${documents[r.index].substring(0, 60)}..."`);
    });
    return true;
  } catch (err) {
    console.log(`${FAIL} Cohere test failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Groq LLM Generation
// ─────────────────────────────────────────────────────────────────────────────
async function testGroqLLM() {
  console.log('\n━━━ Test 3: Groq LLM Generation ━━━');

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log(`${SKIP} GROQ_API_KEY not set — skipping`);
    return false;
  }

  const model = process.env.LLM_MODEL || 'qwen/qwen3.8-27b';
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Reply in one sentence.' },
          { role: 'user', content: 'What is RAG in AI?' },
        ],
        max_tokens: 100,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`${FAIL} Groq API returned ${response.status}: ${err}`);
      return false;
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    const usage = data.usage;

    console.log(`${PASS} Groq API connected successfully`);
    console.log(`   Model: ${model}`);
    console.log(`   Response: "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`);
    console.log(`   Tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total`);
    return true;
  } catch (err) {
    console.log(`${FAIL} Groq test failed: ${err.message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run all tests
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   WebMind API Integration Tests      ║');
  console.log('╚══════════════════════════════════════╝');

  const results = [];
  results.push({ name: 'Gemini Embeddings', passed: await testGeminiEmbeddings() });
  results.push({ name: 'Cohere Reranking',  passed: await testCohereRerank() });
  results.push({ name: 'Groq LLM',          passed: await testGroqLLM() });

  console.log('\n━━━ Summary ━━━');
  results.forEach(r => {
    console.log(`  ${r.passed ? PASS : FAIL} ${r.name}`);
  });

  const allPassed = results.every(r => r.passed);
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed — check output above.'}\n`);

  process.exit(allPassed ? 0 : 1);
}

main();
