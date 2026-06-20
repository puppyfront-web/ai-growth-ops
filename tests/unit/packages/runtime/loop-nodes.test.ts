import { describe, it, expect } from 'vitest';
import { FIRST_SLICE_NODES, LEGAL_TRANSITIONS, AGENT_FOR_NODE, advance } from '@ai-growth-ops/runtime';
import type { NodeResult, SupervisorState } from '@ai-growth-ops/runtime';

function state(node: any): SupervisorState {
  return {
    runId: 'r', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false,
    currentNode: node,
    nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
    startedAt: '2026-06-18T00:00:00.000Z', status: 'running'
  };
}
function done(node: any): NodeResult { return { node, outcome: 'done' }; }

describe('loop nodes (first slice)', () => {
  it('defines the 5-node fixed loop', () => {
    expect(FIRST_SLICE_NODES).toEqual(['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW']);
  });

  it.each([
    ['INIT', 'METRICS'], ['METRICS', 'CONTENT'], ['CONTENT', 'PUBLISH'], ['PUBLISH', 'REVIEW']
  ] as const)('advances %s → %s on done', (from, to) => {
    expect(advance(state(from), done(from)).next).toBe(to);
  });

  it('ends the loop after REVIEW done', () => {
    expect(advance(state('REVIEW'), done('REVIEW')).next).toBeNull();
  });

  it.each([
    ['INIT'], ['METRICS'], ['CONTENT'], ['PUBLISH']
  ] as const)('pauses on need_input at %s', (node) => {
    const r = advance(state(node), { node, outcome: 'need_input' });
    expect(r.next).toBe(node);
    expect(r.outcome).toBe('need_input');
  });

  it('dispatches INIT/PUBLISH to publish-agent, METRICS/CONTENT to content-agent, REVIEW to supervisor', () => {
    expect(AGENT_FOR_NODE.INIT.domain).toBe('publish');
    expect(AGENT_FOR_NODE.PUBLISH.domain).toBe('publish');
    expect(AGENT_FOR_NODE.METRICS.domain).toBe('content');
    expect(AGENT_FOR_NODE.CONTENT.domain).toBe('content');
    expect(AGENT_FOR_NODE.REVIEW).toBe('supervisor');
  });
});
