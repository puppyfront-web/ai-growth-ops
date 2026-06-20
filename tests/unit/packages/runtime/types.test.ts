import { describe, it, expect } from 'vitest';
import type {
  AutonomyLevel, RiskLevel, GateDecision, GateInput, ConfirmationGate,
  WorkingMemory, UserPreferences, PreferenceDomain, PreferencesStore,
  AgentDefinition, LoopNode, NodeOutcome, NodeResult, SupervisorState, ToolDomain, Mutate
} from '@ai-growth-ops/runtime';

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
