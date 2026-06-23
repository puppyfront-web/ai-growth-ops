import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { registerToolGroup, clearRegistry, type ToolDefinition } from '@ai-growth-ops/ai-tools';
import { registerRuntimeTools, createConfirmationGate } from '@ai-growth-ops/runtime';
import {
  buildMcpServer,
  createOrchestrator,
  createToolExecutor,
  InMemoryRunStore,
  InMemoryWorkingMemory,
  StaticPreferencesStore,
  EnvCredentialResolver
} from '@ai-growth-ops/runtime-mcp';

afterEach(() => {
  clearRegistry();
  registerRuntimeTools();
});

describe('full dry-run content→publish loop', () => {
  it('drives INIT→METRICS→CONTENT→PUBLISH→REVIEW to completed with writes blocked by dry-run', async () => {
    // Deterministic fakes under the runtime tool names so the loop does not depend on
    // a live browser-runner. dryRun=true blocks the write (auth.login) at the gate anyway.
    const fakes: ToolDefinition[] = [
      { name: 'auth.login', description: 'fake', inputSchema: z.object({ platform: z.string() }), execute: async () => ({ loggedIn: true }) },
      { name: 'auth.status', description: 'fake', inputSchema: z.object({ platform: z.string(), cookie: z.string().optional() }), execute: async () => ({ valid: true }) },
      { name: 'content.list_videos', description: 'fake', inputSchema: z.object({ platform: z.string(), cookie: z.string().optional() }), execute: async () => ({ videos: [] }) },
      { name: 'publish.video', description: 'fake write', inputSchema: z.object({ platform: z.string(), content: z.string(), cookie: z.string().optional() }), execute: async () => ({ published: true }) }
    ];
    clearRegistry();
    registerToolGroup({ name: 'runtime', tools: fakes });

    const runStore = new InMemoryRunStore(); // shared so executor sees the run the orchestrator created
    const orch = createOrchestrator({
      runStore,
      workingMemory: new InMemoryWorkingMemory(),
      preferences: new StaticPreferencesStore({ preferredPlatforms: ['douyin'] } as never)
    });
    const exec = createToolExecutor({
      runStore,
      gate: createConfirmationGate(),
      credentials: new EnvCredentialResolver({})
    });

    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = buildMcpServer(orch, exec);
    await server.connect(serverT);
    const client = new Client({ name: 'itest', version: '0' }, { capabilities: {} });
    await client.connect(clientT);

    const call = (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }).then((r) => JSON.parse((r.content as Array<{ text: string }>)[0].text));

    // 1. start → INIT directive
    const start = await call('supervisor.start', { userId: 'u', orgId: 'o', dryRun: true });
    const runId = start.runId as string;
    expect(start.directive.node).toBe('INIT');

    // 2. inside INIT, the host attempts a write (auth.login) → dry-run gate blocks it
    const blocked = await call('auth.login', { runId, platform: 'douyin' });
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toMatch(/dry-run/i);

    // 3. host reports each node done; supervisor advances through the loop to completed
    let final: { status: string; review?: { nodeResults: Record<string, { summary?: string }> } } | null = null;
    for (const node of ['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW'] as const) {
      const out = await call('supervisor.report', { runId, result: { node, outcome: 'done', summary: `${node} ok` } });
      if (out.status === 'completed') {
        final = out;
        break;
      }
    }
    expect(final).not.toBeNull();
    expect(final!.status).toBe('completed');
    expect(final!.review!.nodeResults.PUBLISH.summary).toBe('PUBLISH ok');
    expect(final!.review!.nodeResults.REVIEW.summary).toBe('REVIEW ok');
  });
});
