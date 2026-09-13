# WebMind Phase 1 — Evaluation Benchmark

## Purpose

This benchmark evaluates the end-to-end quality of the WebMind RAG pipeline:

```
Ingestion → Gemini Embeddings (768-dim) → Supabase pgvector → Cosine Retrieval → Cohere Reranking → Groq Answer Generation
```

The goal is to measure **retrieval accuracy**, **answer correctness**, **groundedness**, **abstention quality**, and **latency** across a diverse set of technical questions grounded in real-world reference content.

---

## Sources (5 Webpages)

All sources are authoritative Wikipedia articles on instrumentation and electronics:

| # | ID | Topic | URL |
|---|-----|-------|-----|
| 1 | `lvdt` | LVDT / Linear Variable Differential Transformer | https://en.wikipedia.org/wiki/Linear_variable_differential_transformer |
| 2 | `strain-gauge` | Strain Gauge | https://en.wikipedia.org/wiki/Strain_gauge |
| 3 | `thermocouple` | Thermocouple | https://en.wikipedia.org/wiki/Thermocouple |
| 4 | `adc` | ADC / Analog-to-Digital Converter | https://en.wikipedia.org/wiki/Analog-to-digital_converter |
| 5 | `spi` | SPI / Serial Peripheral Interface | https://en.wikipedia.org/wiki/Serial_Peripheral_Interface |

---

## Questions (35 Total)

**7 questions per source** × **5 sources** = **35 questions**

### Question Type Distribution

| Type | Count | Description |
|------|-------|-------------|
| `direct` | 5 | Answer is stated explicitly in the source text |
| `definition` | 5 | Asks for the meaning or definition of a concept |
| `relationship` | 5 | Asks how two concepts relate or what mechanism links them |
| `specific` | 5 | Asks for a specific value, unit, range, or technical parameter |
| `comparison` | 5 | Asks to compare or contrast two or more items |
| `reasoning` | 5 | Asks for a reason, application, or engineering justification |
| `unanswerable` | 5 | Answer is **NOT** present in the source — system should abstain |

Each source has exactly one question of each type.

---

## `relevantChunkIds` — Why They Are Empty

The `relevantChunkIds` field in each question is intentionally left as `[]`.

**Reason:** Chunk IDs are deterministic but depend on the ingestion pipeline (URL + chunk index). They can only be populated **after** the 5 source pages are ingested into the database and the actual chunk boundaries are known.

### Population Workflow

1. Ingest all 5 source pages via `POST /ingest`
2. Query the `document_chunks` table to retrieve actual `chunk_id` values
3. For each question, identify which chunks contain the relevant answer text
4. Update `relevantChunkIds` with the matching chunk IDs
5. Run the evaluation

This separation ensures the dataset structure is defined independently of the database state.

---

## Metrics

The evaluation will compute the following metrics:

### Retrieval Quality
- **Recall@5** — Of the chunks containing the expected answer, what fraction appear in the top-5 retrieved chunks?

### Answer Quality
- **Answer Correctness** — Does the generated answer match the expected answer in substance? (Manual or LLM-as-judge evaluation)
- **Groundedness** — Is the answer grounded in the retrieved source chunks, or does it hallucinate information not present in the context?

### Abstention Quality
- **Abstention Accuracy** — For `unanswerable` questions, does the system correctly refuse to answer instead of fabricating a response?

### Performance
- **Latency** — Per-question and aggregate pipeline latency (embedding → retrieval → reranking → generation)

### Breakdown
- All metrics are broken down by `questionType` and by `source` to identify systematic weaknesses.

---

## File Structure

```
backend/evaluation/
├── dataset.json       # 35-question benchmark dataset
├── README.md          # This file
└── results/           # (created at runtime) Evaluation run outputs
```

---

## Usage

### Pre-requisites
1. All 5 source pages must be ingested first
2. Server must be running (`npm run dev`)

### Running the Evaluation
```bash
node eval/runEval.js
```

> **Note:** The evaluation runner currently reads from `eval/dataset.json`. It may need to be updated to read from `evaluation/dataset.json` or the evaluation runner may be updated to work with the new dataset format.
