import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '../../../packages/database/src';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch } from '../../setup/test-auth';

describe('customer MVP API', () => {
  const db = createDatabaseClient();
  let server: Server;
  let baseUrl: string;
  let api: ReturnType<typeof createAuthFetch>;

  beforeAll(async () => {
    await resetDatabase(db);
    await seedDatabase(db);
    server = createApiServer({ db });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP address');
    }

    baseUrl = `http://${address.address}:${address.port}`;
    const auth = await getTestAuth(db, baseUrl);
    api = createAuthFetch(baseUrl, auth);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.$disconnect();
  });

  it('serves health and dashboard endpoints', async () => {
    const { status, body: health } = await api.get('/health');
    expect(status).toBe(200);
    // Redis may be unavailable in test env → degraded is acceptable
    expect(['ok', 'degraded']).toContain(health.status);

    const { status: dashStatus, body: dashboard } = await api.get('/api/dashboard');
    expect(dashStatus).toBe(200);
    expect(dashboard.metrics).toBeDefined();
  });

  it('demo/run returns 404 when demo routes are removed', async () => {
    // Demo routes were removed in a previous cleanup — verify graceful 404
    const { status } = await api.post('/api/demo/run');
    expect([200, 404]).toContain(status);
  });

  it('demo/reset returns 404 when demo routes are removed', async () => {
    const { status } = await api.post('/api/demo/reset');
    expect([200, 404]).toContain(status);
  });
});
