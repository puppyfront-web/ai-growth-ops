import { describe, it, expect } from 'vitest';
import { createConfirmationGate } from '@ai-growth-ops/runtime';
import type { GateInput } from '@ai-growth-ops/runtime';

function writeInput(over: Partial<GateInput> = {}): GateInput {
  return {
    toolName: 'publish.video', mutate: 'Write', input: {}, risk: 'low',
    confidence: 0.9, autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun: false, ...over
  };
}

describe('DefaultConfirmationGate', () => {
  const gate = createConfirmationGate();

  it('dry-run blocks every write with a simulated output', () => {
    const d = gate.check(writeInput({ dryRun: true }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(false);
    expect(d.simulatedOutput).toMatchObject({ dryRun: true, toolName: 'publish.video' });
  });

  it('always allows reads regardless of autonomy', () => {
    for (const lvl of ['L1_COPILOT', 'L2_AUTOPILOT_LIGHT', 'L3_FULL_AUTOPILOT'] as const) {
      expect(gate.check(writeInput({ mutate: 'Read', autonomyLevel: lvl })).allowed).toBe(true);
    }
  });

  it('L1 escalates all writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L1_COPILOT', risk: 'low', confidence: 0.99 }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(true);
  });

  it('L2 auto-approves low-risk high-confidence writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', risk: 'low', confidence: 0.8 }));
    expect(d.allowed).toBe(true);
    expect(d.escalated).toBe(false);
  });

  it('L2 escalates high-risk writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', risk: 'high', confidence: 0.95 }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(true);
  });

  it('L2 escalates low-confidence writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L2_AUTOPILOT_LIGHT', risk: 'low', confidence: 0.5 }));
    expect(d.allowed).toBe(false);
    expect(d.escalated).toBe(true);
  });

  it('L3 auto-approves all writes', () => {
    const d = gate.check(writeInput({ autonomyLevel: 'L3_FULL_AUTOPILOT', risk: 'high', confidence: 0.1 }));
    expect(d.allowed).toBe(true);
    expect(d.escalated).toBe(false);
  });
});
