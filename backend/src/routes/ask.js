import { Router } from 'express';
import { askController } from '../controllers/askController.js';

const router = Router();

/**
 * POST /ask
 * Full RAG pipeline:
 * question → embedding → pgvector retrieval → LLM grounded answer
 */
router.post('/ask', askController);

export default router;
