import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignExperimentVariant,
  createDatabaseClient,
  createExperiment,
  getExperimentResults,
  recordExperimentEvent,
  resetDatabase,
  seedDatabase,
  startExperiment,
  type DatabaseClient
} from '@ai-growth-ops/database';

type Fixture = {
  db: DatabaseClient;
  userId: string;
  organizationId: string;
};

async function fixture(): Promise<Fixture> {
  const db = createDatabaseClient();
  await resetDatabase(db);
  await seedDatabase(db);
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  const membership = await db.organizationMember.findFirstOrThrow({
    where: { userId: admin.id, status: 'active' }
  });
  return { db, userId: admin.id, organizationId: membership.organizationId };
}

async function experiment(f: Fixture) {
  return createExperiment(f.db, {
    organizationId: f.organizationId,
    userId: f.userId,
    name: '标题 A/B',
    metric: 'lead',
    variants: [
      { key: 'a', name: 'A 对照', weight: 50 },
      { key: 'b', name: 'B 实验', weight: 50 }
    ]
  });
}

describe('experiments', () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await fixture();
  });

  it('assigns a stable variant and records events', async () => {
    const exp = await experiment(f);
    await startExperiment(f.db, exp.id, f.organizationId);

    const first = await assignExperimentVariant(
      f.db,
      exp.id,
      f.organizationId,
      { entityType: 'content_item', entityId: 'content-1' }
    );
    const second = await assignExperimentVariant(
      f.db,
      exp.id,
      f.organizationId,
      { entityType: 'content_item', entityId: 'content-1' }
    );
    expect(second.id).toBe(first.id);
    expect(second.variantKey).toBe(first.variantKey);

    await recordExperimentEvent(f.db, exp.id, f.organizationId, {
      assignmentId: first.id,
      metric: 'lead',
      value: 1
    });

    const results = await getExperimentResults(
      f.db,
      exp.id,
      f.organizationId
    );
    const row = results.rows.find((item) => item.key === first.variantKey)!;
    expect(row.assignments).toBe(1);
    expect(row.conversions).toBe(1);
  });

  it('rejects assignment before the experiment starts', async () => {
    const exp = await experiment(f);
    await expect(
      assignExperimentVariant(f.db, exp.id, f.organizationId, {
        entityType: 'content_item',
        entityId: 'content-1'
      })
    ).rejects.toThrow(/未运行/);
  });

  it('rejects events from another experiment assignment', async () => {
    const exp = await experiment(f);
    await startExperiment(f.db, exp.id, f.organizationId);
    await expect(
      recordExperimentEvent(f.db, exp.id, f.organizationId, {
        assignmentId: randomUUID(),
        metric: 'lead'
      })
    ).rejects.toThrow(/不存在/);
  });

  it('rejects invalid variants', async () => {
    await expect(
      createExperiment(f.db, {
        organizationId: f.organizationId,
        userId: f.userId,
        name: '无效实验',
        variants: [{ key: 'a', name: 'A', weight: 0 }]
      })
    ).rejects.toThrow(/两个变体/);
  });
});
