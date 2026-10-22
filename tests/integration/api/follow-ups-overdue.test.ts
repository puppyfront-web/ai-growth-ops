import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

const db = createDatabaseClient();
let server: Server;
let api: ReturnType<typeof createAuthFetch>;
let organizationId: string;
let userId: string;

async function createCustomer(overrides: Record<string, unknown> = {}) {
  return db.customer.create({
    data: {
      organizationId,
      userId,
      displayName: `客户-${randomUUID().slice(0, 8)}`,
      phone: `13${Math.floor(Math.random() * 1e9)
        .toString()
        .padStart(9, '0')}`,
      company: '测试公司',
      role: '负责人',
      intent: '咨询报价',
      channel: 'douyin',
      ...overrides
    }
  });
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  const baseUrl = `http://${address.address}:${address.port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
  organizationId = auth.orgId;
  userId = auth.userId;
});

beforeEach(async () => {
  await db.dealActivity.deleteMany();
  await db.deal.deleteMany();
  await db.leadActivity.deleteMany();
  await db.lead.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });
  await db.notification.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('GET /api/follow-ups/overdue', () => {
  it('returns overdue leads, customers and deals in time order', async () => {
    const customer = await createCustomer({
      nextAction: '电话回访',
      nextActionAt: new Date('2026-01-02T00:00:00.000Z')
    });
    const lead = await db.lead.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        sourcePlatform: 'douyin',
        sourceAccountId: randomUUID(),
        externalUserId: randomUUID(),
        externalUserName: '逾期线索',
        level: 'A',
        status: 'CONTACTED',
        nextAction: '首次联系',
        nextActionAt: new Date('2026-01-01T00:00:00.000Z')
      }
    });
    const deal = await db.deal.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        leadId: lead.id,
        title: '逾期商机',
        stage: 'qualified',
        amount: 8000,
        nextAction: '发送方案',
        nextActionAt: new Date('2026-01-03T00:00:00.000Z')
      }
    });

    const response = await api.get('/api/follow-ups/overdue');

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
    expect(
      response.body.items.map((item: { type: string }) => item.type)
    ).toEqual(['lead', 'customer', 'deal']);
    expect(response.body.items[0].id).toBe(lead.id);
    expect(response.body.items[2].id).toBe(deal.id);
    expect(response.body.items[2].amount).toBe('8000.00');
  });

  it('excludes closed records and other organizations', async () => {
    const customer = await createCustomer({
      status: 'won',
      nextActionAt: new Date('2026-01-01T00:00:00.000Z')
    });
    await db.lead.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        sourcePlatform: 'douyin',
        sourceAccountId: randomUUID(),
        externalUserId: randomUUID(),
        externalUserName: '已赢单线索',
        level: 'A',
        status: 'WON',
        nextActionAt: new Date('2026-01-01T00:00:00.000Z')
      }
    });
    await db.deal.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        title: '已赢单商机',
        stage: 'won',
        nextActionAt: new Date('2026-01-01T00:00:00.000Z')
      }
    });

    const response = await api.get('/api/follow-ups/overdue');
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
  });
});

describe('lead assignment notification', () => {
  it('notifies the assignee but not the operator', async () => {
    const assignee = await db.user.create({
      data: {
        email: `assignee-${randomUUID()}@example.com`,
        name: '销售 B',
        role: 'member'
      }
    });
    await db.organizationMember.create({
      data: {
        organizationId,
        userId: assignee.id,
        role: 'member',
        status: 'active'
      }
    });
    const customer = await createCustomer();
    const lead = await db.lead.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        sourcePlatform: 'douyin',
        sourceAccountId: randomUUID(),
        externalUserId: randomUUID(),
        externalUserName: '待分配线索',
        level: 'A',
        status: 'NEW',
        nextActionAt: null
      }
    });

    const assigned = await api.patch(`/api/leads/${lead.id}/assign`, {
      assignedTo: assignee.id
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.nextActionAt).not.toBeNull();

    const notifications = await db.notification.findMany({
      where: { userId: assignee.id, organizationId }
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe('线索分配');
    expect(notifications[0]?.actionUrl).toBe(`/leads/${lead.id}`);

    const selfAssigned = await api.patch(`/api/leads/${lead.id}/assign`, {
      assignedTo: userId
    });
    expect(selfAssigned.status).toBe(200);
    const afterSelfAssign = await db.notification.findMany({
      where: { userId, organizationId, title: '线索分配' }
    });
    expect(afterSelfAssign).toHaveLength(0);
  });

  it('does not notify a user outside the organization', async () => {
    const outsider = await db.user.create({
      data: {
        email: `outsider-${randomUUID()}@example.com`,
        name: '外部用户',
        role: 'member'
      }
    });
    const customer = await createCustomer();
    const lead = await db.lead.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        sourcePlatform: 'douyin',
        sourceAccountId: randomUUID(),
        externalUserId: randomUUID(),
        externalUserName: '线索',
        level: 'B',
        status: 'NEW'
      }
    });

    const response = await api.patch(`/api/leads/${lead.id}/assign`, {
      assignedTo: outsider.id
    });
    expect(response.status).toBe(200);

    const notifications = await db.notification.findMany({
      where: { userId: outsider.id }
    });
    expect(notifications).toHaveLength(0);
  });
});
