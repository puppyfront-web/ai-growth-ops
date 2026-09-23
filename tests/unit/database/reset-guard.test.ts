import { expect, it, vi } from 'vitest';
import { resetDatabase, type DatabaseClient } from '@ai-growth-ops/database';

it('checks the actual connected database before deleting any rows', async () => {
  const query = vi.fn().mockResolvedValue([{ name: 'ai_growth_ops' }]);
  const transaction = vi.fn();
  const db = { $queryRaw: query, $transaction: transaction } as unknown as DatabaseClient;
  await expect(resetDatabase(db)).rejects.toThrow('ai_growth_ops_e2e');
  expect(transaction).not.toHaveBeenCalled();
});
