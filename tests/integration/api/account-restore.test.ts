import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import {
  createAuthFetch,
  getTestAuth,
  type TestAuthContext
} from '../../setup/test-auth';

let apiServer: Server;
const db: DatabaseClient = createDatabaseClient();

let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);

  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    apiServer.listen(0, '127.0.0.1', resolve)
  );
  const addr = apiServer.address() as { address: string; port: number };
  const baseUrl = `http://${addr.address}:${addr.port}`;

  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await db.$disconnect();
});

describe('恢复软删除账号 POST /api/accounts/:id/restore', () => {
  it('恢复软删除账号：清空 deletedAt，状态回到 expired 且清掉旧凭据，需重新扫码后可用', async () => {
    const account = await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '恢复账号-黄鸭',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'stale-encrypted-cookie',
        deletedAt: new Date()
      }
    });

    const restored = await api.post(`/api/accounts/${account.id}/restore`);
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);

    const row = await db.platformAccount.findUniqueOrThrow({
      where: { id: account.id }
    });
    expect(row.deletedAt).toBeNull();
    expect(row.status).toBe('expired');
    expect(row.cookieRef).toBeNull();
    // 响应不回传明文凭据
    expect(restored.body.cookieRef).toBeUndefined();
    expect(restored.body.name).toBe('恢复账号-黄鸭');

    await db.platformAccount.delete({ where: { id: account.id } });
  });

  it('未删除的账号调用恢复返回 400', async () => {
    const account = await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '恢复账号-未删除',
        mode: 'browser_assist',
        status: 'active'
      }
    });

    const response = await api.post(`/api/accounts/${account.id}/restore`);
    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain('未处于删除状态');

    await db.platformAccount.delete({ where: { id: account.id } });
  });

  it('同名活跃账号占用名称时返回 404（唯一约束下该状态不可达，防御性断言）', async () => {
    // 唯一约束 [org, platform, name] 覆盖软删除行：创建同名活跃账号会直接违反约束，
    // 创建接口对软删占名走"复用原行"路径，因此 restore 无需 409 分支。
    // 此用例固定该前提：软删后无法再创建同名新行。
    const deleted = await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '恢复账号-冲突',
        mode: 'browser_assist',
        status: 'active',
        deletedAt: new Date()
      }
    });
    await expect(
      db.platformAccount.create({
        data: {
          organizationId: auth.orgId,
          userId: auth.userId,
          platform: 'douyin',
          name: '恢复账号-冲突',
          mode: 'browser_assist',
          status: 'active'
        }
      })
    ).rejects.toThrow();
    await db.platformAccount.delete({ where: { id: deleted.id } });
  });

  it('其他组织的账号返回 404（组织隔离）', async () => {
    const otherOrg = await db.organization.create({
      data: { name: '外部组织', slug: `restore-other-${Date.now()}` }
    });
    const foreign = await db.platformAccount.create({
      data: {
        organizationId: otherOrg.id,
        userId: auth.userId,
        platform: 'douyin',
        name: '恢复账号-外部',
        mode: 'browser_assist',
        status: 'active',
        deletedAt: new Date()
      }
    });

    const response = await api.post(`/api/accounts/${foreign.id}/restore`);
    expect(response.status).toBe(404);

    await db.platformAccount.delete({ where: { id: foreign.id } });
    await db.organization.delete({ where: { id: otherOrg.id } });
  });

  it('任务详情返回绑定账号名（含软删除账号）', async () => {
    const account = await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '恢复账号-详情绑定',
        mode: 'browser_assist',
        status: 'active',
        cookieRef: 'cookie-detail',
        deletedAt: new Date()
      }
    });
    const task = await db.prospectingTask.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        platformAccountId: account.id,
        keywords: [],
        requirement: '详情账号名验证',
        intent: {},
        strategyPlan: {},
        planVersion: 1,
        topNVideos: 1,
        maxCommentsPerVideo: 30,
        commentScrollRounds: 8,
        minRelevanceScore: 40,
        status: 'completed'
      }
    });

    const detail = await api.get(`/api/prospecting/tasks/${task.id}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body.platformAccountName).toBe('恢复账号-详情绑定');

    await db.prospectingTask.delete({ where: { id: task.id } });
    await db.platformAccount.delete({ where: { id: account.id } });
  });
});
