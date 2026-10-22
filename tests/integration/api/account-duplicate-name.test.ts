import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch, type TestAuthContext } from '../../setup/test-auth';

let apiServer: Server;
let baseUrl: string;
const db: DatabaseClient = createDatabaseClient();

let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);

  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const addr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${addr.address}:${addr.port}`;

  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await db.$disconnect();
});

describe('添加账号的同名冲突处理', () => {
  it('与现有活跃账号同名：返回 409 与友好提示，而非 Prisma 原始错误', async () => {
    await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '同名冲突-抖音主号',
        mode: 'browser_assist',
        status: 'active'
      }
    });

    const { status, body } = await api.post('/api/accounts', {
      platform: 'douyin',
      name: '同名冲突-抖音主号',
      mode: 'browser_assist'
    });

    expect(status).toBe(409);
    expect(String(body.error)).toContain('已存在同名账号');
    expect(String(body.error)).toContain('同名冲突-抖音主号');
    expect(String(body.error)).not.toContain('prisma');
  });

  it('名称仅被软删除账号占用：重建时复用原行恢复', async () => {
    const deleted = await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'xiaohongshu',
        name: '同名冲突-已删除的小红书号',
        mode: 'browser_assist',
        status: 'active',
        deletedAt: new Date()
      }
    });

    const { status, body } = await api.post('/api/accounts', {
      platform: 'xiaohongshu',
      name: '同名冲突-已删除的小红书号',
      mode: 'browser_assist'
    });

    expect(status).toBe(201);
    expect(body.id).toBe(deleted.id);

    const revived = await db.platformAccount.findUniqueOrThrow({
      where: { id: deleted.id }
    });
    expect(revived.deletedAt).toBeNull();

    const caps = await db.platformCapability.findMany({
      where: { platformAccountId: deleted.id, deletedAt: null }
    });
    expect(caps.map((c) => c.capabilityKey)).toEqual(
      expect.arrayContaining([
        'text_image_publish',
        'video_publish',
        'comment_sync',
        'comment_reply'
      ])
    );
  });

  it('重命名撞已有活跃账号名称：返回 409 与友好提示', async () => {
    const account = await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        name: '同名冲突-待改名账号',
        mode: 'browser_assist',
        status: 'active'
      }
    });

    const { status, body } = await api.put(`/api/accounts/${account.id}`, {
      name: '同名冲突-抖音主号'
    });

    expect(status).toBe(409);
    expect(String(body.error)).toContain('已存在同名账号');
    expect(String(body.error)).toContain('同名冲突-抖音主号');

    const unchanged = await db.platformAccount.findUniqueOrThrow({
      where: { id: account.id }
    });
    expect(unchanged.name).toBe('同名冲突-待改名账号');
  });

  it('同组织不同创建人仍不能创建同平台同名账号', async () => {
    const teammate = await db.user.create({
      data: {
        email: `account-owner-${Date.now()}@example.com`,
        name: '账号创建人'
      }
    });
    await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: teammate.id,
        platform: 'xiaohongshu',
        name: '组织共享小红书号',
        mode: 'browser_assist',
        status: 'active'
      }
    });

    const response = await api.post('/api/accounts', {
      platform: 'xiaohongshu',
      name: '组织共享小红书号',
      mode: 'browser_assist'
    });

    expect(response.status).toBe(409);
  });
});
