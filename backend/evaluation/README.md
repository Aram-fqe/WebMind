# WebMind Phase 1 — Evaluation Benchmark

Canonical evaluation lives in this directory. Do not use `backend/eval/dataset.json`.

## Pipeline under test

```text
Ingestion → Gemini embeddings (768-dim) → PostgreSQL pgvector
→ cosine retrieval → Cohere rerank → Groq answer generation
```

## Canonical dataset

**File:** `backend/evaluation/dataset.json`

35 questions across 5 Wikipedia sources (7 types × 5 pages):

| ID | Topic | URL |
|---|---|---|
| `lvdt` | LVDT | https://en.wikipedia.org/wiki/Linear_variable_differential_transformer |
| `strain-gauge` | Strain gauge | https://en.wikipedia.org/wiki/Strain_gauge |
| `thermocouple` | Thermocouple | https://en.wikipedia.org/wiki/Thermocouple |
| `adc` | ADC | https://en.wikipedia.org/wiki/Analog-to-digital_converter |
| `spi` | SPI | https://en.wikipedia.org/wiki/Serial_Peripheral_Interface |

Question types: `direct`, `definition`, `relationship`, `specific`, `comparison`, `reasoning`, `unanswerable` (one of each per source).

Gold `relevantChunkIds` are a snapshot of chunk IDs from a prior ingest (`{url}#chunk-{index}`). Do not invent or rewrite them. Re-ingestion can change those IDs.

The placeholder file `backend/eval/dataset.json` is **deprecated** and is not used by the runner.

## Required order

The server must be running (`npm run dev` or `npm start` from `backend/`).

```bash
cd backend
npm run eval:ingest    # once, or when sources must be (re)loaded
npm run eval           # assumes pages are already ingested
```

Equivalent:

```bash
node evaluation/ingestSources.js
node evaluation/runEval.js
```

Optional filters:

```bash
node evaluation/runEval.js --source lvdt
node evaluation/runEval.js --type unanswerable
```

Environment (optional):

- `PORT` — API port (default 3000)
- `EVAL_DELAY_MS` — pause between questions (default 2000)
- `EVAL_ASK_TIMEOUT_MS` — per-question timeout (default 120000)

`npm run eval` **does not** ingest pages. Silent re-ingest during scoring would rewrite chunks and invalidate gold IDs.

## Ingestion warning

`eval:ingest` calls the existing `POST /ingest` endpoint for each dataset source URL.

Re-ingestion **replaces** chunks for that URL. If Wikipedia content or chunk boundaries change, gold `relevantChunkIds` can become wrong. After any re-ingest, inspect stored `chunk_id` values before treating Recall@5 as comparable to a previous run.

## Metrics

### Recall@5 (binary, answerable successes only)

A question is a **hit** if at least one gold `relevantChunkId` appears in the top-five retrieved `chunk_id` values from `/ask`.

- Unanswerable questions are excluded.
- Failed requests are excluded from the denominator and listed separately.

### Abstention accuracy (unanswerable successes only)

Counted as correct when the generated answer matches a refusal phrase (for example “do not contain enough information”).

- Failed unanswerable requests are excluded from the denominator.

### Latency

Average, median, min, and max over **successful** requests only.

### Not scored automatically

- Answer correctness — manual review
- Groundedness — manual review

### Complete vs partial

- **Complete:** every selected question has `success: true`. Only then is the run a complete evaluation of that set.
- **Partial:** any HTTP, network, timeout, or rate-limit failure. Do **not** call a partial run a complete Phase 1 baseline.

The runner always writes a row for every question, including failures with an `error` field. Exit code is `1` on a partial run.

## Results location

| Path | Role |
|---|---|
| `evaluation/results/runs/eval_<timestamp>.json` | New runs (raw rows + aggregates) |
| `evaluation/results/raw_results.json` | **Legacy partial** historical artifact |
| `evaluation/results/aggregate_metrics.json` | **Legacy partial** historical artifact |
| `evaluation/results/LEGACY.md` | Explains the historical 33/35 run |

New runs do not overwrite the legacy JSON files.

## Failure handling

Each result row includes `questionId`, `questionType`, `success`, `httpStatus`, `timedOut`, `rateLimited`, `error`, and `latencyMs` when measurable. Error text is sanitized so API keys are not written to disk.

## Limitations and reproducibility

- Live Wikipedia HTML can change extraction and chunk boundaries.
- Gold chunk IDs are ingest-snapshot specific.
- Gemini, Cohere, and Groq are live APIs; ranking and answers can vary.
- Rate limits may produce a partial run unless `EVAL_DELAY_MS` is increased.
- The historical baseline omitted questions 34 and 35 from raw results; the canonical runner does not omit failures.

## Deprecated files

- `backend/eval/dataset.json` — placeholder dataset; not canonical
- `backend/eval/runEval.js` — prints a deprecation warning and forwards to this runner
- `backend/tests/_runEvalBaseline.js` — produced the historical partial 33/35 baseline; do not use
