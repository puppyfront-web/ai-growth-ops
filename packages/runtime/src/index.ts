// @ai-growth-ops/runtime — agent orchestration kernel
export const PACKAGE_NAME = '@ai-growth-ops/runtime';

export * from './types.js';

export { DefaultConfirmationGate, createConfirmationGate } from './confirmation-gate.js';

export * from './memory/index.js';

export { getToolsForAgent, inferMutate } from './tool-access.js';
