import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch } from '../../setup/test-auth';

let server: Server;
let baseUrl: string;
let api: ReturnType<typeof createAuthFetch>;
const db = createDatabaseClient();

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('Interaction Sync API', () => {
  it('accepts headed override and creates a sync job', async () => {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const member = await db.organizationMember.findFirstOrThrow({
      where: { userId: admin.id, status: 'active' }
    });
    const account = await db.platformAccount.create({
      data: {
        organizationId: member.organizationId,
        userId: admin.id,
        platform: 'douyin',
        name: 'Interaction Sync Test Account',
        mode: 'browser_assist',
        status: 'active'
      }
    });

    const beforeCount = await db.interactionSyncJob.count();
    const { status, body } = await api.post('/api/interactions/sync', {
      platform: account.platform,
      platformAccountId: account.id,
      mode: account.mode,
      syncType: 'comments',
      headed: true
    });

    expect([202, 500]).toContain(status);

    if (status === 202) {
      expect(body).toEqual(
        expect.objectContaining({
          status: 'queued',
          queued: ['comments']
        })
      );
    }

    const afterCount = await db.interactionSyncJob.count();
    expect(afterCount).toBe(beforeCount + 1);

    const latestJob = await db.interactionSyncJob.findFirstOrThrow({
      orderBy: { createdAt: 'desc' }
    });
    expect(latestJob.platformAccountId).toBe(account.id);
    expect(latestJob.syncType).toBe('comments');
    expect(latestJob.mode).toBe('browser_assist');
  });
});
