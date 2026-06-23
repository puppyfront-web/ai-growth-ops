import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearRegistry,
  registerToolGroup,
  type ToolDefinition
} from '@ai-growth-ops/ai-tools';
import { z } from 'zod';
import type { LLMClient } from '@ai-growth-ops/runtime';

const { handleAgentRun } = await import(
  '../../../apps/worker/src/job-handlers/agent.run'
);

// WRITE spy tool — publish.* prefix → inferMutate 'Write'. Under L2 + high
// risk the gate escalates it; on resume the approval must unlock execution.
const writeSeen: Array<Record<string, unknown>> = [];
const writeTool: ToolDefinition = {
  name: 'publish.video',
  description: 'publish a video',
  inputSchema: z.object({
    platform: z.string(),
    title: z.string(),
    cookie: z.string().optional()
  }),
  execute: async (args: Record<string, unknown>) => {
    writeSeen.push(args);
    return { ok: true, published: true };
  }
};

// Resume stub LLM: one high-risk publish.video call, then finalize.
function resumeLlm(): LLMClient {
  let step = 0;
  return {
    chatWithTools: async () => {
      step += 1;
      if (step === 1) {
        return {
          text: '',
          toolCalls: [
            {
              id: 'r1',
              name: 'publish.video',
              arguments: { platform: 'douyin', title: 't', __risk: 'high', __confidence: 0.9 }
            }
          ],
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
        } as never;
      }
      return { text: 'published', toolCalls: [], tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } as never;
    }
  } as never;
}

function makeResumeDb(): { db: unknown; updates: Array<Record<string, unknown>>; counts: { notifications: number } } {
  const updates: Array<Record<string, unknown>> = [];
  const counts = { notifications: 0 };
  const pausedRun = {
    id: 'run-1',
    organizationId: 'org-1',
    userId: 'admin-1',
    agentName: 'L2_AUTOPILOT_LIGHT',
    status: 'paused',
    input: { dryRun: false },
    output: {
      currentNode: 'PUBLISH',
      nodeResults: {
        INIT: { node: 'INIT', outcome: 'done', summary: 'ok' },
        METRICS: { node: 'METRICS', outcome: 'done', summary: 'ok' },
        CONTENT: { node: 'CONTENT', outcome: 'done', summary: 'ok' },
        PUBLISH: {
          node: 'PUBLISH',
          outcome: 'need_input',
          summary: 'escalated',
          escalatedItems: [
            { toolName: 'publish.video', input: { platform: 'douyin' }, risk: 'high' }
          ]
        },
        REVIEW: undefined
      },
      startedAt: '2026-06-23T00:00:00.000Z'
    },
    metadata: { approvals: [{ node: 'PUBLISH', toolName: 'publish.video' }] },
    tokensUsed: 100,
    error: null
  };
  const db = {
    agentRun: {
      findUnique: async () => ({ ...pausedRun, output: { ...pausedRun.output, nodeResults: { ...pausedRun.output.nodeResults } } }),
      update: async (a: { data: Record<string, unknown> }) => {
        updates.push(a.data);
        return {};
      }
    },
    appConfig: { findUnique: async () => null },
    platformAccount: { findFirst: async () => null },
    notification: { create: async () => { counts.notifications += 1; return {}; } },
    $disconnect: async () => {}
  };
  return { db, updates, counts };
}

beforeEach(() => {
  writeSeen.length = 0;
  clearRegistry();
  registerToolGroup({ name: 'pub', tools: [writeTool] });
});

describe('handleAgentRun (auto-resume of a paused run)', () => {
  it('resumes from the paused node and executes the approved write tool', async () => {
    const { db, updates, counts } = makeResumeDb();
    await handleAgentRun(
      { data: { runId: 'run-1' } } as never,
      db as never,
      resumeLlm()
    );

    // The previously-escalated write tool now executed (approval unlocked it).
    expect(writeSeen.length).toBeGreaterThanOrEqual(1);
    expect(writeSeen[0].platform).toBe('douyin');
    // Resumed run flipped to running, ran to completion, published a report.
    expect(updates.some((u) => u.status === 'running')).toBe(true);
    expect(updates.some((u) => u.status === 'success')).toBe(true);
    expect(counts.notifications).toBe(1);
    // Resume must NOT reset startedAt (preserves original run start time).
    expect(updates.find((u) => u.status === 'running')).not.toHaveProperty('startedAt');
  });
});
