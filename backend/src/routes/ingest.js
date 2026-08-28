import { Router } from 'express';
import { ingestController } from '../controllers/ingestController.js';

const router = Router();

/**
 * POST /ingest
 * Ingests a webpage URL through the full pipeline:
 * extract → chunk → embed → store in PostgreSQL/pgvector
 */
router.post('/ingest', ingestController);

export default router;
