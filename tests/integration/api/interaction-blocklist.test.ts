import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createToken } from '../../../apps/api/src/auth';
import { getTestAuth, createAuthFetch } from '../../setup/test-auth';

let server: Server;
let baseUrl: string;
let api: ReturnType<typeof createAuthFetch>;
const db = createDatabaseClient();

let orgId: string;
let viewerHeaders: Record<string, string>;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  const auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
  orgId = auth.orgId;

  // viewer 角色用户（无 lead:edit 权限）用于 403 断言
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  const viewer = await db.user.create({
    data: {
      email: 'viewer-blocklist@test.local',
      passwordHash: 'x',
      name: 'Blocklist Viewer',
      role: 'member'
    }
  });
  await db.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: viewer.id,
      role: 'viewer',
      status: 'active'
    }
  });
  viewerHeaders = {
    Authorization: `Bearer ${createToken(viewer.id)}`,
    'X-Organization-Id': orgId
  };
  void admin;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('Interaction Blocklist API', () => {
  it('401: 未登录拒绝', async () => {
    const res = await fetch(`${baseUrl}/api/interactions/blocklist`);
    expect(res.status).toBe(401);
  });

  it('403: viewer 角色无 lead:edit 权限', async () => {
    const res = await fetch(`${baseUrl}/api/interactions/blocklist`, {
      method: 'POST',
      headers: { ...viewerHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'douyin',
        platformUserId: 'user-x'
      })
    });
    expect(res.status).toBe(403);
  });

  it('POST 创建、重复创建 409、GET 列表、DELETE 解除、再删 404', async () => {
    // 创建
    const created = await api.post('/api/interactions/blocklist', {
      platform: 'douyin',
      platformUserId: 'user-1',
      reason: 'manual',
      note: '测试拉黑'
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual(
      expect.objectContaining({
        organizationId: orgId,
        platform: 'douyin',
        platformUserId: 'user-1',
        reason: 'manual'
      })
    );
    const id = created.body.id as string;

    // 重复拉黑 → 409
    const dup = await api.post('/api/interactions/blocklist', {
      platform: 'douyin',
      platformUserId: 'user-1'
    });
    expect(dup.status).toBe(409);

    // 列表（分页结构）
    const list = await api.get(
      '/api/interactions/blocklist?page=1&pageSize=10&platform=douyin&platformUserId=user-1'
    );
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(id);

    // DELETE 解除
    const del = await api.del(`/api/interactions/blocklist/${id}`);
    expect(del.status).toBe(200);

    // 再删 → 404
    const delAgain = await api.del(`/api/interactions/blocklist/${id}`);
    expect(delAgain.status).toBe(404);

    // 解除后可重新拉黑（软删除复活）
    const reblock = await api.post('/api/interactions/blocklist', {
      platform: 'douyin',
      platformUserId: 'user-1',
      reason: 'complaint'
    });
    expect(reblock.status).toBe(201);

    // 清理：解除，避免影响后续用例
    await api.del(`/api/interactions/blocklist/${reblock.body.id}`);
  });

  it('DELETE 跨组织条目返回 404', async () => {
    const created = await api.post('/api/interactions/blocklist', {
      platform: 'douyin',
      platformUserId: 'cross-org-user'
    });
    expect(created.status).toBe(201);

    // 另一个组织的成员视角：构造另一个 org + member
    const otherOrg = await db.organization.create({
      data: {
        name: 'Blocklist Other Org',
        slug: 'blocklist-other-org',
        status: 'active'
      }
    });
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    await db.organizationMember.create({
      data: {
        organizationId: otherOrg.id,
        userId: admin.id,
        role: 'owner',
        status: 'active'
      }
    });
    const crossRes = await fetch(
      `${baseUrl}/api/interactions/blocklist/${created.body.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${createToken(admin.id)}`,
          'X-Organization-Id': otherOrg.id
        }
      }
    );
    expect(crossRes.status).toBe(404);

    // 清理
    await api.del(`/api/interactions/blocklist/${created.body.id}`);
  });

  it('命中黑名单的互动发送回复返回 409 BLOCKLISTED_TARGET', async () => {
    const admin = await db.user.findFirstOrThrow({
      where: { email: 'admin@ai-growth-ops.local' }
    });
    const account = await db.platformAccount.create({
      data: {
        organizationId: orgId,
        userId: admin.id,
        platform: 'douyin',
        name: 'Blocklist Reply Test Account',
        mode: 'browser_assist',
        status: 'active'
      }
    });
    const interaction = await db.interaction.create({
      data: {
        organizationId: orgId,
        userId: admin.id,
        platform: 'douyin',
        platformAccountId: account.id,
        externalInteractionId: `blk-${Date.now()}`,
        externalUserId: 'blocked-reply-user',
        type: 'comment',
        content: '求价格'
      }
    });

    // 未拉黑时可进入回复流程（此处只验证拉黑后的拦截）
    const blocked = await api.post('/api/interactions/blocklist', {
      platform: 'douyin',
      platformUserId: 'blocked-reply-user',
      reason: 'manual'
    });
    expect(blocked.status).toBe(201);

    const reply = await api.post(`/api/interactions/${interaction.id}/reply`, {
      content: '您好，请查看私信'
    });
    expect(reply.status).toBe(409);
    expect(reply.body.errorCode).toBe('BLOCKLISTED_TARGET');

    // 清理
    await api.del(`/api/interactions/blocklist/${blocked.body.id}`);
  });

  it('POST 缺少必填字段返回 400', async () => {
    const bad = await api.post('/api/interactions/blocklist', {
      platform: 'douyin'
    });
    expect(bad.status).toBe(400);
  });
});
