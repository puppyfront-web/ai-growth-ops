import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

async function seedContentFunnel() {
  const project = await db.contentProject.create({
    data: {
      organizationId,
      userId,
      title: '获客内容项目'
    }
  });
  const item = await db.contentItem.create({
    data: {
      organizationId,
      userId,
      projectId: project.id,
      type: 'text_image',
      title: '获客指南',
      status: 'ready'
    }
  });
  const variant = await db.contentVariant.create({
    data: {
      organizationId,
      userId,
      contentItemId: item.id,
      platform: 'douyin',
      contentType: 'text_image',
      title: '获客指南'
    }
  });
  const account = await db.platformAccount.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      name: `账号-${randomUUID().slice(0, 6)}`,
      mode: 'browser_assist',
      status: 'active'
    }
  });
  const job = await db.publishJob.create({
    data: {
      organizationId,
      userId,
      contentVariantId: variant.id,
      platformAccountId: account.id,
      platform: 'douyin',
      contentType: 'text_image',
      status: 'PUBLISHED',
      finishedAt: new Date()
    }
  });

  const customer = await db.customer.create({
    data: {
      organizationId,
      userId,
      displayName: '内容客户',
      phone: '13800000123',
      company: '内容公司',
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
      sourceAccountId: account.id,
      sourcePublishJobId: job.id,
      externalUserId: `external-${randomUUID()}`,
      externalUserName: '内容线索',
      level: 'A',
      status: 'CONTACTED'
    }
  });
  await db.interaction.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      platformAccountId: account.id,
      publishJobId: job.id,
      externalInteractionId: `comment-${randomUUID()}`,
      externalUserId: lead.externalUserId,
      externalUserName: '内容线索',
      type: 'comment',
      content: '怎么收费'
    }
  });
  await db.interaction.create({
    data: {
      organizationId,
      userId,
      platform: 'douyin',
      platformAccountId: account.id,
      publishJobId: job.id,
      externalInteractionId: `comment-${randomUUID()}`,
      externalUserId: `other-${randomUUID()}`,
      externalUserName: '另一个用户',
      type: 'comment',
      content: '想了解一下'
    }
  });
  await db.lead.create({
    data: {
      organizationId,
      userId,
      sourcePlatform: 'douyin',
      sourceAccountId: account.id,
      sourcePublishJobId: job.id,
      externalUserId: `external-${randomUUID()}`,
      externalUserName: '第二条线索',
      level: 'B',
      status: 'NEW'
    }
  });
  const deal = await db.deal.create({
    data: {
      organizationId,
      userId,
      customerId: customer.id,
      leadId: lead.id,
      title: '内容成交',
      stage: 'won',
      amount: 12000,
      wonAt: new Date(),
      closedAt: new Date()
    }
  });

  return { item, job, customer, lead, deal };
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

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('GET /api/analytics/funnel', () => {
  it('counts content, interactions, leads, customers, deals and revenue', async () => {
    const fixture = await seedContentFunnel();

    const response = await api.get('/api/analytics/funnel?days=30');

    expect(response.status).toBe(200);
    const counts = Object.fromEntries(
      response.body.stages.map((stage: { key: string; count: number }) => [
        stage.key,
        stage.count
      ])
    );
    expect(counts.published).toBeGreaterThanOrEqual(1);
    expect(counts.interactions).toBeGreaterThanOrEqual(2);
    expect(counts.leads).toBeGreaterThanOrEqual(2);
    expect(counts.customers).toBeGreaterThanOrEqual(1);
    expect(counts.deals).toBeGreaterThanOrEqual(1);
    expect(counts.won).toBeGreaterThanOrEqual(1);
    expect(Number(response.body.revenue.wonRevenue)).toBeGreaterThanOrEqual(
      12000
    );

    const content = response.body.byContent.find(
      (row: { contentItemId: string }) => row.contentItemId === fixture.item.id
    );
    expect(content).toBeTruthy();
    expect(content.leads).toBeGreaterThanOrEqual(2);
    expect(Number(content.revenue)).toBeGreaterThanOrEqual(12000);
  });

  it('returns content ROI with leads and won revenue', async () => {
    const response = await api.get('/api/analytics/content-roi?days=30');
    expect(response.status).toBe(200);
    const row = response.body[0];
    expect(row).toBeTruthy();
    expect(row.leadCount).toBeGreaterThanOrEqual(2);
    expect(row.wonCount).toBeGreaterThanOrEqual(1);
    expect(Number(row.wonRevenue)).toBeGreaterThanOrEqual(12000);
    expect(row.engagementScore).toBeGreaterThan(0);
  });

  it('does not mix data from another organization', async () => {
    const otherOrg = await db.organization.create({
      data: { name: '隔离组织', slug: `isolated-${randomUUID()}` }
    });
    const otherCustomer = await db.customer.create({
      data: {
        organizationId: otherOrg.id,
        userId,
        displayName: '隔离客户',
        phone: '13800000999',
        company: '隔离公司',
        role: '负责人',
        intent: '咨询',
        channel: 'manual'
      }
    });
    await db.deal.create({
      data: {
        organizationId: otherOrg.id,
        userId,
        customerId: otherCustomer.id,
        title: '隔离成交',
        stage: 'won',
        amount: 999999,
        wonAt: new Date()
      }
    });

    const response = await api.get('/api/analytics/funnel?days=30');
    expect(response.status).toBe(200);
    expect(Number(response.body.revenue.wonRevenue)).toBeLessThan(999999);
  });
});
