import { describe, it, expect } from 'vitest';
import { buildNodeDirective, InMemoryWorkingMemory, StaticPreferencesStore } from '@ai-growth-ops/runtime-mcp';
import type { SupervisorState } from '@ai-growth-ops/runtime';

const baseState: SupervisorState = {
  runId: 'r1',
  userId: 'u1',
  orgId: 'o1',
  autonomyLevel: 'L2_AUTOPILOT_LIGHT',
  dryRun: true,
  currentNode: 'INIT',
  nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
  startedAt: '2026-06-23T00:00:00.000Z',
  status: 'running'
};

describe('buildNodeDirective', () => {
  it('packages a normal agent node with instructions, allowedTools, L0/L1 context', async () => {
    const wm = new InMemoryWorkingMemory();
    await wm.set('INIT', 'today', { videos: 3 });
    const prefs = new StaticPreferencesStore({ preferredPlatforms: ['douyin'], brandVoice: 'bold' } as any);
    const d = await buildNodeDirective(baseState, { workingMemory: wm, preferences: prefs });
    expect(d.node).toBe('INIT');
    expect(d.agent).toBe('publish');
    expect(d.gateLevel).toBe('L2_AUTOPILOT_LIGHT');
    expect(d.dryRun).toBe(true);
    expect(d.allowedTools).toEqual(expect.arrayContaining(['auth.login', 'auth.status', 'publish.video']));
    expect(d.context.l0).toEqual({ today: { videos: 3 } });
    expect(typeof d.instructions).toBe('string');
    expect(d.instructions.length).toBeGreaterThan(0);
  });

  it('packages the REVIEW supervisor node with empty allowedTools', async () => {
    const wm = new InMemoryWorkingMemory();
    const prefs = new StaticPreferencesStore({} as any);
    const d = await buildNodeDirective({ ...baseState, currentNode: 'REVIEW' }, { workingMemory: wm, preferences: prefs });
    expect(d.agent).toBe('supervisor');
    expect(d.allowedTools).toEqual([]);
    expect(d.instructions.toLowerCase()).toContain('review');
  });
});
