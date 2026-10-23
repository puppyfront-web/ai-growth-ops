import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
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
let auth: Awaited<ReturnType<typeof getTestAuth>>;
let taskId: string;
// 依次创建：时间递增，评分递减 —— 两种排序应给出相反顺序
const seeds = [
  { key: 'old-high', nickname: '旧高分', score: 90, at: '2026-10-23T08:00:00Z' },
  { key: 'mid-mid', nickname: '中中分', score: 70, at: '2026-10-23T09:00:00Z' },
  { key: 'new-low', nickname: '新低分', score: 50, at: '2026-10-23T10:00:00Z' }
];
const ids: Record<string, string> = {};

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
    const candidate = await db.prospectCandidate.create({
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
        relevanceScore: seed.score,
        leadLevel: 'B',
        createdAt: new Date(seed.at)
      }
    });
    ids[seed.key] = candidate.id;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('GET /api/prospecting/tasks/:id/candidates 排序', () => {
  it('默认按相关度降序（现状不回退）', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?pageSize=10`
    );
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((i: { userNickname: string }) => i.userNickname)
    ).toEqual(['旧高分', '中中分', '新低分']);
  });

  it('sort=latest 按采集时间倒序', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?sort=latest&pageSize=10`
    );
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((i: { userNickname: string }) => i.userNickname)
    ).toEqual(['新低分', '中中分', '旧高分']);
  });

  it('非法 sort 取值返回 400', async () => {
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?sort=xxx`
    );
    expect(res.status).toBe(400);
  });

  it('sort=latest 下 focusId 深链定位到正确页', async () => {
    // 时间倒序时"旧高分"排第 3；pageSize=2 → 第 2 页
    const res = await api.get(
      `/api/prospecting/tasks/${taskId}/candidates?sort=latest&pageSize=2&focusId=${ids['old-high']}`
    );
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.focusResolved).toBe(ids['old-high']);
    expect(
      res.body.items.map((i: { userNickname: string }) => i.userNickname)
    ).toEqual(['旧高分']);
  });

  it('关键词搜索大小写不敏感', async () => {
    const searchTask = await db.prospectingTask.create({
      data: {
        organizationId: auth.orgId,
        userId: auth.userId,
        platform: 'douyin',
        keywords: [],
        status: 'completed'
      }
    });
    await db.prospectCandidate.create({
      data: {
        prospectingTaskId: searchTask.id,
        organizationId: auth.orgId,
        platform: 'douyin',
        keyword: '',
        userKey: `${searchTask.id}-tom`,
        externalUserId: 'ext-tom',
        userNickname: 'Tom Smith',
        content: 'Need quote for fans',
        commentCount: 1,
        relevanceScore: 60,
        leadLevel: 'B'
      }
    });
    const res = await api.get(
      `/api/prospecting/tasks/${searchTask.id}/candidates?q=tom`
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userNickname).toBe('Tom Smith');
  });
});
