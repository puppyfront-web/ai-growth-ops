import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getAllTools } from '@ai-growth-ops/ai-tools';
import { createConfirmationGate, registerRuntimeTools } from '@ai-growth-ops/runtime';
import type { Orchestrator } from './orchestrator.js';
import type { ToolExecutor } from './tool-executor.js';
import { createOrchestrator } from './orchestrator.js';
import { createToolExecutor } from './tool-executor.js';
import { InMemoryRunStore } from './run-store.js';
import { InMemoryWorkingMemory, StaticPreferencesStore } from './memory-stubs.js';
import { EnvCredentialResolver } from './credentials.js';

function asJsonSchema(schema: z.ZodType): Tool['inputSchema'] {
  const s = zodToJsonSchema(schema, { target: 'openApi3' }) as Record<string, unknown>;
  if ('$schema' in s) delete s.$schema;
  return s as Tool['inputSchema'];
}

function textOut(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
  };
}

function errorOut(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

const startInputSchema = z.object({
  userId: z.string(),
  orgId: z.string(),
  autonomyLevel: z.enum(['L1_COPILOT', 'L2_AUTOPILOT_LIGHT', 'L3_FULL_AUTOPILOT']).optional(),
  dryRun: z.boolean().optional()
});

const reportInputSchema = z.object({
  runId: z.string(),
  result: z.object({
    node: z.enum(['INIT', 'METRICS', 'CONTENT', 'PUBLISH', 'REVIEW']),
    outcome: z.enum(['done', 'need_input', 'blocked', 'empty']),
    summary: z.string().optional(),
    output: z.unknown().optional()
  })
});

export function buildMcpServer(orchestrator: Orchestrator, executor: ToolExecutor): Server {
  registerRuntimeTools();

  const server = new Server(
    { name: 'growth-ops-runtime-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const orchestration: Tool[] = [
      {
        name: 'supervisor.start',
        description:
          'Start a supervisor run. Returns { runId, directive } where directive is the first node ' +
          '(instructions + allowedTools + context) for the host to execute. Default autonomyLevel=L2_AUTOPILOT_LIGHT.',
        inputSchema: asJsonSchema(startInputSchema)
      },
      {
        name: 'supervisor.report',
        description:
          'Report a node result and receive the next directive, or { status:"completed", review }. ' +
          'Loop: start → (do work using allowedTools) → report → repeat until completed.',
        inputSchema: asJsonSchema(reportInputSchema)
      }
    ];
    const registry: Tool[] = getAllTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: asJsonSchema(t.inputSchema as z.ZodType)
    }));
    return { tools: [...orchestration, ...registry] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      if (name === 'supervisor.start') {
        return textOut(await orchestrator.start(args as Record<string, unknown> as never));
      }
      if (name === 'supervisor.report') {
        return textOut(await orchestrator.report(args as Record<string, unknown> as never));
      }
      const runId = (args as { runId?: string }).runId ?? '';
      const res = await executor.execute(runId, name, args as Record<string, unknown>);
      return textOut(res);
    } catch (err) {
      return errorOut(err instanceof Error ? err.message : String(err));
    }
  });

  return server;
}

/** Bin entry: wire real deps (in-memory stores, env credentials) and serve over stdio. */
export async function startServerFromEnv(): Promise<Server> {
  const runStore = new InMemoryRunStore();
  const workingMemory = new InMemoryWorkingMemory();
  const preferences = new StaticPreferencesStore({
    preferredPlatforms: ['douyin'],
    defaultContentType: 'video',
    preferredPublishTimes: [],
    contentStylePreferences: '',
    replyStylePreferences: '',
    avoidTopics: [],
    brandVoice: ''
  });
  const orchestrator = createOrchestrator({ runStore, workingMemory, preferences });
  const executor = createToolExecutor({
    runStore,
    gate: createConfirmationGate(),
    credentials: new EnvCredentialResolver()
  });
  const server = buildMcpServer(orchestrator, executor);
  await server.connect(new StdioServerTransport());
  return server;
}
