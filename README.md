# WebMind

WebMind is a source-grounded AI assistant for answering questions about web pages.

## Project Structure

```text
WebMind/
├── backend/       # Node.js + Express RAG backend API
├── frontend/      # Future Web UI & Chrome Extension
├── docs/          # Project documentation and roadmap
└── README.md
```

## Phase 1 Overview
- URL extraction & text cleaning
- Chunking & embeddings generation
- Vector storage in PostgreSQL + pgvector
- Semantic retrieval & LLM grounded answer generation
- Return answer + retrieved source chunks + similarity scores

See [docs/roadmap.md](docs/roadmap.md) for full project roadmap details.

## Evaluation (Phase 1)

Canonical dataset and runner: [backend/evaluation/README.md](backend/evaluation/README.md).

From `backend/`, with the API server already running:

```bash
npm run eval:ingest
npm run eval
```

`eval:ingest` is a separate step. Evaluation does not re-ingest pages, because re-ingestion can change chunk IDs and invalidate gold `relevantChunkIds`. Do not use `backend/eval/dataset.json` (deprecated placeholder).
