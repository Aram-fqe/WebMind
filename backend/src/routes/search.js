import { Router } from 'express';
import { searchController } from '../controllers/searchController.js';

const router = Router();

/**
 * POST /search
 * Semantic search over ingested document chunks:
 * query → embedding → pgvector cosine similarity → top K chunks
 */
router.post('/search', searchController);

export default router;
