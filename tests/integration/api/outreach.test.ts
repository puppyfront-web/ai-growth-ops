import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createToken } from '../../../apps/api/src/auth';
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
      intent: '私域运营',
      channel: 'douyin',
      ...overrides
    }
  });
}

async function createSequence() {
  return api.post('/api/outreach/sequences', {
    name: '新客两步触达',
    channel: 'manual',
    steps: [
      { order: 1, delayHours: 0, template: '{{name}}，你好' },
      { order: 2, delayHours: 24, template: '{{name}}，跟进一下' }
    ]
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
  await db.outreachTouch.deleteMany();
  await db.outreachEnrollment.deleteMany();
  await db.outreachStep.deleteMany();
  await db.outreachSequence.deleteMany();
  await db.outreachSuppression.deleteMany();
  await db.customer.deleteMany({ where: { organizationId } });
  await db.notification.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('outreach API', () => {
  it('creates, lists and reads a sequence', async () => {
    const created = await createSequence();
    expect(created.status).toBe(201);
    expect(created.body.steps).toHaveLength(2);

    const list = await api.get('/api/outreach/sequences');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const detail = await api.get(
      `/api/outreach/sequences/${created.body.id}`
    );
    expect(detail.status).toBe(200);
    expect(detail.body.steps[0].order).toBe(1);
  });

  it('enrolls a customer, exposes due touches and completes one', async () => {
    const customer = await createCustomer();
    const sequence = await createSequence();

    const enrolled = await api.post('/api/outreach/enrollments', {
      sequenceId: sequence.body.id,
      customerId: customer.id
    });
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.touch.content).toContain(customer.displayName);

    const workbench = await api.get('/api/outreach/workbench');
    expect(workbench.status).toBe(200);
    expect(workbench.body.due).toBe(1);
    expect(workbench.body.activeEnrollments).toBe(1);

    const touches = await api.get('/api/outreach/touches');
    expect(touches.status).toBe(200);
    expect(touches.body.items).toHaveLength(1);

    const completed = await api.post(
      `/api/outreach/touches/${enrolled.body.touch.id}/complete`,
      { status: 'sent' }
    );
    expect(completed.status).toBe(200);
    expect(completed.body.touch.status).toBe('sent');
    expect(completed.body.nextTouch.status).toBe('planned');

    const after = await api.get('/api/outreach/workbench');
    expect(after.body.sentToday).toBe(1);
    expect(after.body.due).toBe(0);
  });

  it('blocks an enrollment when the customer is suppressed', async () => {
    const customer = await createCustomer();
    const sequence = await createSequence();
    const suppression = await api.post('/api/outreach/suppressions', {
      type: 'customer',
      value: customer.id,
      reason: '客户要求不再联系'
    });
    expect(suppression.status).toBe(201);

    const enrolled = await api.post('/api/outreach/enrollments', {
      sequenceId: sequence.body.id,
      customerId: customer.id
    });
    expect(enrolled.status).toBe(400);
    expect(String(enrolled.body.error)).toMatch(/退订|黑名单/);

    const removed = await api.del(
      `/api/outreach/suppressions/${suppression.body.id}`
    );
    expect(removed.status).toBe(200);
  });

  it('updates channel capability config and scans due touches', async () => {
    const config = await api.put('/api/outreach/channels', {
      manual: 'verified',
      email: 'unverified'
    });
    expect(config.status).toBe(200);

    const saved = await api.get('/api/outreach/channels');
    expect(saved.status).toBe(200);
    expect(saved.body.email).toBe('unverified');

    const scan = await api.post('/api/outreach/scan');
    expect(scan.status).toBe(200);
    expect(typeof scan.body.markedDue).toBe('number');
  });

  it('does not expose another organization sequence', async () => {
    const sequence = await createSequence();
    const otherOrg = await db.organization.create({
      data: { name: '其他组织', slug: `other-${randomUUID()}` }
    });
    const otherUser = await db.user.create({
      data: {
        email: `other-${randomUUID()}@example.com`,
        name: '外部用户',
        role: 'admin'
      }
    });
    await db.organizationMember.create({
      data: {
        organizationId: otherOrg.id,
        userId: otherUser.id,
        role: 'admin',
        status: 'active'
      }
    });
    const address = server.address() as { address: string; port: number };
    const otherApi = createAuthFetch(
      `http://${address.address}:${address.port}`,
      {
        token: createToken(otherUser.id),
        userId: otherUser.id,
        orgId: otherOrg.id,
        headers: {
          Authorization: `Bearer ${createToken(otherUser.id)}`,
          'X-Organization-Id': otherOrg.id
        }
      }
    );

    const detail = await otherApi.get(
      `/api/outreach/sequences/${sequence.body.id}`
    );
    expect(detail.status).toBe(400);
    expect(String(detail.body.error)).toContain('不存在');
  });

  it('rejects writes from a viewer role', async () => {
    const viewer = await db.user.create({
      data: {
        email: `viewer-${randomUUID()}@example.com`,
        name: '只读用户',
        role: 'viewer'
      }
    });
    await db.organizationMember.create({
      data: {
        organizationId,
        userId: viewer.id,
        role: 'viewer',
        status: 'active'
      }
    });
    const address = server.address() as { address: string; port: number };
    const viewerApi = createAuthFetch(
      `http://${address.address}:${address.port}`,
      {
        token: createToken(viewer.id),
        userId: viewer.id,
        orgId: organizationId,
        headers: {
          Authorization: `Bearer ${createToken(viewer.id)}`,
          'X-Organization-Id': organizationId
        }
      }
    );

    const response = await viewerApi.post('/api/outreach/sequences', {
      name: '不应该创建',
      channel: 'manual',
      steps: [{ order: 1, delayHours: 0, template: 'x' }]
    });
    expect(response.status).toBe(403);
  });
});
