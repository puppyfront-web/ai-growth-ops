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

async function seedDeal() {
  const customer = await db.customer.create({
    data: {
      organizationId,
      userId,
      displayName: '成本客户',
      phone: `13${Math.floor(Math.random() * 1e9)
        .toString()
        .padStart(9, '0')}`,
      company: '成本公司',
      role: '负责人',
      intent: '咨询',
      channel: 'douyin'
    }
  });
  const lead = await db.lead.create({
    data: {
      organizationId,
      userId,
      customerId: customer.id,
      sourcePlatform: 'douyin',
      sourceAccountId: randomUUID(),
      externalUserId: randomUUID(),
      externalUserName: '成本线索',
      level: 'A',
      status: 'WON'
    }
  });
  const deal = await db.deal.create({
    data: {
      organizationId,
      userId,
      customerId: customer.id,
      leadId: lead.id,
      title: '成本商机',
      stage: 'won',
      amount: 1000,
      wonAt: new Date()
    }
  });
  return { customer, lead, deal };
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
  await db.marketingCost.deleteMany();
  await db.outreachTouch.deleteMany();
  await db.outreachEnrollment.deleteMany();
  await db.outreachStep.deleteMany();
  await db.outreachSequence.deleteMany();
  await db.dealActivity.deleteMany();
  await db.deal.deleteMany();
  await db.lead.deleteMany({ where: { organizationId } });
  await db.customer.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('costs and efficiency API', () => {
  it('creates, lists and deletes a cost', async () => {
    const created = await api.post('/api/costs', {
      channel: 'douyin',
      category: 'ad',
      amount: 500,
      note: '信息流投放'
    });
    expect(created.status).toBe(201);

    const list = await api.get('/api/costs?days=30');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(Number(list.body.items[0].amount)).toBe(500);

    const removed = await api.del(`/api/costs/${created.body.id}`);
    expect(removed.status).toBe(200);
    expect((await api.get('/api/costs?days=30')).body.items).toHaveLength(0);
  });

  it('computes spend, CPL, CAC and ROI', async () => {
    await seedDeal();
    await api.post('/api/costs', {
      channel: 'douyin',
      category: 'ad',
      amount: 500
    });

    const response = await api.get('/api/analytics/efficiency?days=30');
    expect(response.status).toBe(200);
    expect(response.body.totals.spend).toBe(500);
    expect(response.body.totals.revenue).toBe(1000);
    expect(response.body.totals.cpl).toBe(500);
    expect(response.body.totals.cac).toBe(500);
    expect(response.body.totals.roi).toBe(1);

    const douyin = response.body.byChannel.find(
      (row: { channel: string }) => row.channel === 'douyin'
    );
    expect(douyin).toMatchObject({
      spend: 500,
      leads: 1,
      won: 1,
      revenue: 1000
    });
  });

  it('attributes revenue with the requested model', async () => {
    await seedDeal();

    const first = await api.get(
      '/api/analytics/attribution?days=30&model=first_touch'
    );
    expect(first.status).toBe(200);
    expect(first.body.model).toBe('first_touch');
    expect(first.body.byChannel[0]).toMatchObject({
      channel: 'douyin',
      revenue: 1000
    });
    expect(first.body.unattributedRevenue).toBe(0);

    const last = await api.get(
      '/api/analytics/attribution?days=30&model=last_touch'
    );
    expect(last.body.byChannel[0].revenue).toBe(1000);
  });

  it('rejects invalid amounts', async () => {
    const response = await api.post('/api/costs', {
      channel: 'douyin',
      amount: -1
    });
    expect(response.status).toBe(400);
  });
});
