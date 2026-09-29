/**
 * DEPRECATED.
 *
 * This file is no longer the evaluation metric implementation.
 * The canonical runner is backend/evaluation/runEval.js
 * (npm run eval from backend/).
 *
 * The placeholder dataset next to this file (eval/dataset.json) is not used.
 */

console.warn(
  '\n[DEPRECATED] backend/eval/runEval.js is a compatibility wrapper.\n' +
    '             Use: cd backend && npm run eval\n' +
    '             Dataset: backend/evaluation/dataset.json\n',
);

await import('../evaluation/runEval.js');
