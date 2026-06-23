import { describe, it, expect } from 'vitest';
import {
  createOrchestrator,
  InMemoryRunStore,
  InMemoryWorkingMemory,
  StaticPreferencesStore
} from '@ai-growth-ops/runtime-mcp';

describe('orchestrator.start', () => {
  it('creates a run at INIT and returns the first directive', async () => {
    const runStore = new InMemoryRunStore();
    const orch = createOrchestrator({
      runStore,
      workingMemory: new InMemoryWorkingMemory(),
      preferences: new StaticPreferencesStore({ preferredPlatforms: ['douyin'] } as any)
    });
    const { runId, directive } = await orch.start({ userId: 'u', orgId: 'o', dryRun: true });
    expect(directive.node).toBe('INIT');
    expect(directive.agent).toBe('publish');
    expect(directive.dryRun).toBe(true);
    const state = await runStore.get(runId);
    expect(state?.currentNode).toBe('INIT');
    expect(state?.status).toBe('running');
  });

  it('defaults autonomyLevel to L2_AUTOPILOT_LIGHT', async () => {
    const orch = createOrchestrator({
      runStore: new InMemoryRunStore(),
      workingMemory: new InMemoryWorkingMemory(),
      preferences: new StaticPreferencesStore({} as any)
    });
    const { directive } = await orch.start({ userId: 'u', orgId: 'o' });
    expect(directive.gateLevel).toBe('L2_AUTOPILOT_LIGHT');
  });
});

describe('orchestrator.report', () => {
  const make = () =>
    createOrchestrator({
      runStore: new InMemoryRunStore(),
      workingMemory: new InMemoryWorkingMemory(),
      preferences: new StaticPreferencesStore({} as any)
    });

  it('advances INIT→METRICS on outcome=done', async () => {
    const orch = make();
    const { runId } = await orch.start({ userId: 'u', orgId: 'o', dryRun: true });
    const out = await orch.report({ runId, result: { node: 'INIT', outcome: 'done', summary: 'auth ok' } });
    expect(out.status).toBe('running');
    if (out.status !== 'running') throw new Error('unreachable');
    expect(out.directive.node).toBe('METRICS');
  });

  it('pauses on outcome=need_input and stays on the node', async () => {
    const orch = make();
    const { runId } = await orch.start({ userId: 'u', orgId: 'o', dryRun: true });
    const out = await orch.report({ runId, result: { node: 'INIT', outcome: 'need_input' } });
    expect(out.status).toBe('paused');
    if (out.status !== 'paused') throw new Error('unreachable');
    expect(out.directive.node).toBe('INIT');
  });

  it('completes after REVIEW outcome=done and returns the review bundle', async () => {
    const orch = make();
    const { runId } = await orch.start({ userId: 'u', orgId: 'o', dryRun: true });
    for (const node of ['INIT', 'METRICS', 'CONTENT', 'PUBLISH'] as const) {
      await orch.report({ runId, result: { node, outcome: 'done', summary: `${node} done` } });
    }
    const out = await orch.report({ runId, result: { node: 'REVIEW', outcome: 'done', summary: 'review done' } });
    expect(out.status).toBe('completed');
    if (out.status !== 'completed') throw new Error('unreachable');
    const review = out.review as { nodeResults: Record<string, { summary?: string }> };
    expect(review.nodeResults.PUBLISH.summary).toBe('PUBLISH done');
    expect(review.nodeResults.REVIEW.summary).toBe('review done');
  });

  it('fails on an unknown runId', async () => {
    const orch = make();
    const out = await orch.report({ runId: 'nope', result: { node: 'INIT', outcome: 'done' } });
    expect(out.status).toBe('failed');
  });
});
