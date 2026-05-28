import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createDatabaseClient, resetDatabase, seedDatabase } from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';

let server: Server;
let baseUrl: string;
let authToken: string;
let seededOpportunityId: string;
let seededCompletedTaskId: string;
const db = createDatabaseClient();

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined
  });
  return { status: res.status, body: await res.json() };
}
async function post(path: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
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
      password: 'changeme123'
    })
  });
  const loginBody = await loginRes.json();
  authToken = loginBody.token;

  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  await db.contentProject.create({
    data: {
      userId: admin.id,
      title: 'Research Validation Project',
      description: 'Project used by research API integration tests'
    }
  });
  const completedTask = await db.researchTask.create({
    data: {
      userId: admin.id,
      type: 'keyword_research',
      platforms: ['xiaohongshu'],
      keywords: ['AI获客'],
      status: 'INSIGHT_GENERATED'
    }
  });
  seededCompletedTaskId = completedTask.id;

  await db.collectedPost.createMany({
    data: Array.from({ length: 5 }, (_, index) => ({
      researchTaskId: completedTask.id,
      platform: 'xiaohongshu',
      externalPostId: `post-${index + 1}`,
      title: `爆款选题 ${index + 1}`,
      content: `围绕 AI 获客的内容样例 ${index + 1}`,
      likeCount: 100 + index,
      commentCount: 20 + index,
      shareCount: 10 + index
    }))
  });
  await db.collectedComment.createMany({
    data: Array.from({ length: 5 }, (_, index) => ({
      researchTaskId: completedTask.id,
      platform: 'xiaohongshu',
      externalCommentId: `comment-${index + 1}`,
      externalPostId: 'post-1',
      externalUserId: `user-${index + 1}`,
      externalUserName: `评论用户${index + 1}`,
      content: `这是第 ${index + 1} 条评论`,
      likeCount: index
    }))
  });
  await db.researchInsight.createMany({
    data: [
      {
        researchTaskId: completedTask.id,
        type: 'trend',
        title: '高频问题集中在线索转化',
        summary: '用户更关注从内容到留资的转化效率'
      },
      {
        researchTaskId: completedTask.id,
        type: 'content_angle',
        title: '实操案例比概念解释更受欢迎',
        summary: '案例型内容互动率更高'
      },
      {
        researchTaskId: completedTask.id,
        type: 'competitor',
        title: '竞品偏爱清单型表达',
        summary: '清单结构更容易被收藏'
      }
    ]
  });
  const seededOpportunity = await db.contentOpportunity.create({
    data: {
      researchTaskId: completedTask.id,
      title: 'AI 获客 7 天启动清单',
      description: '从调研洞察提炼出的内容机会',
      platforms: ['xiaohongshu', 'douyin'],
      priority: 'high'
    }
  });
  seededOpportunityId = seededOpportunity.id;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
});

describe('Research API', () => {
  let taskId: string;

  it('POST /api/research-tasks creates task', async () => {
    const { status, body } = await post('/api/research-tasks', {
      type: 'keyword_research',
      platforms: ['xiaohongshu'],
      keywords: ['AI获客']
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('DRAFT');
    taskId = body.id;
  });

  it('GET /api/research-tasks returns list', async () => {
    const { status, body } = await get('/api/research-tasks');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/research-tasks/:id returns detail', async () => {
    const { status, body } = await get(`/api/research-tasks/${taskId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(taskId);
  });

  it('POST /api/research-tasks/:id/run sets RUNNING', async () => {
    const { status, body } = await post(`/api/research-tasks/${taskId}/run`);
    expect(status).toBe(200);
    expect(body.task.status).toBe('INSIGHT_GENERATED');
    expect(body.posts.length).toBeGreaterThan(0);
    expect(body.comments.length).toBeGreaterThan(0);
    expect(body.insights.length).toBeGreaterThan(0);
    expect(body.opportunities.length).toBeGreaterThan(0);
  });

  it('POST /api/research-tasks/:id/pause sets PAUSED', async () => {
    const { status, body } = await post(`/api/research-tasks/${taskId}/pause`);
    expect(status).toBe(400);
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('POST /api/research-tasks/:id/pause validates status (DRAFT cannot pause)', async () => {
    const { body: draftTask } = await post('/api/research-tasks', { type: 'test', platforms: ['douyin'] });
    const { status } = await post(`/api/research-tasks/${draftTask.id}/pause`);
    expect(status).toBe(400);
  });

  it('POST /api/research-tasks/:id/run rejects already completed task', async () => {
    const { status, body } = await post(`/api/research-tasks/${taskId}/run`);
    expect(status).toBe(400);
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('GET /api/research-tasks/:taskId/posts returns collected posts', async () => {
    const { status, body } = await get(`/api/research-tasks/${seededCompletedTaskId}/posts`);
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(5);
  });

  it('GET /api/research-tasks/:taskId/comments returns collected comments', async () => {
    const { status, body } = await get(`/api/research-tasks/${seededCompletedTaskId}/comments`);
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(5);
  });

  it('GET /api/research-insights returns insights', async () => {
    const { status, body } = await get('/api/research-insights');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /api/content-opportunities returns opportunities', async () => {
    const { status, body } = await get('/api/content-opportunities');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/content-opportunities/:id/create-content creates content', async () => {
    const { status, body } = await post(`/api/content-opportunities/${seededOpportunityId}/create-content`);
    expect(status).toBe(201);
    expect(body.contentItemId).toBeDefined();
  });
});
