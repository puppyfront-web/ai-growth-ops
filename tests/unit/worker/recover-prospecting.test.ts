import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), disconnect: vi.fn(),
  getJob: vi.fn(), close: vi.fn(), client: { sismember: vi.fn(), del: vi.fn(), lrem: vi.fn(), srem: vi.fn() }
}));
vi.mock('@ai-growth-ops/database', () => ({
  createDatabaseClient: () => ({ prospectingTask: { findMany: mocks.findMany, updateMany: mocks.updateMany }, $disconnect: mocks.disconnect })
}));
vi.mock('bullmq', () => ({
  Queue: class {
    opts = { prefix: 'bull' };
    client = Promise.resolve(mocks.client);
    getJob = mocks.getJob;
    close = mocks.close;
  }
}));
import { recoverOrphanedProspectingTasks } from '../../../apps/worker/src/recover-prospecting';

describe('prospecting recovery', () => {
  beforeEach(() => {
    mocks.findMany.mockResolvedValue([{ id: 'task', startedAt: new Date(0), metadata: {}, executionToken: 'original-run' }]);
  });
  afterEach(() => vi.resetAllMocks());

  it('does not remove an active job or its lock even if progress is stale', async () => {
    const remove = vi.fn();
    mocks.getJob.mockResolvedValue({ getState: async () => 'active', remove });
    await recoverOrphanedProspectingTasks();
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.client.del).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('fails an orphan only if its execution token still matches', async () => {
    mocks.getJob.mockResolvedValue(undefined);
    await recoverOrphanedProspectingTasks();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task', status: 'running', executionToken: 'original-run' }
    }));
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalled();
  });
});
