import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/webmind';

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Execute SQL query with automatic pool client management.
 * @param {string} text 
 * @param {Array} [params] 
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params) {
  return pool.query(text, params);
}
