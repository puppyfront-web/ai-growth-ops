import { describe, it, expect } from 'vitest';
import { InMemoryRunStore } from '@ai-growth-ops/runtime-mcp';
import type { SupervisorState } from '@ai-growth-ops/runtime';

const state: SupervisorState = {
  runId: 'r1', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: true,
  currentNode: 'INIT',
  nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
  startedAt: '2026-06-23T00:00:00.000Z', status: 'running'
};

describe('InMemoryRunStore', () => {
  it('persists and returns supervisor state by runId', async () => {
    const store = new InMemoryRunStore();
    await expect(store.get('r1')).resolves.toBeUndefined();
    await store.set('r1', state);
    await expect(store.get('r1')).resolves.toEqual(state);
  });
});
