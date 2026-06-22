// @ai-growth-ops/runtime — agent orchestration kernel
export const PACKAGE_NAME = '@ai-growth-ops/runtime';

export * from './types.js';

export { DefaultConfirmationGate, createConfirmationGate } from './confirmation-gate.js';

export * from './memory/index.js';

export { getToolsForAgent, inferMutate } from './tool-access.js';

export { runDomainAgent, scrubSensitiveOutput } from './agent-loop.js';
export type { RunDomainAgentParams, DomainAgentResult } from './agent-loop.js';
// Re-exported so callers (e.g. the worker handler's test seam) can type the
// optional `llmClient` injection point without taking a direct dep on `@ai-growth-ops/ai`.
// `LLMClient` is already part of `RunDomainAgentParams`'s public shape.
export type { LLMClient } from '@ai-growth-ops/ai';

// First-slice domain agents + runtime tool registration (content / publish).
export * from './agents/index.js';

// Supervisor state machine (5-node fixed loop + transitions + dispatch).
export * from './supervisor/index.js';
