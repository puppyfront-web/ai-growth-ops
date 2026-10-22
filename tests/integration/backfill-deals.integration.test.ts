import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  backfillClosedLoop,
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';

describe('backfillClosedLoop', () => {
  let db: DatabaseClient;
  let userId: string;
  let organizationId: string;

  beforeEach(async () => {
    db = createDatabaseClient();
    await resetDatabase(db);
    await seedDatabase(db);
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    userId = admin.id;
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { userId, status: 'active' }
    });
    organizationId = membership.organizationId;
  });

  it('creates one outcome deal per closed customer and is idempotent', async () => {
    const won = await db.customer.create({
      data: {
        organizationId,
        userId,
        displayName: '已成交客户',
        phone: '13800000001',
        company: 'A 公司',
        role: '老板',
        intent: '采购',
        channel: 'douyin',
        status: 'won'
      }
    });
    const lost = await db.customer.create({
      data: {
        organizationId,
        userId,
        displayName: '已流失客户',
        phone: '13800000002',
        company: 'B 公司',
        role: '运营',
        intent: '了解',
        channel: 'manual',
        status: 'lost'
      }
    });

    const first = await backfillClosedLoop(db);
    const second = await backfillClosedLoop(db);

    const deals = await db.deal.findMany({
      where: { customerId: { in: [won.id, lost.id] } },
      orderBy: { createdAt: 'asc' }
    });

    expect(first).toEqual({ customers: 2, dealsCreated: 2 });
    expect(second).toEqual({ customers: 2, dealsCreated: 0 });
    expect(deals).toHaveLength(2);
    expect(deals.map((deal) => deal.stage).sort()).toEqual(['lost', 'won']);
    expect(deals.every((deal) => deal.amount === null)).toBe(true);
    expect(deals.every((deal) => deal.metadata !== null)).toBe(true);
  });

  it('does not overwrite an existing deal', async () => {
    const customer = await db.customer.create({
      data: {
        organizationId,
        userId,
        displayName: '已有商机客户',
        phone: '13800000003',
        company: 'C 公司',
        role: '负责人',
        intent: '采购',
        channel: 'douyin',
        status: 'won'
      }
    });
    const existing = await db.deal.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        title: '手工商机',
        stage: 'won',
        amount: 5000
      }
    });

    const result = await backfillClosedLoop(db);
    const deals = await db.deal.findMany({
      where: { customerId: customer.id }
    });

    expect(result).toEqual({ customers: 1, dealsCreated: 0 });
    expect(deals).toHaveLength(1);
    expect(deals[0]?.id).toBe(existing.id);
    expect(deals[0]?.title).toBe('手工商机');
    expect(deals[0]?.metadata).toBeNull();
  });

  it('handles an empty database', async () => {
    const result = await backfillClosedLoop(db);
    expect(result).toEqual({ customers: 0, dealsCreated: 0 });
    expect(await db.deal.count()).toBe(0);
    expect(randomUUID()).toBeTruthy();
  });
});
