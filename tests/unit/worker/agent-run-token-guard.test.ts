import { describe, it, expect, vi } from 'vitest';

// Regression: BullMQ calls job processors as (job, token, abortSignal) —
// `token` (2nd) is a string, `abortSignal` (3rd) is an AbortSignal; neither
// is a DatabaseClient / LLMClient. handleAgentRun's test-only `dbOverride` /
// `llmClientOverride` occupy those same positional slots. Before the guards,
// `db = token` (a string) crashed db.agentRun with "Cannot read properties of
// undefined (reading 'findUnique')", and `llmClient = abortSignal` crashed
// chatWithTools with "config.client.chatWithTools is not a function" — on
// every production agent.run. The mock returns a stub db so that, when the
// BullMQ args are correctly ignored, the handler reaches the "not found"
// check rather than crashing.
vi.mock('@ai-growth-ops/database', () => {
  const stubDb = { agentRun: { findUnique: async () => null } };
  return { createDatabaseClient: () => stubDb };
});

const { handleAgentRun } = await import(
  '../../../apps/worker/src/job-handlers/agent.run'
);

describe('handleAgentRun — BullMQ positional-arg pollution guards', () => {
  it('ignores the BullMQ token string passed as 2nd positional arg', async () => {
    // job.data.runId present → handler skips the daily-run create branch and
    // goes straight to agentRun.findUnique. If the token string were used as
    // db, this would reject with the findUnique crash, NOT "AgentRun not found".
    await expect(
      handleAgentRun(
        { data: { runId: 'x' } } as never,
        'bullmq-job-token' as never
      )
    ).rejects.toThrow('AgentRun x not found');
  });

  it('ignores the BullMQ abortSignal passed as 3rd positional arg', async () => {
    // The 3rd positional slot collides with llmClientOverride. If the
    // AbortSignal were honored as the LLM client, runDomainAgent would crash
    // on chatWithTools. Here the run is not found before the LLM is reached,
    // so this guards the db path; the llmClient guard is symmetric (same
    // type-check on chatWithTools) and its accept-path is exercised by
    // agent-run-resume.test.ts, which injects a real LLMClient stub.
    const ac = new AbortController();
    await expect(
      handleAgentRun(
        { data: { runId: 'x' } } as never,
        'bullmq-job-token' as never,
        ac.signal as never
      )
    ).rejects.toThrow('AgentRun x not found');
  });
});
