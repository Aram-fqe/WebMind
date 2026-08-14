# WebMind Project Roadmap

## Phase 1: Core Grounded RAG Pipeline (Current Phase)
- **Extraction:** Webpage extraction behind `extract(url)` abstraction (using Cheerio).
- **Processing:** Text cleaning & chunking with metadata tracking.
- **Vector Storage:** OpenAI embeddings stored in PostgreSQL with `pgvector`.
- **Retrieval & LLM:** Semantic search returning top-$k$ chunks, scores, and grounded LLM completion.
- **Evaluation Support:** Groundwork for evaluating Recall@5, answer correctness, and groundedness.

## Phase 2: Enhanced Scraping & Processing
- Replace/extend Cheerio with Playwright for dynamic JavaScript rendering.
- Add document parsing and OCR support (Tesseract OCR).

## Phase 3: Graph RAG & Advanced Knowledge Representation
- Integrate Neo4j for knowledge graph representation and hybrid retrieval.

## Phase 4: Frontend & Browser Extension
- Chrome Extension UI for seamless web page QA directly in browser.
- Workflow automation hooks (e.g. n8n integration).
