import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth } from '../../setup/test-auth';

// 39 号 spec：潜客画像标签过滤——语义评估两步判定产物，用于隔离同行/已落地
const db = createDatabaseClient();
let server: Server;
let api: ReturnType<typeof createAuthFetch>;
let auth: Awaited<ReturnType<typeof getTestAuth>>;
let taskId: string;

const seeds = [
  { key: 'demand', nickname: '工厂老板', personaTag: 'demand_seeker' },
  { key: 'peer', nickname: '同行服务商', personaTag: 'peer_vendor' },
  { key: 'adopted', nickname: '已落地企业', personaTag: 'already_adopted' },
  { key: 'legacy', nickname: '历史无画像', personaTag: null }
];

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  const baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  const task = await db.prospectingTask.create({
    data: {
      organizationId: auth.orgId,
      userId: auth.userId,
      platform: 'douyin',
      keywords: [],
      status: 'completed'
    }
  });
  taskId = task.id;

  for (const seed of seeds) {
    await db.prospectCandidate.create({
      data: {
        prospectingTaskId: taskId,
        organizationId: auth.orgId,
        platform: 'douyin',
        keyword: '',
        userKey: `${taskId}-${seed.key}`,
        externalUserId: `ext-${seed.key}`,
        userNickname: seed.nickname,
        content: `${seed.nickname}的评论`,
        commentCount: 1,
        relevanceScore: 60,
        leadLevel: 'B',
        personaTag: seed.personaTag
      }
    });
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('GET /api/prospecting/tasks/:id/candidates 画像过滤', () => {
  it('personaTag=peer_vendor 只返回同行候选', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?personaTag=peer_vendor&pageSize=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(
      res.body.items.map((i: { userNickname: string }) => i.userNickname)
    ).toEqual(['同行服务商']);
  });

  it('personaTag=demand_seeker 只返回需求方', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?personaTag=demand_seeker&pageSize=10`
    );
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((i: { userNickname: string }) => i.userNickname)
    ).toEqual(['工厂老板']);
  });

  it('不传 personaTag 返回全部（含历史无画像）', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?pageSize=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
  });

  it('响应项携带 personaTag 字段', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?personaTag=peer_vendor`
    );
    expect(res.body.items[0].personaTag).toBe('peer_vendor');
  });

  it('非法 personaTag 返回 400', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?personaTag=super_buyer`
    );
    expect(res.status).toBe(400);
  });
});
