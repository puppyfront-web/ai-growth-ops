import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import {
  handleAgentRun,
  type AgentRunJobPayload
} from '../../../apps/worker/src/job-handlers/agent.run';
import type { LLMClient } from '@ai-growth-ops/ai';

/**
 * Regression tests for the C1 BullMQ-retry re-entry guard at the top of
 * `handleAgentRun`.
 *
 * Policy under test:
 *  (a) run.status==='success' → idempotent no-op (return immediately).
 *  (b) run.status==='failed' + output.nodeResults.PUBLISH present → do NOT
 *      re-run the loop, do NOT throw (so BullMQ stops retrying).
 *  (c) run.status==='failed' with NO PUBLISH result → re-run normally
 *      (guard does not over-block).
 */
describe('handleAgentRun re-entry guard (C1)', () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function seedRun(overrides: {
    status: string;
    output?: Record<string, unknown>;
    agentName?: string;
  }): Promise<string> {
    const admin = await db.user.findFirst({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const org = await db.organization.findFirst();
    if (!admin || !org) throw new Error('seed incomplete');
    const run = await db.agentRun.create({
      data: {
        organizationId: org.id,
        userId: admin.id,
        agentName: overrides.agentName ?? 'L2_AUTOPILOT_LIGHT',
        status: overrides.status,
        input: { dryRun: true },
        output: overrides.output ?? undefined
      }
    });
    return run.id;
  }

  /**
   * An LLM stub that, if ever invoked, throws. Used to PROVE the guard
   * short-circuited before loop init: if the guard is removed, this stub
   * is called by runDomainAgent and the handler will throw.
   */
  function explodingLLM(): LLMClient {
    const boom = vi.fn(async () => {
      throw new Error('GUARD_BYPASSED: LLM must not be called');
    });
    return {
      getProvider: () => 'stub',
      getModel: () => 'stub-explode',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chat: boom as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chatWithTools: boom as any
    };
  }

  it('(a) status:"success" → returns without mutating anything', async () => {
    const runId = await seedRun({
      status: 'success',
      output: { currentNode: 'REVIEW' }
    });
    const before = await db.agentRun.findUnique({ where: { id: runId } });

    await expect(
      handleAgentRun(
        { data: { runId } } as unknown as Job<AgentRunJobPayload>,
        db,
        explodingLLM()
      )
    ).resolves.toBeUndefined();

    const after = await db.agentRun.findUnique({ where: { id: runId } });
    // Nothing mutated — same status, same output.
    expect(after?.status).toBe('success');
    expect(after?.output).toEqual(before?.output);
  });

  it('(b) status:"failed" + nodeResults.PUBLISH present → does NOT re-run, does NOT throw', async () => {
    const runId = await seedRun({
      status: 'failed',
      output: {
        currentNode: 'PUBLISH',
        nodeResults: {
          INIT: { node: 'INIT', outcome: 'done', summary: 'i' },
          METRICS: { node: 'METRICS', outcome: 'done', summary: 'm' },
          CONTENT: { node: 'CONTENT', outcome: 'done', summary: 'c' },
          PUBLISH: { node: 'PUBLISH', outcome: 'done', summary: 'p' }
        }
      }
    });

    const exploding = explodingLLM();
    await expect(
      handleAgentRun(
        { data: { runId } } as unknown as Job<AgentRunJobPayload>,
        db,
        exploding
      )
    ).resolves.toBeUndefined();

    // LLM was NEVER invoked — the guard short-circuited before loop init.
    expect(exploding.chat).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((exploding as any).chatWithTools).not.toHaveBeenCalled();

    const after = await db.agentRun.findUnique({ where: { id: runId } });
    // status stays 'failed'; error updated to note manual-review required.
    expect(after?.status).toBe('failed');
    expect(after?.error).toMatch(/aborted retry/i);
    expect(after?.error).toMatch(/PUBLISH/i);
  });

  it('(c) status:"failed" with NO PUBLISH result → re-runs normally (guard does not over-block)', async () => {
    const runId = await seedRun({
      status: 'failed',
      // Only INIT present — no PUBLISH → safe to re-run.
      output: {
        currentNode: 'INIT',
        nodeResults: { INIT: { node: 'INIT', outcome: 'done', summary: 'i' } }
      }
    });

    // A normal stub LLM that returns final text immediately (no tool calls)
    // — enough to prove the loop was entered and completed.
    const normalLLM: LLMClient = {
      getProvider: () => 'stub',
      getModel: () => 'stub-normal',
      chat: async (m) => ({
        text: m[m.length - 1]?.content ?? 'ok',
        model: 'stub',
        provider: 'openai',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
        latencyMs: 0
      }),
      chatWithTools: async () => ({
        text: 'node done',
        model: 'stub',
        provider: 'openai',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
        latencyMs: 0,
        toolCalls: []
      })
    };

    await handleAgentRun(
      { data: { runId } } as unknown as Job<AgentRunJobPayload>,
      db,
      normalLLM
    );

    const after = await db.agentRun.findUnique({ where: { id: runId } });
    // The loop ran and the run transitioned out of 'failed'.
    expect(after?.status).not.toBe('failed');
    expect(after?.status).toBe('success');
  }, 60_000);
});
