import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  buildMcpServer,
  createOrchestrator,
  createToolExecutor,
  InMemoryRunStore,
  InMemoryWorkingMemory,
  StaticPreferencesStore,
  EnvCredentialResolver
} from '@ai-growth-ops/runtime-mcp';
import { createConfirmationGate } from '@ai-growth-ops/runtime';

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const runStore = new InMemoryRunStore();
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
  const server = buildMcpServer(orch, exec);
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);
  return { client, server };
}

describe('MCP server', () => {
  it('lists supervisor.start, supervisor.report plus the registry tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('supervisor.start');
    expect(names).toContain('supervisor.report');
    expect(names).toContain('content.list_videos');
    expect(names).toContain('publish.video');
  });

  it('supervisor.start returns a NodeDirective as JSON text', async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: 'supervisor.start',
      arguments: { userId: 'u', orgId: 'o', dryRun: true }
    });
    const text = (res.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.directive.node).toBe('INIT');
    expect(parsed.runId).toEqual(expect.any(String));
  });

  it('routes a proxied tool call through the executor (domain block surfaces)', async () => {
    const { client } = await connect();
    // Start a run at INIT (publish agent), then call a content tool → domain isolation blocks it.
    const startRes = await client.callTool({
      name: 'supervisor.start',
      arguments: { userId: 'u', orgId: 'o', dryRun: true }
    });
    const runId = JSON.parse((startRes.content as Array<{ text: string }>)[0].text).runId;
    const res = await client.callTool({
      name: 'content.list_videos',
      arguments: { runId, platform: 'douyin' }
    });
    const parsed = JSON.parse((res.content as Array<{ text: string }>)[0].text);
    expect(parsed.blocked).toBe(true);
    expect(String(parsed.reason)).toMatch(/domain isolation/i);
  });
});
