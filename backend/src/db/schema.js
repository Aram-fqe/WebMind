import { query } from './client.js';

export async function initDb() {
  console.log('[DB] Initializing PostgreSQL schema & pgvector extension...');

  // 1. Enable pgvector extension
  await query('CREATE EXTENSION IF NOT EXISTS vector;');

  // 2. Create webpages table
  await query(`
    CREATE TABLE IF NOT EXISTS webpages (
      id SERIAL PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      extracted_text TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Create document_chunks table with vector(1536) column
  await query(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id SERIAL PRIMARY KEY,
      chunk_id VARCHAR(512) UNIQUE NOT NULL,
      webpage_id INTEGER REFERENCES webpages(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding vector(1536),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Create HNSW index for cosine distance vector search
  await query(`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
    ON document_chunks 
    USING hnsw (embedding vector_cosine_ops);
  `);

  console.log('[DB] Database schema and pgvector index initialized successfully.');
}
