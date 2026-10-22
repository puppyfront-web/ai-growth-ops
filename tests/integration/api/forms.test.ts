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
let baseUrl: string;
let api: ReturnType<typeof createAuthFetch>;
let organizationId: string;
let userId: string;

async function publicGet(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

async function publicPost(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  baseUrl = `http://${address.address}:${address.port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
  organizationId = auth.orgId;
  userId = auth.userId;
});

beforeEach(async () => {
  await db.leadCaptureSubmission.deleteMany();
  await db.leadCaptureForm.deleteMany();
  await db.assignmentRule.deleteMany();
  await db.customer.deleteMany({ where: { organizationId } });
  await db.notification.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('lead capture forms API', () => {
  it('creates a form and serves it publicly', async () => {
    const slug = `form-${randomUUID().slice(0, 8)}`;
    const created = await api.post('/api/forms', {
      name: '官网咨询',
      slug,
      title: '获取方案',
      fields: [
        { key: 'name', label: '姓名', type: 'text', required: true },
        { key: 'phone', label: '手机号', type: 'tel', required: true }
      ]
    });
    expect(created.status).toBe(201);

    const form = await publicGet(`/api/public/forms/${slug}`);
    expect(form.status).toBe(200);
    expect(form.body.title).toBe('获取方案');
    expect(form.body.fields).toHaveLength(2);
  });

  it('accepts a public submission and reuses the customer by phone', async () => {
    const slug = `form-${randomUUID().slice(0, 8)}`;
    await api.post('/api/forms', {
      name: '官网咨询',
      slug,
      title: '获取方案',
      fields: [{ key: 'name', label: '姓名', type: 'text', required: true }]
    });

    const first = await publicPost(`/api/public/forms/${slug}/submit`, {
      name: '李女士',
      phone: '13900000001',
      company: 'Acme'
    });
    expect(first.status).toBe(201);
    expect(first.body.ok).toBe(true);

    const second = await publicPost(`/api/public/forms/${slug}/submit`, {
      name: '李女士',
      phone: '139-0000-0001'
    });
    expect(second.status).toBe(201);

    const customers = await db.customer.findMany({
      where: { organizationId }
    });
    expect(customers).toHaveLength(1);
    expect(customers[0]?.channel).toBe('website');
    expect(
      await db.leadCaptureSubmission.count({
        where: { organizationId }
      })
    ).toBe(2);
  });

  it('rejects invalid phone and disabled forms', async () => {
    const slug = `form-${randomUUID().slice(0, 8)}`;
    const form = await api.post('/api/forms', {
      name: '官网咨询',
      slug,
      title: '获取方案',
      fields: [{ key: 'name', label: '姓名', type: 'text' }]
    });

    const invalid = await publicPost(`/api/public/forms/${slug}/submit`, {
      name: '无效',
      phone: '123'
    });
    expect(invalid.status).toBe(400);

    await api.put(`/api/forms/${form.body.id}`, { enabled: false });
    const disabled = await publicPost(`/api/public/forms/${slug}/submit`, {
      name: '停用',
      phone: '13900000002'
    });
    expect(disabled.status).toBe(400);
  });

  it('assigns a form submission through an assignment rule', async () => {
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
    const rule = await api.post('/api/settings/assignment-rules', {
      name: '官网表单给 B',
      priority: 1,
      conditions: { channel: 'website' },
      assigneeId: assignee.id
    });
    expect(rule.status).toBe(201);

    const slug = `form-${randomUUID().slice(0, 8)}`;
    await api.post('/api/forms', {
      name: '官网咨询',
      slug,
      title: '获取方案',
      fields: [{ key: 'name', label: '姓名', type: 'text' }]
    });
    await publicPost(`/api/public/forms/${slug}/submit`, {
      name: '王先生',
      phone: '13900000003'
    });

    const customer = await db.customer.findFirstOrThrow({
      where: { organizationId }
    });
    expect(customer.assignedTo).toBe(assignee.id);
    expect(
      await db.notification.count({
        where: { organizationId, userId: assignee.id }
      })
    ).toBeGreaterThanOrEqual(1);
  });

  it('requires authentication for form management', async () => {
    const response = await fetch(`${baseUrl}/api/forms`);
    expect(response.status).toBe(401);
    expect(userId).toBeTruthy();
  });
});
