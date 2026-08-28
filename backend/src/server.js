import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { initDb } from './db/schema.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database schema and pgvector extension before accepting traffic
    await initDb();

    app.listen(PORT, () => {
      logger.info('SERVER', `WebMind API server running on port ${PORT}`, { port: PORT });
    });
  } catch (err) {
    logger.error('SERVER', `Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

startServer();
