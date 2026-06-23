import { randomUUID } from 'node:crypto';
import type { AutonomyLevel, SupervisorState, NodeResult, LoopNode } from '@ai-growth-ops/runtime';
import { advance } from '@ai-growth-ops/runtime';
import { buildNodeDirective } from './node-directive.js';
import type { OrchestratorDeps, StartRunInput, ReportInput, ReportOutcome, NodeDirective } from './types.js';

export interface Orchestrator {
  start(input: StartRunInput): Promise<{ runId: string; directive: NodeDirective }>;
  report(input: ReportInput): Promise<ReportOutcome>;
}

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  return {
    async start(input) {
      const autonomyLevel: AutonomyLevel = input.autonomyLevel ?? 'L2_AUTOPILOT_LIGHT';
      const dryRun = input.dryRun ?? false;
      const runId = randomUUID();
      const state: SupervisorState = {
        runId,
        userId: input.userId,
        orgId: input.orgId,
        autonomyLevel,
        dryRun,
        currentNode: 'INIT',
        nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
        startedAt: new Date().toISOString(),
        status: 'running'
      };
      await deps.runStore.set(runId, state);
      const directive = await buildNodeDirective(state, deps);
      return { runId, directive };
    },

    async report(input): Promise<ReportOutcome> {
      const state = await deps.runStore.get(input.runId);
      if (!state) return { status: 'failed', error: `unknown run: ${input.runId}` };

      const result: NodeResult = input.result;
      const nodeResults = { ...state.nodeResults, [state.currentNode]: result };
      const { next, outcome } = advance(state, result);

      if (next === null) {
        const completed: SupervisorState = {
          ...state,
          nodeResults,
          currentNode: 'REVIEW' as LoopNode,
          status: 'completed'
        };
        await deps.runStore.set(input.runId, completed);
        return { status: 'completed', review: { runId: input.runId, nodeResults } };
      }

      const paused = outcome === 'need_input' || outcome === 'blocked';
      const nextNode = next as LoopNode;
      const updated: SupervisorState = {
        ...state,
        nodeResults,
        currentNode: nextNode,
        status: paused ? 'paused' : 'running'
      };
      await deps.runStore.set(input.runId, updated);
      const directive = await buildNodeDirective(updated, deps);
      return { status: paused ? 'paused' : 'running', directive };
    }
  };
}
