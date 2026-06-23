import { describe, it, expect, vi } from 'vitest';

// Regression: BullMQ calls job processors as (job, token) where `token` is a
// string. handleAgentRun's test-only `dbOverride` occupies that same 2nd
// positional slot. Before the guard, `db = token ?? createDatabaseClient()`
// → db was a string → db.agentRun crashed with
// "Cannot read properties of undefined (reading 'findUnique')" on every
// production agent.run. The mock returns a stub client so that, when the
// token string is correctly ignored, the handler falls through to
// createDatabaseClient() (the stub) and reaches the "not found" check.
vi.mock('@ai-growth-ops/database', () => {
  const stubDb = { agentRun: { findUnique: async () => null } };
  return { createDatabaseClient: () => stubDb };
});

const { handleAgentRun } = await import(
  '../../../apps/worker/src/job-handlers/agent.run'
);

describe('handleAgentRun — BullMQ token-pollution guard', () => {
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
});
