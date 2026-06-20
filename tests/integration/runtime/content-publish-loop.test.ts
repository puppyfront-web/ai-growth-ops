import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { handleAgentRun } from '../../../apps/worker/src/job-handlers/agent.run';
import type { LLMClient, LLMToolResponse } from '@ai-growth-ops/ai';

/**
 * Deterministic stub LLM. Alternates per chatWithTools call:
 *  - odd call (with tools available): emit the FIRST tool the agent exposes
 *    (exercises the ConfirmationGate's dry-run interception, including at PUBLISH),
 *  - even call: emit final text (terminates the node after 1 tool round).
 * Each domain-agent node therefore consumes exactly 2 calls; the REVIEW node
 * is the supervisor (no LLM). No real LLM / browser-runner / Redis required.
 *
 * The stub's chatWithTools deliberately does NOT invoke the `onToolCall` it is
 * handed — only `runAgentLoop` (packages/ai) calls it, exactly once per emitted
 * tool call. So there is no double-dispatch against the gate; one emitted tool
 * call → exactly one `gate.check`.
 */
function createStubLLM(): LLMClient {
  let n = 0;
  const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
  return {
    getProvider: () => 'openai',
    getModel: () => 'stub',
    chat: async (m) => ({
      text: m[m.length - 1]?.content ?? 'stub',
      model: 'stub',
      provider: 'openai',
      tokenUsage: usage,
      finishReason: 'stop',
      latencyMs: 0
    }),
    chatWithTools: async (_messages, options): Promise<LLMToolResponse> => {
      n++;
      const tools = options.tools ?? [];
      if (tools.length > 0 && n % 2 === 1) {
        return {
          text: '',
          model: 'stub',
          provider: 'openai',
          tokenUsage: usage,
          finishReason: 'tool_use',
          latencyMs: 0,
          toolCalls: [
            { id: `stub-${n}`, name: tools[0].name, arguments: {} }
          ]
        };
      }
      return {
        text: `节点完成 #${Math.ceil(n / 2)}`,
        model: 'stub',
        provider: 'openai',
        tokenUsage: usage,
        finishReason: 'stop',
        latencyMs: 0,
        toolCalls: []
      };
    }
  };
}

describe('content→publish loop (dry-run, integration)', () => {
  let db: DatabaseClient;
  let runId: string;

  beforeAll(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
    const admin = await db.user.findFirst({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const org = await db.organization.findFirst();
    expect(admin).toBeTruthy();
    expect(org).toBeTruthy();
    const run = await db.agentRun.create({
      data: {
        organizationId: org!.id,
        userId: admin!.id,
        // L2 + dryRun → gate simulates all tool calls as blocked-but-not-escalated
        // → escalatedItems stays empty → node outcome 'done' every node → loop
        // advances through all 5 nodes to REVIEW (completed → 'success').
        agentName: 'L2_AUTOPILOT_LIGHT',
        status: 'pending',
        input: { dryRun: true }
      }
    });
    runId = run.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('runs all 5 nodes to completion, exercises the dry-run gate, and aggregates REVIEW', async () => {
    await handleAgentRun(
      { data: { runId } } as any,
      db,
      createStubLLM()
    );

    const run = await db.agentRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe('success');
    expect(run?.error).toBeNull();

    const state = (run?.output ?? {}) as {
      currentNode?: string;
      nodeResults?: Record<string, { summary?: string } | undefined>;
    };
    expect(state.currentNode).toBe('REVIEW');

    const filled = Object.entries(state.nodeResults ?? {}).filter(
      ([, v]) => !!v
    );
    expect(filled).toHaveLength(5); // INIT, METRICS, CONTENT, PUBLISH, REVIEW all recorded
    for (const [, v] of filled) {
      expect(typeof v?.summary).toBe('string');
      expect((v!.summary as string).length).toBeGreaterThan(0);
    }

    // REVIEW node aggregates the prior node summaries — confirm it captured them.
    const review = state.nodeResults?.REVIEW;
    expect(review?.summary).toBeTruthy();
  }, 60_000);
});
