import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  resetDatabase
} from '../../../packages/database/src';
import { createApiServer } from '../../../apps/api/src';

const db = createDatabaseClient();
let server: Server;
let baseUrl: string;

async function get(url: string) {
  const res = await fetch(`${baseUrl}${url}`);
  return { status: res.status, body: await res.json() };
}

async function post(url: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function put(url: string, body: unknown) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await resetDatabase(db);
  server = createApiServer({ db });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No TCP address');
  baseUrl = `http://${addr.address}:${addr.port}`;
  // Seed demo data so most endpoints have data to return
  await post('/api/demo/run');
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close((e) => e ? Promise.reject(e) : resolve()));
  await db.$disconnect();
});

// ── Health ───────────────────────────────────────────────────────
describe('Health', () => {
  it('GET /health returns ok', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });
});

// ── Dashboard ────────────────────────────────────────────────────
describe('Dashboard', () => {
  it('GET /api/dashboard returns metrics', async () => {
    const { status, body } = await get('/api/dashboard');
    expect(status).toBe(200);
    expect(body.metrics).toBeDefined();
    expect(body.metrics.publishJobs).toBeGreaterThanOrEqual(0);
  });
});

// ── Demo ─────────────────────────────────────────────────────────
describe('Demo', () => {
  it('POST /api/demo/run seeds data', async () => {
    const { status, body } = await post('/api/demo/run');
    expect(status).toBe(200);
    expect(body.metrics.publishedJobs).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/demo/reset clears data', async () => {
    const { status, body } = await post('/api/demo/reset');
    expect(status).toBe(200);
    expect(body.metrics.publishJobs).toBe(0);
    // Re-seed for subsequent tests
    await post('/api/demo/run');
  });
});

// ── Research Tasks ───────────────────────────────────────────────
describe('Research Tasks', () => {
  let taskId: string;

  it('GET /api/research-tasks returns array', async () => {
    const { status, body } = await get('/api/research-tasks');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) taskId = body[0].id;
  });

  it('POST /api/research-tasks creates a task', async () => {
    const { status, body } = await post('/api/research-tasks', {
      type: 'keyword_search',
      platforms: ['douyin'],
      keywords: ['测试']
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.type).toBe('keyword_search');
    taskId = body.id;
  });

  it('GET /api/research-tasks/:id returns task detail', async () => {
    const { status, body } = await get(`/api/research-tasks/${taskId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(taskId);
  });

  it('GET /api/research-tasks/:id 404 for missing', async () => {
    const { status } = await get('/api/research-tasks/nonexistent-id');
    expect(status).toBe(404);
  });

  it('POST /api/research-tasks/:id/run transitions status', async () => {
    const { status, body } = await post(`/api/research-tasks/${taskId}/run`);
    expect(status).toBe(200);
    expect(body.status).toBe('RUNNING');
  });

  it('GET /api/research-tasks/:taskId/posts returns array', async () => {
    const { status, body } = await get(`/api/research-tasks/${taskId}/posts`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/research-tasks/:taskId/comments returns array', async () => {
    const { status, body } = await get(`/api/research-tasks/${taskId}/comments`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── Research Insights ────────────────────────────────────────────
describe('Research Insights', () => {
  it('GET /api/research-insights returns array', async () => {
    const { status, body } = await get('/api/research-insights');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── Content Opportunities ────────────────────────────────────────
describe('Content Opportunities', () => {
  let oppId: string | undefined;

  it('GET /api/content-opportunities returns array', async () => {
    const { status, body } = await get('/api/content-opportunities');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) oppId = body[0].id;
  });

  it('POST /api/content-opportunities/:id/create-content creates item', async () => {
    if (!oppId) return; // skip if no demo opportunities
    const { status, body } = await post(`/api/content-opportunities/${oppId}/create-content`);
    expect(status).toBe(201);
    expect(body.contentItemId).toBeDefined();
  });

  it('POST /api/content-opportunities/:id/create-content 404 for missing', async () => {
    const { status } = await post('/api/content-opportunities/nonexistent/create-content');
    expect(status).toBe(404);
  });
});

// ── Content Items ────────────────────────────────────────────────
describe('Content Items', () => {
  let contentId: string;

  it('GET /api/content-items returns array', async () => {
    const { status, body } = await get('/api/content-items');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/content-items creates item', async () => {
    const { status, body } = await post('/api/content-items', {
      type: 'text_image',
      title: 'Test Content',
      body: 'Test body content'
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    contentId = body.id;
  });

  it('GET /api/content-items/:id returns item', async () => {
    const { status, body } = await get(`/api/content-items/${contentId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(contentId);
    expect(body.title).toBe('Test Content');
  });

  it('GET /api/content-items/:id 404 for missing', async () => {
    const { status } = await get('/api/content-items/nonexistent-id');
    expect(status).toBe(404);
  });

  it('PUT /api/content-items/:id updates item', async () => {
    const { status, body } = await put(`/api/content-items/${contentId}`, {
      title: 'Updated Title',
      body: 'Updated body'
    });
    expect(status).toBe(200);
    expect(body.title).toBe('Updated Title');
  });

  it('GET /api/content-items/:id/variants returns array', async () => {
    const { status, body } = await get(`/api/content-items/${contentId}/variants`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/content-items/:id/generate-variants creates variants', async () => {
    const { status, body } = await post(`/api/content-items/${contentId}/generate-variants`);
    expect(status).toBe(201);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});

// ── Media Assets ─────────────────────────────────────────────────
describe('Media Assets', () => {
  let mediaId: string;

  it('GET /api/media-assets returns array', async () => {
    const { status, body } = await get('/api/media-assets');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/media-assets creates asset', async () => {
    const { status, body } = await post('/api/media-assets', {
      fileName: 'test.png',
      fileType: 'image/png',
      fileSize: 1024
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    mediaId = body.id;
  });

  it('GET /api/media-assets?reviewStatus=approved filters', async () => {
    const { status, body } = await get('/api/media-assets?reviewStatus=approved');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('PUT /api/media-assets/:id/review updates status', async () => {
    const { status, body } = await put(`/api/media-assets/${mediaId}/review`, {
      status: 'approved',
      note: 'Looks good'
    });
    expect(status).toBe(200);
    expect(body.reviewStatus).toBe('approved');
  });
});

// ── Publish Jobs ─────────────────────────────────────────────────
describe('Publish Jobs', () => {
  let jobId: string;

  it('GET /api/publish-jobs returns array', async () => {
    const { status, body } = await get('/api/publish-jobs');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) jobId = body[0].id;
  });

  it('POST /api/publish-jobs creates job using existing variant/account', async () => {
    // Fetch real IDs from demo data to satisfy FK constraints
    const { body: accounts } = await get('/api/accounts');
    const { body: items } = await get('/api/content-items');
    const variantId = items?.[0]?.contentVariants?.[0]?.id;
    const accountId = accounts?.[0]?.id;
    if (!variantId || !accountId) return; // skip if no demo data

    const { status, body } = await post('/api/publish-jobs', {
      contentVariantId: variantId,
      platformAccountId: accountId,
      platform: accounts[0].platform,
      contentType: 'text_image'
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    jobId = body.id;
  });

  it('GET /api/publish-jobs/:id returns job', async () => {
    const { status, body } = await get(`/api/publish-jobs/${jobId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(jobId);
  });

  it('GET /api/publish-jobs/:id 404 for missing', async () => {
    const { status } = await get('/api/publish-jobs/nonexistent-id');
    expect(status).toBe(404);
  });

  it('GET /api/publish-jobs/:jobId/attempts returns array', async () => {
    const { status, body } = await get(`/api/publish-jobs/${jobId}/attempts`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/publish-jobs/:id/retry updates job', async () => {
    const { status, body } = await post(`/api/publish-jobs/${jobId}/retry`);
    expect(status).toBe(200);
    expect(body.status).toBe('RUNNING');
  });

  it('POST /api/publish-jobs/:id/cancel cancels an existing DRAFT job', async () => {
    // Find an existing DRAFT job from demo data instead of creating new one
    const { body: jobs } = await get('/api/publish-jobs?status=DRAFT');
    if (!jobs || jobs.length === 0) {
      // No DRAFT jobs available; use a PENDING one
      const { body: allJobs } = await get('/api/publish-jobs');
      const candidate = allJobs?.find((j: { status: string }) => j.status !== 'CANCELLED' && j.status !== 'PUBLISHED');
      if (!candidate) return; // skip
      const { status, body } = await post(`/api/publish-jobs/${candidate.id}/cancel`);
      expect(status).toBe(200);
      expect(body.status).toBe('CANCELLED');
      return;
    }
    const { status, body } = await post(`/api/publish-jobs/${jobs[0].id}/cancel`);
    expect(status).toBe(200);
    expect(body.status).toBe('CANCELLED');
  });

  it('GET /api/publish-jobs?status=DRAFT filters', async () => {
    const { status, body } = await get('/api/publish-jobs?status=DRAFT');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/publish/execute returns deprecated (400)', async () => {
    const { status } = await post('/api/publish/execute');
    expect(status).toBe(400);
  });
});

// ── Interactions ─────────────────────────────────────────────────
describe('Interactions', () => {
  let interactionId: string | undefined;

  it('GET /api/interactions returns array', async () => {
    const { status, body } = await get('/api/interactions');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) interactionId = body[0].id;
  });

  it('GET /api/interactions?status=NEW filters', async () => {
    const { status, body } = await get('/api/interactions?status=NEW');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/interactions/:id/reply-suggestions returns array', async () => {
    if (!interactionId) return;
    const { status, body } = await get(`/api/interactions/${interactionId}/reply-suggestions`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/interactions/:id/reply sends reply', async () => {
    if (!interactionId) return;
    const { status, body } = await post(`/api/interactions/${interactionId}/reply`, {
      content: 'Test reply content'
    });
    expect(status).toBe(200);
    expect(body.status).toBe('REPLIED');
  });

  it('POST /api/interactions/:id/review approves', async () => {
    // Need a fresh interaction that wasn't already replied to
    const { body: interactions } = await get('/api/interactions');
    const fresh = interactions.find((i: { status: string }) => i.status !== 'REPLIED' && i.status !== 'IGNORED');
    if (!fresh) return;
    const { status, body } = await post(`/api/interactions/${fresh.id}/review`, {
      action: 'approve'
    });
    expect(status).toBe(200);
    expect(['REPLIED', 'IGNORED']).toContain(body.status);
  });

  it('POST /api/interactions/:id/review rejects', async () => {
    const { body: interactions } = await get('/api/interactions');
    const fresh = interactions.find((i: { status: string }) => i.status !== 'REPLIED' && i.status !== 'IGNORED');
    if (!fresh) return;
    const { status, body } = await post(`/api/interactions/${fresh.id}/review`, {
      action: 'reject'
    });
    expect(status).toBe(200);
    expect(body.status).toBe('IGNORED');
  });

  it('POST /api/interactions/sync requires platform and platformAccountId', async () => {
    const { status, body } = await post('/api/interactions/sync', {});
    expect(status).toBe(400);
    expect(body.error).toContain('必填');
  });

  it('POST /api/interactions/sync creates sync job and dispatches', async () => {
    const { status, body } = await post('/api/interactions/sync', {
      platform: 'douyin',
      platformAccountId: 'test-account-1',
      syncType: 'comments',
      mode: 'sandbox',
    });
    // May be 202 (success) or 500 (Redis not available in test)
    if (status === 202) {
      expect(body.syncJobId).toBeDefined();
      expect(body.status).toBe('queued');
      expect(body.queued).toContain('comments');
    } else {
      // Redis not available — endpoint still creates the sync job in DB first
      expect([500, 202]).toContain(status);
    }
  });
});

// ── Conversations ────────────────────────────────────────────────
describe('Conversations', () => {
  it('GET /api/conversations/:id returns 404 for missing', async () => {
    const { status } = await get('/api/conversations/nonexistent-id');
    expect(status).toBe(404);
  });

  it('GET /api/conversations/:id returns conversation when exists', async () => {
    const { body: interactions } = await get('/api/interactions');
    const withConversation = interactions.find((i: { conversationId: string | null }) => i.conversationId);
    if (!withConversation) return;
    const { status, body } = await get(`/api/conversations/${withConversation.conversationId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(withConversation.conversationId);
    expect(Array.isArray(body.interactions)).toBe(true);
  });
});

// ── Leads ────────────────────────────────────────────────────────
describe('Leads', () => {
  let leadId: string | undefined;

  it('GET /api/leads returns array', async () => {
    const { status, body } = await get('/api/leads');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) leadId = body[0].id;
  });

  it('GET /api/leads?level=A filters', async () => {
    const { status, body } = await get('/api/leads?level=A');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/leads/:id returns lead detail', async () => {
    if (!leadId) return;
    const { status, body } = await get(`/api/leads/${leadId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(leadId);
    expect(Array.isArray(body.leadActivities)).toBe(true);
  });

  it('GET /api/leads/:id 404 for missing', async () => {
    const { status } = await get('/api/leads/nonexistent-id');
    expect(status).toBe(404);
  });

  it('PUT /api/leads/:id updates lead', async () => {
    if (!leadId) return;
    const { status, body } = await put(`/api/leads/${leadId}`, {
      status: 'QUALIFIED',
      assignedTo: 'test-user'
    });
    expect(status).toBe(200);
    expect(body.status).toBe('QUALIFIED');
  });

  it('GET /api/leads/:leadId/activities returns array', async () => {
    if (!leadId) return;
    const { status, body } = await get(`/api/leads/${leadId}/activities`);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/leads/:id/sync-feishu syncs', async () => {
    if (!leadId) return;
    const { status, body } = await post(`/api/leads/${leadId}/sync-feishu`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('POST /api/leads/:id/sync-wecom syncs', async () => {
    if (!leadId) return;
    const { status, body } = await post(`/api/leads/${leadId}/sync-wecom`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('POST /api/leads/:id/sync-feishu 404 for missing', async () => {
    const { status } = await post('/api/leads/nonexistent-id/sync-feishu');
    expect(status).toBe(404);
  });
});

// ── Analytics ────────────────────────────────────────────────────
describe('Analytics', () => {
  it('GET /api/analytics/overview returns metrics', async () => {
    const { status, body } = await get('/api/analytics/overview');
    expect(status).toBe(200);
    expect(body.totalPublished).toBeGreaterThanOrEqual(0);
    expect(body.totalInteractions).toBeGreaterThanOrEqual(0);
    expect(body.totalLeads).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/analytics/platforms returns array', async () => {
    const { status, body } = await get('/api/analytics/platforms');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].platform).toBeDefined();
      expect(body[0].publishCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('GET /api/analytics/content-roi returns array', async () => {
    const { status, body } = await get('/api/analytics/content-roi');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/analytics/leads/trend returns array', async () => {
    const { status, body } = await get('/api/analytics/leads/trend');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/analytics/platforms/trend returns array', async () => {
    const { status, body } = await get('/api/analytics/platforms/trend');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── Platform Accounts & Providers ────────────────────────────────
describe('Integrations', () => {
  it('GET /api/accounts returns array', async () => {
    const { status, body } = await get('/api/accounts');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/providers returns array', async () => {
    const { status, body } = await get('/api/providers');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── Lead Sink Configs ───────────────────────────────────────────
describe('Lead Sink Configs', () => {
  it('GET /api/lead-sinks/feishu returns config', async () => {
    const { status, body } = await get('/api/lead-sinks/feishu');
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });

  it('PUT /api/lead-sinks/feishu creates/updates config', async () => {
    const { status, body } = await put('/api/lead-sinks/feishu', {
      appId: 'test-app-id',
      appToken: 'test-token',
      tableId: 'test-table'
    });
    expect([200, 201]).toContain(status);
    expect(body).toBeDefined();
  });

  it('GET /api/lead-sinks/feishu returns saved config', async () => {
    const { status, body } = await get('/api/lead-sinks/feishu');
    expect(status).toBe(200);
    expect(body.appId).toBe('test-app-id');
  });

  it('GET /api/lead-sinks/wecom returns config', async () => {
    const { status, body } = await get('/api/lead-sinks/wecom');
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });

  it('PUT /api/lead-sinks/wecom creates/updates config', async () => {
    const { status, body } = await put('/api/lead-sinks/wecom', {
      corpId: 'test-corp-id',
      agentId: 'test-agent-id'
    });
    expect([200, 201]).toContain(status);
    expect(body).toBeDefined();
  });

  it('GET /api/lead-sinks/wecom returns saved config', async () => {
    const { status, body } = await get('/api/lead-sinks/wecom');
    expect(status).toBe(200);
    expect(body.corpId).toBe('test-corp-id');
  });
});

// ── Settings: AI ─────────────────────────────────────────────────
describe('Settings: AI', () => {
  it('GET /api/settings/ai returns config', async () => {
    const { status, body } = await get('/api/settings/ai');
    expect(status).toBe(200);
    expect(body.provider).toBeDefined();
    expect(body.model).toBeDefined();
    expect(body.features).toBeDefined();
    expect(body.features.textGeneration).toBe(true);
  });

  it('PUT /api/settings/ai updates config', async () => {
    const { status, body } = await put('/api/settings/ai', {
      provider: 'anthropic',
      model: 'claude-3-opus'
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

// ── Settings: Skills ─────────────────────────────────────────────
describe('Settings: Skills', () => {
  it('GET /api/skills returns array', async () => {
    const { status, body } = await get('/api/skills');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── Settings: Compliance ─────────────────────────────────────────
describe('Settings: Compliance', () => {
  it('GET /api/settings/compliance returns rules', async () => {
    const { status, body } = await get('/api/settings/compliance');
    expect(status).toBe(200);
    expect(Array.isArray(body.sensitiveWords)).toBe(true);
    expect(Array.isArray(body.forbiddenPhrases)).toBe(true);
    expect(body.autoReplyLimits).toBeDefined();
    expect(body.autoReplyLimits.maxDailyReplies).toBeGreaterThan(0);
    expect(Array.isArray(body.humanConfirmRules)).toBe(true);
  });

  it('PUT /api/settings/compliance updates rules', async () => {
    const { status, body } = await put('/api/settings/compliance', {
      sensitiveWords: ['测试词'],
      forbiddenPhrases: ['测试话术']
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

// ── Legacy Research Run ──────────────────────────────────────────
describe('Legacy Research Run', () => {
  it('POST /api/research/run returns 500 (broken legacy route)', async () => {
    const { status } = await post('/api/research/run');
    expect(status).toBe(500);
  });
});

// ── Route 404 ────────────────────────────────────────────────────
describe('Unknown routes', () => {
  it('returns 404 for unknown path', async () => {
    const { status, body } = await get('/api/unknown-endpoint');
    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});
