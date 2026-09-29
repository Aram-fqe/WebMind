# Legacy partial baseline (do not treat as complete)

The files in this directory named `raw_results.json` and `aggregate_metrics.json` are a **historical partial** evaluation:

- Produced by the deprecated script `backend/tests/_runEvalBaseline.js`
- 33 of 35 questions executed; questions 34 and 35 are missing from raw results
- Failure details for the two missing questions were not recorded
- Recall@5 27/29 (93.10%) over successfully executed answerable questions
- Abstention 100% over successfully executed unanswerable questions (question 35 was not recorded)

These files are kept for comparison. They are **not** a complete Phase 1 baseline.

New evaluation output is written to `evaluation/results/runs/` and does not overwrite these files.
