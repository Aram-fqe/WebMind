import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import healthRoutes from './routes/health.js';
import ingestRoutes from './routes/ingest.js';
import searchRoutes from './routes/search.js';
import askRoutes from './routes/ask.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../../frontend')));

// Routes
app.use('/', healthRoutes);
app.use('/', ingestRoutes);
app.use('/', searchRoutes);
app.use('/', askRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler — catches anything passed to next(err)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  logger.error('APP', `Unhandled error [${code}]: ${err.message}`, { status });
  res.status(status).json({
    error: err.message || 'An unexpected error occurred.',
    code,
    status,
  });
});

export default app;
