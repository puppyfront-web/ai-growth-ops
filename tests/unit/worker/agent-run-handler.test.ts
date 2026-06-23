import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearRegistry,
  registerToolGroup,
  type ToolDefinition
} from '@ai-growth-ops/ai-tools';
import { z } from 'zod';
import type { LLMClient } from '@ai-growth-ops/runtime';

// Three `../` to reach repo root from tests/unit/worker/ (matches
// interaction-sync-utils.test.ts convention).
const { handleAgentRun } = await import(
  '../../../apps/worker/src/job-handlers/agent.run'
);

// ── Spy read tool ────────────────────────────────────────────────────
// Registers a READ tool (name has no write prefix → inferMutate → 'Read')
// so that under dryRun=false + L2 it auto-approves and reaches execute,
// letting us observe the credential-injection path end to end.
const seenInputs: Array<Record<string, unknown>> = [];
const spyTool: ToolDefinition = {
  name: 'metrics.spy_read',
  description: 'spy read tool',
  inputSchema: z.object({
    platform: z.string(),
    cookie: z.string().optional()
  }),
  execute: async (args: Record<string, unknown>) => {
    seenInputs.push(args);
    return { ok: true };
  }
};

// ── Stub LLM ─────────────────────────────────────────────────────────
// Odd LLM calls emit the spy tool call; even calls finalize. Each
// runDomainAgent invocation therefore does exactly 2 LLM steps across the
// 4 domain nodes (INIT/METRICS/CONTENT/PUBLISH); REVIEW is the supervisor
// node and never calls the LLM.
function makeStubLlm(): LLMClient {
  let n = 0;
  return {
    chatWithTools: async () => {
      n += 1;
      if (n % 2 === 1) {
        return {
          text: '',
          toolCalls: [
            {
              id: `c${n}`,
              name: 'metrics.spy_read',
              arguments: { platform: 'douyin' }
            }
          ],
          tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
        } as never;
      }
      return {
        text: 'done',
        toolCalls: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      } as never;
    }
  } as never;
}

// ── Stub db ──────────────────────────────────────────────────────────
interface DbStubs {
  createCalls: Array<{ data: Record<string, unknown> }>;
  platformAccountCalls: Array<Record<string, unknown>>;
  notificationCalls: Array<{ data: Record<string, unknown> }>;
}

function makeDb(): { db: unknown; stubs: DbStubs } {
  const stubs: DbStubs = {
    createCalls: [],
    platformAccountCalls: [],
    notificationCalls: []
  };
  // Mutable row: `create` writes into it, `findUnique` reflects it back so the
  // handler reads the SAME dryRun value it persisted (not a hardcoded stub).
  const runRow: Record<string, unknown> = {
    id: 'run-1',
    organizationId: 'org-1',
    userId: 'admin-1',
    agentName: 'L2_AUTOPILOT_LIGHT',
    input: { dryRun: true },
    status: 'pending',
    output: null
  };
  const db = {
    user: { findFirst: async () => ({ id: 'admin-1', email: 'a@b' }) },
    organization: { findFirst: async () => ({ id: 'org-1' }) },
    agentRun: {
      create: async (a: { data: Record<string, unknown> }) => {
        stubs.createCalls.push(a);
        Object.assign(runRow, a.data);
        return { ...runRow };
      },
      findUnique: async () => ({ ...runRow }),
      update: async () => ({})
    },
    appConfig: { findUnique: async () => null },
    platformAccount: {
      findFirst: async (a: Record<string, unknown>) => {
        stubs.platformAccountCalls.push(a);
        return { cookieRef: 'enc-cookie' };
      }
    },
    notification: {
      create: async (a: { data: Record<string, unknown> }) => {
        stubs.notificationCalls.push(a);
        return {};
      }
    },
    $disconnect: async () => {}
  };
  return { db, stubs };
}

beforeEach(() => {
  seenInputs.length = 0;
  clearRegistry();
  registerToolGroup({ name: 'spy', tools: [spyTool] });
});

afterEach(() => {
  clearRegistry();
});

describe('handleAgentRun (daily scheduled path)', () => {
  it('defaults the daily run to dry-run and publishes a Notification on completion', async () => {
    const prev = process.env.AGENT_DAILY_DRY_RUN;
    delete process.env.AGENT_DAILY_DRY_RUN;
    const { db, stubs } = makeDb();
    try {
      await handleAgentRun({ data: {} } as never, db as never, makeStubLlm());
    } finally {
      if (prev !== undefined) process.env.AGENT_DAILY_DRY_RUN = prev;
    }

    // dry-run is the safe default.
    expect(stubs.createCalls).toHaveLength(1);
    expect(stubs.createCalls[0].data.input).toMatchObject({ dryRun: true });
    // Under dry-run the gate blocks all tool execution → spy never runs.
    expect(seenInputs).toHaveLength(0);
    // Completed run → daily report written as an in-app Notification.
    expect(stubs.notificationCalls).toHaveLength(1);
    expect(stubs.notificationCalls[0].data.type).toBe('daily_report');
  });

  it('AGENT_DAILY_DRY_RUN=false wires the DB credential resolver into the execute path', async () => {
    const prev = process.env.AGENT_DAILY_DRY_RUN;
    process.env.AGENT_DAILY_DRY_RUN = 'false';
    const { db, stubs } = makeDb();
    try {
      await handleAgentRun({ data: {} } as never, db as never, makeStubLlm());
    } finally {
      if (prev !== undefined) process.env.AGENT_DAILY_DRY_RUN = prev;
      else delete process.env.AGENT_DAILY_DRY_RUN;
    }

    // Real-run mode opted in.
    expect(stubs.createCalls[0].data.input).toMatchObject({ dryRun: false });
    // Spy read tool reached execute (gate auto-approves reads under L2).
    expect(seenInputs.length).toBeGreaterThanOrEqual(1);
    expect(seenInputs[0].platform).toBe('douyin');
    // The handler-constructed resolver was invoked at execute time to look up
    // the platform cookie server-side (cookie never in the LLM context).
    expect(stubs.platformAccountCalls.length).toBeGreaterThanOrEqual(1);
    const firstWhere = stubs.platformAccountCalls[0] as { where?: Record<string, unknown> };
    expect(JSON.stringify(firstWhere)).toContain('admin-1');
    expect(JSON.stringify(firstWhere)).toContain('douyin');
    // Run still completes and publishes a report.
    expect(stubs.notificationCalls).toHaveLength(1);
  });
});
