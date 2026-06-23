import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { registerToolGroup, clearRegistry, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import { DefaultConfirmationGate, registerRuntimeTools, type SupervisorState } from '@ai-growth-ops/runtime';
import { createToolExecutor, InMemoryRunStore, EnvCredentialResolver } from '@ai-growth-ops/runtime-mcp';

const initState = (node: SupervisorState['currentNode'], dryRun = true): SupervisorState => ({
  runId: 'r1', userId: 'u', orgId: 'o', autonomyLevel: 'L2_AUTOPILOT_LIGHT', dryRun,
  currentNode: node,
  nodeResults: { INIT: undefined, METRICS: undefined, CONTENT: undefined, PUBLISH: undefined, REVIEW: undefined },
  startedAt: '2026-06-23T00:00:00.000Z', status: 'running'
});

// Some tests swap the global tool registry; always restore the 5 runtime tools after.
afterEach(() => {
  clearRegistry();
  registerRuntimeTools();
});

describe('tool-executor domain isolation', () => {
  it('rejects a tool not allowed in the current node agent', async () => {
    const runStore = new InMemoryRunStore();
    await runStore.set('r1', initState('INIT')); // INIT → publish agent (auth.*/publish.*)
    const exec = createToolExecutor({
      runStore,
      gate: new DefaultConfirmationGate(),
      credentials: new EnvCredentialResolver({})
    });
    const res = await exec.execute('r1', 'content.list_videos', { platform: 'douyin' });
    expect(res.blocked).toBe(true);
    expect(res.escalated).toBe(false);
    expect(String(res.reason)).toMatch(/domain isolation/i);
  });

  it('rejects any tool on the REVIEW supervisor node', async () => {
    const runStore = new InMemoryRunStore();
    await runStore.set('r1', initState('REVIEW'));
    const exec = createToolExecutor({
      runStore,
      gate: new DefaultConfirmationGate(),
      credentials: new EnvCredentialResolver({})
    });
    const res = await exec.execute('r1', 'content.list_videos', { platform: 'douyin' });
    expect(res.blocked).toBe(true);
    expect(String(res.reason)).toMatch(/supervisor/i);
  });
});

describe('tool-executor write-gate enforcement', () => {
  it('dry-run blocks a write tool with simulated output and no escalation', async () => {
    const runStore = new InMemoryRunStore();
    await runStore.set('r1', initState('INIT')); // publish agent; auth.login is a Write
    const exec = createToolExecutor({
      runStore,
      gate: new DefaultConfirmationGate(),
      credentials: new EnvCredentialResolver({})
    });
    const res = await exec.execute('r1', 'auth.login', { platform: 'douyin' });
    expect(res.blocked).toBe(true);
    expect(res.escalated).toBe(false); // dry-run, not an escalation
    expect(res.reason).toMatch(/dry-run/i);
  });

  it('L2 escalates a high-risk write (not dry-run) instead of executing', async () => {
    const runStore = new InMemoryRunStore();
    await runStore.set('r1', initState('PUBLISH', false)); // publish.video is a Write
    const exec = createToolExecutor({
      runStore,
      gate: new DefaultConfirmationGate(),
      credentials: new EnvCredentialResolver({ AI_GROWTH_OPS_DOUYIN_COOKIE: 'c' })
    });
    const res = await exec.execute('r1', 'publish.video', {
      platform: 'douyin', content: 'hi', __risk: 'high', __confidence: 0.5
    });
    expect(res.blocked).toBe(true);
    expect(res.escalated).toBe(true);
    expect(res.reason).toMatch(/L2 escalate/i);
  });
});

describe('tool-executor credential injection + output scrub', () => {
  it('injects cookie server-side from the resolver, executes, and scrubs it from output', async () => {
    // Spy tool registered under a name the content agent allows on METRICS.
    clearRegistry();
    const spyTool: ToolDefinition = {
      name: 'content.list_videos',
      description: 'test spy',
      inputSchema: z.object({ platform: z.string(), cookie: z.string().optional() }),
      execute: async (args: { platform: string; cookie?: string }) => ({
        gotCookie: !!args.cookie,
        deep: { cookie: args.cookie ?? null }
      })
    };
    registerToolGroup({ name: 'runtime', tools: [spyTool] });

    const runStore = new InMemoryRunStore();
    await runStore.set('r1', initState('METRICS', false)); // read tool, dry-run off → skips gate

    const seen = { userId: '', orgId: '' };
    const exec = createToolExecutor({
      runStore,
      gate: new DefaultConfirmationGate(),
      credentials: {
        getCookie: async (userId, orgId) => {
          seen.userId = userId;
          seen.orgId = orgId;
          return 'server-cookie';
        }
      }
    });

    const res = await exec.execute('r1', 'content.list_videos', { platform: 'douyin' }); // host sends NO cookie

    expect(seen).toEqual({ userId: 'u', orgId: 'o' }); // resolver called with run's user/org
    expect((res.output as { gotCookie: boolean }).gotCookie).toBe(true); // cookie reached the tool
    expect(JSON.stringify(res.output)).not.toContain('server-cookie'); // scrubbed before return
  });
});
