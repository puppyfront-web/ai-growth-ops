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

describe('experiments API', () => {
  it('creates, starts, assigns and reports results', async () => {
    const created = await api.post('/api/experiments', {
      name: '标题 A/B',
      metric: 'lead',
      variants: [
        { key: 'a', name: 'A', weight: 50 },
        { key: 'b', name: 'B', weight: 50 }
      ]
    });
    expect(created.status).toBe(201);

    const started = await api.post(
      `/api/experiments/${created.body.id}/start`,
      {}
    );
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('running');

    const assignment = await api.post(
      `/api/experiments/${created.body.id}/assign`,
      { entityType: 'content_item', entityId: 'content-1' }
    );
    expect(assignment.status).toBe(200);

    const event = await api.post(
      `/api/experiments/${created.body.id}/events`,
      { assignmentId: assignment.body.id, metric: 'lead', value: 1 }
    );
    expect(event.status).toBe(201);

    const results = await api.get(
      `/api/experiments/${created.body.id}/results`
    );
    expect(results.status).toBe(200);
    expect(
      results.body.rows.reduce(
        (sum: number, row: { assignments: number }) => sum + row.assignments,
        0
      )
    ).toBe(1);
  });
});

describe('warehouse export', () => {
  it('exports the core entities in one bundle', async () => {
    const customer = await db.customer.create({
      data: {
        organizationId,
        userId,
        displayName: '导出客户',
        phone: `13${Math.floor(Math.random() * 1e9)
          .toString()
          .padStart(9, '0')}`,
        company: '导出公司',
        role: '负责人',
        intent: '咨询',
        channel: 'douyin'
      }
    });
    await db.deal.create({
      data: {
        organizationId,
        userId,
        customerId: customer.id,
        title: '导出商机',
        stage: 'qualified',
        amount: 1000
      }
    });
    await api.post('/api/costs', {
      channel: 'douyin',
      amount: 200
    });

    const response = await api.get('/api/export/warehouse.json?days=90');
    expect(response.status).toBe(200);
    expect(response.body.counts.customers).toBeGreaterThanOrEqual(1);
    expect(response.body.counts.deals).toBeGreaterThanOrEqual(1);
    expect(response.body.counts.costs).toBeGreaterThanOrEqual(1);
    expect(response.body.organizationId).toBe(organizationId);
    expect(response.body.exportedAt).toBeTruthy();
    expect(randomUUID()).toBeTruthy();
  });
});
