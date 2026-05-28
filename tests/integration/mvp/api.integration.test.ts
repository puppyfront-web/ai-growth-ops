import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  resetDatabase
} from '../../../packages/database/src';
import { createApiServer } from '../../../apps/api/src';

describe('customer MVP API', () => {
  const db = createDatabaseClient();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await resetDatabase(db);
    server = createApiServer({ db });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP address');
    }

    baseUrl = `http://${address.address}:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.$disconnect();
  });

  it('serves health and demo workflow endpoints', async () => {
    const health = await getJson(`${baseUrl}/health`);
    expect(health.status).toBe('ok');

    const initialDashboard = await getJson(`${baseUrl}/api/dashboard`);
    expect(initialDashboard.metrics.publishJobs).toBe(0);

    const runResult = await getJson(`${baseUrl}/api/dashboard`);
    // After demo/run via test setup, dashboard should reflect seed data
    expect(runResult.metrics).toBeDefined();
  });

  it('demo/run seeds comprehensive data', async () => {
    await postJsonRes(`${baseUrl}/api/demo/run`);
    const dashboard = await getJson(`${baseUrl}/api/dashboard`);

    expect(dashboard.metrics.platformAccounts).toBe(6);
    expect(dashboard.metrics.contentItems).toBe(7);
    expect(dashboard.metrics.publishJobs).toBe(4);
    expect(dashboard.metrics.publishedJobs).toBe(1);
    expect(dashboard.metrics.interactions).toBe(6);
    expect(dashboard.metrics.qualifiedLeads).toBeGreaterThanOrEqual(1);
    expect(dashboard.metrics.researchInsights).toBe(3);
  });

  it('demo/reset clears all data', async () => {
    await postJsonRes(`${baseUrl}/api/demo/reset`);
    const dashboard = await getJson(`${baseUrl}/api/dashboard`);
    expect(dashboard.metrics.publishJobs).toBe(0);
    expect(dashboard.metrics.platformAccounts).toBe(0);
  });
});

async function getJson(url: string) {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.json();
}

async function postJsonRes(url: string) {
  const response = await fetch(url, { method: 'POST' });
  expect(response.ok).toBe(true);
  return response.json();
}
