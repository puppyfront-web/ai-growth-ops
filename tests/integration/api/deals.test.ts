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

async function createLead(customerId: string) {
  return db.lead.create({
    data: {
      organizationId,
      userId,
      customerId,
      sourcePlatform: 'douyin',
      sourceAccountId: randomUUID(),
      externalUserId: randomUUID(),
      externalUserName: '测试线索',
      level: 'A',
      status: 'CONTACTED'
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
  await db.lead.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('deals API', () => {
  it('creates a deal and returns it in the list', async () => {
    const customer = await createCustomer();
    const response = await api.post('/api/deals', {
      customerId: customer.id,
      title: '年度私域工具采购',
      stage: 'qualified',
      amount: 12000.5,
      expectedCloseDate: '2026-11-01T00:00:00.000Z',
      nextAction: '发送报价单'
    });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('年度私域工具采购');
    expect(response.body.stage).toBe('qualified');
    expect(Number(response.body.amount)).toBe(12000.5);

    const list = await api.get('/api/deals?stage=qualified');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].customer.id).toBe(customer.id);
  });

  it('rejects a customer from another organization', async () => {
    const otherOrg = await db.organization.create({
      data: { name: '其他组织', slug: `other-${randomUUID()}` }
    });
    const foreign = await db.customer.create({
      data: {
        organizationId: otherOrg.id,
        userId,
        displayName: '外部客户',
        phone: `13${Math.floor(Math.random() * 1e9)
          .toString()
          .padStart(9, '0')}`,
        company: '外部',
        role: '负责人',
        intent: '采购',
        channel: 'manual'
      }
    });

    const response = await api.post('/api/deals', {
      customerId: foreign.id,
      title: '不应该创建'
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('客户不存在');
  });

  it('enforces the stage state machine', async () => {
    const customer = await createCustomer();
    const created = await api.post('/api/deals', {
      customerId: customer.id,
      title: '阶段测试',
      stage: 'new'
    });
    const dealId = created.body.id as string;

    const illegal = await api.put(`/api/deals/${dealId}`, {
      stage: 'won'
    });
    expect(illegal.status).toBe(400);
    expect(illegal.body.error).toContain('不能');

    const legal = await api.put(`/api/deals/${dealId}`, {
      stage: 'contacted'
    });
    expect(legal.status).toBe(200);
    expect(legal.body.stage).toBe('contacted');
  });

  it('requires a lost reason and syncs the customer', async () => {
    const customer = await createCustomer();
    const created = await api.post('/api/deals', {
      customerId: customer.id,
      title: '流失测试',
      stage: 'qualified'
    });
    const dealId = created.body.id as string;

    const withoutReason = await api.put(`/api/deals/${dealId}`, {
      stage: 'lost'
    });
    expect(withoutReason.status).toBe(400);

    const withReason = await api.put(`/api/deals/${dealId}`, {
      stage: 'lost',
      lostReason: '预算不足'
    });
    expect(withReason.status).toBe(200);
    expect(withReason.body.stage).toBe('lost');
    expect(withReason.body.lostReason).toBe('预算不足');

    const refreshed = await db.customer.findUniqueOrThrow({
      where: { id: customer.id }
    });
    expect(refreshed.status).toBe('lost');
  });

  it('syncs customer, lead and pipeline when a deal is won', async () => {
    const customer = await createCustomer();
    const lead = await createLead(customer.id);
    const created = await api.post('/api/deals', {
      customerId: customer.id,
      leadId: lead.id,
      title: '赢单测试',
      stage: 'negotiation',
      amount: 36000
    });
    const dealId = created.body.id as string;

    const won = await api.put(`/api/deals/${dealId}`, { stage: 'won' });
    expect(won.status).toBe(200);
    expect(won.body.stage).toBe('won');
    expect(won.body.wonAt).not.toBeNull();

    const [refreshedCustomer, refreshedLead, pipeline] = await Promise.all([
      db.customer.findUniqueOrThrow({ where: { id: customer.id } }),
      db.lead.findUniqueOrThrow({ where: { id: lead.id } }),
      api.get('/api/deals/pipeline')
    ]);

    expect(refreshedCustomer.status).toBe('won');
    expect(refreshedLead.status).toBe('WON');
    expect(pipeline.status).toBe(200);
    expect(pipeline.body.totals.wonCount).toBe(1);
    expect(Number(pipeline.body.totals.wonAmount)).toBe(36000);
  });

  it('lists overdue deals only when open and past due', async () => {
    const customer = await createCustomer();
    const overdue = await api.post('/api/deals', {
      customerId: customer.id,
      title: '逾期商机',
      stage: 'qualification' as never
    });
    expect(overdue.status).toBe(400);

    const created = await api.post('/api/deals', {
      customerId: customer.id,
      title: '逾期商机',
      stage: 'qualified',
      nextActionAt: '2020-01-01T00:00:00.000Z'
    });
    expect(created.status).toBe(201);

    const won = await api.post('/api/deals', {
      customerId: customer.id,
      title: '已赢单商机',
      stage: 'won',
      nextActionAt: '2020-01-01T00:00:00.000Z'
    });
    expect(won.status).toBe(201);

    const response = await api.get('/api/deals/overdue');
    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      created.body.id
    ]);
  });

  it('soft deletes a deal', async () => {
    const customer = await createCustomer();
    const created = await api.post('/api/deals', {
      customerId: customer.id,
      title: '删除测试'
    });
    const dealId = created.body.id as string;

    const removed = await api.del(`/api/deals/${dealId}`);
    expect(removed.status).toBe(200);

    const detail = await api.get(`/api/deals/${dealId}`);
    expect(detail.status).toBe(404);

    const list = await api.get('/api/deals');
    expect(list.body.total).toBe(0);
  });
});
