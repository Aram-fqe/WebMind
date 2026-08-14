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
