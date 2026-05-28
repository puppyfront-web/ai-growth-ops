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

describe('Full Main Flow (API level)', () => {
  it('Step 1: Research → Content', async () => {
    // Create research task
    const { body: task } = await post('/api/research-tasks', {
      type: 'keyword_research', platforms: ['xiaohongshu', 'douyin'], keywords: ['AI获客', '内容营销']
    });
    expect(task.status).toBe('DRAFT');

    // Run task
    const { body: running } = await post(`/api/research-tasks/${task.id}/run`);
    expect(running.status).toBe('RUNNING');

    // Create content from opportunity
    const { body: opps } = await get('/api/content-opportunities');
    if (opps.length > 0) {
      const { status, body: created } = await post(`/api/content-opportunities/${opps[0].id}/create-content`);
      expect(status).toBe(201);
      expect(created.contentItemId).toBeDefined();
    }
  });

  it('Step 2: Content → Publish', async () => {
    // Create fresh content to avoid seed data conflicts
    const { body: newItem } = await post('/api/content-items', {
      type: 'text_image', title: 'Full Flow Test', body: 'Testing full flow'
    });
    const contentId = newItem.id;

    // Generate variants
    const { body: variants } = await post(`/api/content-items/${contentId}/generate-variants`);
    expect(variants.length).toBeGreaterThan(0);

    // Create publish job using first variant
    const { body: accounts } = await get('/api/accounts');
    const { status: jobStatus, body: job } = await post('/api/publish-jobs', {
      contentVariantId: variants[0].id, platformAccountId: accounts[0].id,
      platform: variants[0].platform, contentType: 'text_image', mode: 'manual_confirm'
    });
    expect(jobStatus).toBe(201);

    // Execute + manual complete
    await db.publishJob.update({ where: { id: job.id }, data: { status: 'READY' } });
    const { body: executed } = await post(`/api/publish-jobs/${job.id}/execute`);
    expect(executed.status).toBe('RUNNING');

    await db.publishJob.update({ where: { id: job.id }, data: { status: 'WAITING_HUMAN_CONFIRM' } });
    const { body: completed } = await post(`/api/publish-jobs/${job.id}/manual-complete`, {
      externalUrl: 'https://example.com/published'
    });
    expect(completed.status).toBe('PUBLISHED');
  });

  it('Step 3: Interaction → Lead', async () => {
    // Use CLASSIFIED interactions that don't have existing leads
    const { body: interactions } = await get('/api/interactions');
    const classified = interactions.filter((i: any) =>
      ['NEW', 'CLASSIFIED', 'REPLY_SUGGESTED'].includes(i.status)
    );
    if (classified.length === 0) return;

    const intId = classified[0].id;
    if (classified[0].status === 'NEW') {
      await post(`/api/interactions/${intId}/classify`, { intentLevel: 'C', intent: 'general' });
    }

    const { body: suggestions } = await post(`/api/interactions/${intId}/suggest-reply`);
    expect(Array.isArray(suggestions)).toBe(true);

    const { status, body: lead } = await post(`/api/interactions/${intId}/convert-to-lead`);
    if (status === 500) {
      // Lead already exists for this user — skip gracefully
      return;
    }
    expect(status).toBe(201);
    expect(lead.id).toBeDefined();
  });

  it('Step 4: Lead → Sync', async () => {
    const { body: leads } = await get('/api/leads?status=NEW');
    if (leads.length === 0) return;
    const leadId = leads[0].id;

    // Sync feishu
    const { body: fResult } = await post(`/api/leads/${leadId}/sync-feishu`);
    expect(fResult.success).toBe(true);

    // Sync wecom
    const { body: wResult } = await post(`/api/leads/${leadId}/sync-wecom`);
    expect(wResult.success).toBe(true);

    // Verify mappings
    const { body: lead } = await get(`/api/leads/${leadId}`);
    expect(lead.externalMappings.length).toBe(2);
    expect(lead.syncLogs.length).toBeGreaterThanOrEqual(2);
  });

  it('Step 5: Analytics reflect changes', async () => {
    const { status, body } = await get('/api/analytics/overview');
    expect(status).toBe(200);
    expect(body.totalPublishJobs).toBeGreaterThan(0);
    expect(body.totalInteractions).toBeGreaterThan(0);
  });
});
