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

let variantId: string;
let accountId: string;
let jobId: string;

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as any).address}:${(addr as any).port}`;

  // Get seed data IDs — find an unused variant/account combo
  const { body: accounts } = await get('/api/accounts');
  const { body: items } = await get('/api/content-items');
  const { body: existingJobs } = await get('/api/publish-jobs');

  // Find a variant that doesn't already have a job
  for (const item of items) {
    for (const v of item.contentVariants ?? []) {
      const hasJob = existingJobs.some((j: any) => j.contentVariantId === v.id);
      if (!hasJob) {
        variantId = v.id;
        const acc = accounts.find((a: any) => a.platform === v.platform);
        if (acc) { accountId = acc.id; break; }
      }
    }
    if (variantId && accountId) break;
  }

  // Fallback: use any variant/account (may still conflict)
  if (!variantId || !accountId) {
    variantId = items[0]?.contentVariants?.[0]?.id;
    accountId = accounts[0]?.id;
  }

  // Create a DRAFT job for testing
  if (variantId && accountId) {
    const { body: job } = await post('/api/publish-jobs', {
      contentVariantId: variantId, platformAccountId: accountId,
      platform: 'douyin', contentType: 'text_image', mode: 'manual_confirm'
    });
    jobId = job.id;
  }
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
});

describe('Publish API', () => {
  it('GET /api/publish-jobs returns seed data', async () => {
    const { status, body } = await get('/api/publish-jobs');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(4);
  });

  it('POST /api/publish-jobs/batch creates multiple jobs', async () => {
    const { body: accounts } = await get('/api/accounts');
    const { body: items } = await get('/api/content-items');
    const item = items.find((i: any) => i.contentVariants?.length > 0);
    if (!item) return;

    const { status, body } = await post('/api/publish-jobs/batch', {
      contentItemId: item.id,
      platformAccountIds: accounts.slice(0, 2).map((a: any) => a.id)
    });
    expect(status).toBe(201);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/publish-jobs/:id/execute from DRAFT succeeds', async () => {
    const { status, body } = await post(`/api/publish-jobs/${jobId}/execute`);
    expect(status).toBe(200);
    expect(body.status).toBe('RUNNING');
  });

  it('POST /api/publish-jobs/:id/execute from READY succeeds', async () => {
    await db.publishJob.update({ where: { id: jobId }, data: { status: 'READY' } });
    const { status, body } = await post(`/api/publish-jobs/${jobId}/execute`);
    expect(status).toBe(200);
    expect(body.status).toBe('RUNNING');
  });

  it('POST /api/publish-jobs/:id/retry from FAILED increments count', async () => {
    await db.publishJob.update({ where: { id: jobId }, data: { status: 'FAILED', retryCount: 0 } });
    const { status, body } = await post(`/api/publish-jobs/${jobId}/retry`);
    expect(status).toBe(200);
    expect(body.retryCount).toBe(1);
  });

  it('POST /api/publish-jobs/:id/cancel sets CANCELLED', async () => {
    // Use the existing seed DRAFT job
    const { body: jobs } = await get('/api/publish-jobs?status=DRAFT');
    const draftJob = jobs.length > 0 ? jobs[0] : null;
    if (!draftJob) {
      // Create one via DB directly
      const { body: items } = await get('/api/content-items');
      const { body: accounts } = await get('/api/accounts');
      const v = items[0]?.contentVariants?.[0];
      if (!v) return;
      const newJob = await db.publishJob.create({
        data: {
          userId: (await db.user.findFirstOrThrow()).id,
          contentVariantId: v.id, platformAccountId: accounts[0].id,
          platform: v.platform as any, contentType: 'text_image', mode: 'manual_confirm',
          status: 'DRAFT'
        }
      });
      const { status, body } = await post(`/api/publish-jobs/${newJob.id}/cancel`);
      expect(status).toBe(200);
      expect(body.status).toBe('CANCELLED');
    } else {
      const { status, body } = await post(`/api/publish-jobs/${draftJob.id}/cancel`);
      expect(status).toBe(200);
      expect(body.status).toBe('CANCELLED');
    }
  });

  it('POST /api/publish-jobs/:id/manual-complete rejects non-WAITING_HUMAN_CONFIRM', async () => {
    // jobId is now FAILED from retry test
    const { status } = await post(`/api/publish-jobs/${jobId}/manual-complete`, { externalUrl: 'https://example.com' });
    expect(status).toBe(400);
  });

  it('POST /api/publish-jobs/:id/manual-complete from WAITING_HUMAN_CONFIRM', async () => {
    await db.publishJob.update({ where: { id: jobId }, data: { status: 'WAITING_HUMAN_CONFIRM' } });
    const { status, body } = await post(`/api/publish-jobs/${jobId}/manual-complete`, {
      externalUrl: 'https://douyin.com/published/123'
    });
    expect(status).toBe(200);
    expect(body.status).toBe('PUBLISHED');
    expect(body.externalUrl).toBe('https://douyin.com/published/123');
  });

  it('GET /api/publish-jobs/:id/logs returns job and attempts', async () => {
    const { status, body } = await get(`/api/publish-jobs/${jobId}/logs`);
    expect(status).toBe(200);
    expect(body.job).toBeDefined();
    expect(Array.isArray(body.attempts)).toBe(true);
  });

  it('GET /api/publish-jobs/:id/logs 404 for missing', async () => {
    const { status } = await get('/api/publish-jobs/nonexistent/logs');
    expect(status).toBe(404);
  });
});
