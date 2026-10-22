import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { encryptToken } from '@ai-growth-ops/providers';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

const db: DatabaseClient = createDatabaseClient();
let server: Server;
let api: ReturnType<typeof createAuthFetch>;
let auth: Awaited<ReturnType<typeof getTestAuth>>;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { address: string; port: number };
  auth = await getTestAuth(db, `http://${address.address}:${address.port}`);
  api = createAuthFetch(`http://${address.address}:${address.port}`, auth);
});

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('platform account multi-user security', () => {
  it('does not return encrypted credentials or secret metadata', async () => {
    await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '脱敏账号',
        mode: 'browser_assist',
        status: 'active',
        accessTokenEncrypted: encryptToken('access-secret'),
        refreshTokenEncrypted: encryptToken('refresh-secret'),
        cookieRef: encryptToken('sessionid=cookie-secret'),
        metadata: { clientKey: 'public-key', clientSecret: 'legacy-secret' }
      }
    });

    const response = await api.get('/api/accounts');
    const account = response.body.find(
      (item: { name: string }) => item.name === '脱敏账号'
    );
    expect(account).toMatchObject({
      hasAccessToken: true,
      hasRefreshToken: true,
      hasCookie: true,
      hasSecretConfig: true,
      metadata: { clientKey: 'public-key' }
    });
    expect(JSON.stringify(account)).not.toContain('access-secret');
    expect(JSON.stringify(account)).not.toContain('refresh-secret');
    expect(JSON.stringify(account)).not.toContain('cookie-secret');
    expect(JSON.stringify(account)).not.toContain('legacy-secret');
    expect(account).not.toHaveProperty('cookieRef');
  });

  it.each(['member', 'viewer'])(
    'rejects account mutations for %s',
    async (role) => {
      const account = await db.platformAccount.create({
        data: {
          organizationId: auth.orgId,
          userId: auth.userId,
          platform: 'douyin',
          name: `权限账号-${role}`,
          mode: 'browser_assist',
          status: 'active'
        }
      });
      const membership = await db.organizationMember.findFirstOrThrow({
        where: { organizationId: auth.orgId, userId: auth.userId }
      });
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { role }
      });
      try {
        expect(
          (
            await api.post('/api/accounts', {
              platform: 'douyin',
              name: '禁止创建'
            })
          ).status
        ).toBe(403);
        expect(
          (await api.put(`/api/accounts/${account.id}`, { name: '禁止修改' }))
            .status
        ).toBe(403);
        expect(
          (await api.post(`/api/accounts/${account.id}/validate`, {})).status
        ).toBe(403);
        expect((await api.delete(`/api/accounts/${account.id}`)).status).toBe(
          403
        );
      } finally {
        await db.organizationMember.update({
          where: { id: membership.id },
          data: { role: membership.role }
        });
      }
    }
  );

  it('rejects a capability that does not belong to the selected account', async () => {
    const [first, second] = await Promise.all([
      db.platformAccount.create({
        data: {
          organizationId: auth.orgId,
          userId: auth.userId,
          platform: 'douyin',
          name: '能力账号一'
        }
      }),
      db.platformAccount.create({
        data: {
          organizationId: auth.orgId,
          userId: auth.userId,
          platform: 'douyin',
          name: '能力账号二'
        }
      })
    ]);
    const capability = await db.platformCapability.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platformAccountId: second.id,
        platform: 'douyin',
        capabilityKey: 'comment_reply',
        mode: 'browser_assist',
        enabled: true
      }
    });

    const response = await api.put(`/api/accounts/${first.id}`, {
      capabilities: [{ id: capability.id, enabled: false }]
    });
    expect(response.status).toBe(404);
    expect(
      (
        await db.platformCapability.findUniqueOrThrow({
          where: { id: capability.id }
        })
      ).enabled
    ).toBe(true);
  });
});
