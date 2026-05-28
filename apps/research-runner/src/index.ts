import { createHealthSnapshot } from '@ai-growth-ops/shared';

export const appName = 'research-runner';
export const getResearchRunnerHealth = () => createHealthSnapshot(appName);

export { executeResearch, getProvider, registerProvider } from './executor.js';
export { SandboxResearchProvider } from './sandbox-provider.js';
export { generateInsights } from './insight-generator.js';
export type { ResearchProvider } from './types.js';
export type { ExecuteResearchInput, ExecuteResearchResult } from './executor.js';
