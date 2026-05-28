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
async function put(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function del(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json().catch(() => null) };
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

describe('Content API', () => {
  let contentId: string;

  it('GET /api/content-items returns seed data', async () => {
    const { status, body } = await get('/api/content-items');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(7);
  });

  it('POST /api/content-items creates item', async () => {
    const { status, body } = await post('/api/content-items', {
      type: 'text_image', title: 'Test Content', body: 'Test body'
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.title).toBe('Test Content');
    expect(body.status).toBe('draft');
    contentId = body.id;
  });

  it('GET /api/content-items/:id returns item with variants', async () => {
    const { status, body } = await get(`/api/content-items/${contentId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(contentId);
    expect(Array.isArray(body.contentVariants)).toBe(true);
  });

  it('GET /api/content-items/:id 404 for missing', async () => {
    const { status } = await get('/api/content-items/nonexistent');
    expect(status).toBe(404);
  });

  it('PUT /api/content-items/:id updates item', async () => {
    const { status, body } = await put(`/api/content-items/${contentId}`, {
      title: 'Updated Title', body: 'Updated body'
    });
    expect(status).toBe(200);
    expect(body.title).toBe('Updated Title');
  });

  it('POST /api/content-items/:id/generate-variants creates 6 variants', async () => {
    const { status, body } = await post(`/api/content-items/${contentId}/generate-variants`);
    expect(status).toBe(201);
    expect(body.length).toBe(6);
  });

  it('POST /api/content-items/:id/compliance-check creates skill run', async () => {
    const { status, body } = await post(`/api/content-items/${contentId}/compliance-check`);
    expect(status).toBe(200);
    expect(body.skillRunId).toBeDefined();
    expect(body.passed).toBe(true);
  });

  it('DELETE /api/content-items/:id soft-deletes draft content', async () => {
    const { body: item } = await post('/api/content-items', { type: 'text_image', title: 'To Delete' });
    const { status, body } = await del(`/api/content-items/${item.id}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('DELETE /api/content-items/:id blocks published content', async () => {
    const { body: items } = await get('/api/content-items');
    const published = items.find((i: any) => i.contentVariants?.some((v: any) => v.publishJobs?.some((j: any) => j.status === 'PUBLISHED')));
    if (published) {
      const { status } = await del(`/api/content-items/${published.id}`);
      expect(status).toBe(400);
    }
  });
});

describe('Media API', () => {
  let mediaId: string;

  it('GET /api/media-assets returns seed data', async () => {
    const { status, body } = await get('/api/media-assets');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/media-assets creates asset via JSON', async () => {
    const { status, body } = await post('/api/media-assets', {
      fileName: 'test.png', fileType: 'image/png', fileSize: 2048
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.reviewStatus).toBe('pending_review');
    mediaId = body.id;
  });

  it('GET /api/media-assets?reviewStatus=approved filters', async () => {
    const { status, body } = await get('/api/media-assets?reviewStatus=approved');
    expect(status).toBe(200);
    expect(body.every((m: any) => m.reviewStatus === 'approved')).toBe(true);
  });

  it('PUT /api/media-assets/:id/review approves', async () => {
    const { status, body } = await put(`/api/media-assets/${mediaId}/review`, {
      status: 'approved', note: 'Looks good'
    });
    expect(status).toBe(200);
    expect(body.reviewStatus).toBe('approved');
  });
});
