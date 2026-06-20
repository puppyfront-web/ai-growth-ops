import { describe, it, expect, vi } from 'vitest';
import { createSupervisor } from '@ai-growth-ops/runtime';
import type { LoopNode, NodeResult, SupervisorState } from '@ai-growth-ops/runtime';

function initState(node: LoopNode): SupervisorState {
  return {
    runId: 'r', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: true,
    currentNode: node,
    nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
    startedAt: '2026-06-18T00:00:00.000Z', status: 'running'
  };
}

describe('Supervisor', () => {
  it('runs a single node via injected runNode and records result', async () => {
    const runNode = vi.fn(async (_state, _agent, _node) => ({ node: 'INIT', outcome: 'done', summary: 'authed' }) as NodeResult);
    const sup = createSupervisor({ runNode });
    const after = await sup.runNode(initState('INIT'));
    expect(after.nodeResults.INIT?.summary).toBe('authed');
    expect(after.currentNode).toBe('METRICS'); // advanced
  });

  it('keeps node on need_input without advancing', async () => {
    const runNode = vi.fn(async () => ({ node: 'CONTENT', outcome: 'need_input' }) as NodeResult);
    const sup = createSupervisor({ runNode });
    const after = await sup.runNode(initState('CONTENT'));
    expect(after.currentNode).toBe('CONTENT');
    expect(after.status).toBe('paused');
  });

  it('completes the loop when REVIEW returns done', async () => {
    const runNode = vi.fn(async () => ({ node: 'REVIEW', outcome: 'done', summary: 'daily report' }) as NodeResult);
    const sup = createSupervisor({ runNode });
    const after = await sup.runNode(initState('REVIEW'));
    expect(after.status).toBe('completed');
  });
});
