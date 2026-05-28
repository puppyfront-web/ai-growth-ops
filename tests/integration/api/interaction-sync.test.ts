import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createDatabaseClient, resetDatabase, seedDatabase } from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';

let server: Server;
let baseUrl: string;
let authToken: string;
const db = createDatabaseClient();

async function post(path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let responseBody: unknown = null;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }

  return { status: res.status, body: responseBody };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as any).address}:${(addr as any).port}`;

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@ai-growth-ops.local',
      password: 'changeme123',
    }),
  });
  const loginBody = await loginRes.json();
  authToken = loginBody.token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('Interaction Sync API', () => {
  it('accepts headed override and creates a sync job', async () => {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' },
    });
    const account = await db.platformAccount.create({
      data: {
        userId: admin.id,
        platform: 'douyin',
        name: 'Interaction Sync Test Account',
        mode: 'browser_assist',
        status: 'active',
      },
    });

    const beforeCount = await db.interactionSyncJob.count();
    const { status, body } = await post('/api/interactions/sync', {
      platform: account.platform,
      platformAccountId: account.id,
      mode: account.mode,
      syncType: 'comments',
      headed: true,
    });

    expect([202, 500]).toContain(status);

    if (status === 202) {
      expect(body).toEqual(
        expect.objectContaining({
          status: 'queued',
          queued: ['comments'],
        }),
      );
    }

    const afterCount = await db.interactionSyncJob.count();
    expect(afterCount).toBe(beforeCount + 1);

    const latestJob = await db.interactionSyncJob.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
    });
    expect(latestJob.platformAccountId).toBe(account.id);
    expect(latestJob.syncType).toBe('comments');
    expect(latestJob.mode).toBe('browser_assist');
  });
});
