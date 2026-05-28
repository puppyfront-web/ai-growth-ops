import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createDatabaseClient, resetDatabase, seedDatabase } from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';

let server: Server;
let baseUrl: string;
const db = createDatabaseClient();

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}
async function post(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as any).address}:${(addr as any).port}`;
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
    expect(body.status).toBe('RUNNING');
  });

  it('POST /api/research-tasks/:id/pause sets PAUSED', async () => {
    const { status, body } = await post(`/api/research-tasks/${taskId}/pause`);
    expect(status).toBe(200);
    expect(body.status).toBe('PAUSED');
  });

  it('POST /api/research-tasks/:id/pause validates status (DRAFT cannot pause)', async () => {
    const { body: draftTask } = await post('/api/research-tasks', { type: 'test', platforms: ['douyin'] });
    const { status } = await post(`/api/research-tasks/${draftTask.id}/pause`);
    expect(status).toBe(400);
  });

  it('GET /api/research-tasks/:taskId/posts returns collected posts', async () => {
    const { body: tasks } = await get('/api/research-tasks');
    const completedTask = tasks.find((t: any) => t.status === 'INSIGHT_GENERATED');
    if (!completedTask) return;
    const { status, body } = await get(`/api/research-tasks/${completedTask.id}/posts`);
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(5);
  });

  it('GET /api/research-tasks/:taskId/comments returns collected comments', async () => {
    const { body: tasks } = await get('/api/research-tasks');
    const completedTask = tasks.find((t: any) => t.status === 'INSIGHT_GENERATED');
    if (!completedTask) return;
    const { status, body } = await get(`/api/research-tasks/${completedTask.id}/comments`);
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
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/content-opportunities/:id/create-content creates content', async () => {
    const { body: opps } = await get('/api/content-opportunities');
    if (opps.length === 0) return;
    const { status, body } = await post(`/api/content-opportunities/${opps[0].id}/create-content`);
    expect(status).toBe(201);
    expect(body.contentItemId).toBeDefined();
  });
});
