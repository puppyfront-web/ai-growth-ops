/**
 * Moved to @ai-growth-ops/database so the prospecting pipeline (which runs
 * inside the worker but lives in the database package) can resolve the same
 * org-level LLM config for semantic scoring. Re-exported here to keep
 * existing worker imports stable.
 */
export { resolveLlmClientFromDb } from '@ai-growth-ops/database';
