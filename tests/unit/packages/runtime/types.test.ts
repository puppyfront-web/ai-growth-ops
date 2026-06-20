import { describe, it, expect } from 'vitest';
import type {
  AutonomyLevel, GateDecision, LoopNode, SupervisorState
} from '@ai-growth-ops/runtime';

// Compile-time check that the rest of the public type surface is exported
// from the runtime barrel. These types are exercised by behaviour in other
// test files (loop-nodes, supervisor, agent-loop); this tuple pins the
// exports so accidental removal of one surfaces as a type error here.
type _RuntimeTypeSurface = [
  import('@ai-growth-ops/runtime').RiskLevel,
  import('@ai-growth-ops/runtime').GateInput,
  import('@ai-growth-ops/runtime').ConfirmationGate,
  import('@ai-growth-ops/runtime').WorkingMemory,
  import('@ai-growth-ops/runtime').UserPreferences,
  import('@ai-growth-ops/runtime').PreferenceDomain,
  import('@ai-growth-ops/runtime').PreferencesStore,
  import('@ai-growth-ops/runtime').AgentDefinition,
  import('@ai-growth-ops/runtime').NodeOutcome,
  import('@ai-growth-ops/runtime').NodeResult,
  import('@ai-growth-ops/runtime').ToolDomain,
  import('@ai-growth-ops/runtime').Mutate
];

describe('runtime kernel contracts', () => {
  it('autonomy levels cover the three tiers', () => {
    const levels: AutonomyLevel[] = ['L1_COPILOT', 'L2_AUTOPILOT_LIGHT', 'L3_FULL_AUTOPILOT'];
    expect(levels).toHaveLength(3);
  });

  it('shapes a default supervisor state', () => {
    const state: SupervisorState = {
      runId: 'r1', userId: 'u1', orgId: 'o1',
      autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false,
      currentNode: 'INIT',
      nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
      startedAt: '2026-06-18T00:00:00.000Z', status: 'running'
    };
    expect(state.currentNode).toBe('INIT');
  });

  it('defines the first-slice loop nodes', () => {
    const nodes: LoopNode[] = ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'];
    expect(nodes).toHaveLength(5);
  });

  it('gate decision carries allow + escalate flags', () => {
    const d: GateDecision = { allowed: true, escalated: false, reason: 'low risk auto-approve' };
    expect(d.allowed).toBe(true);
  });
});
