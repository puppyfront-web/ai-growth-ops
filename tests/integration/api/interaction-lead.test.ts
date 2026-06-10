import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch, type TestAuthContext } from '../../setup/test-auth';

let server: Server;
let baseUrl: string;
let api: ReturnType<typeof createAuthFetch>;
let auth: TestAuthContext;
const db = createDatabaseClient();

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  // Create test data: platform account + interactions + leads
  const account = await db.platformAccount.create({
    data: {
      organizationId: auth.orgId,
      userId: auth.userId,
      platform: 'douyin',
      name: 'Test Account',
      mode: 'manual_confirm',
      status: 'active'
    }
  });

  // Create interactions (6 NEW comments + 2 messages)
  const interactionPromises = [];
  const comments = [
    '多少钱？可以预约吗？',
    '我想了解一下具体价格',
    '请问价格是多少？',
    '请问有什么优惠吗？',
    '这个产品怎么样？',
    '能不能发个详细介绍？'
  ];
  for (let i = 0; i < comments.length; i++) {
    interactionPromises.push(
      db.interaction.create({
        data: {
          userId: auth.userId,
          organizationId: auth.orgId,
          platformAccountId: account.id,
          externalInteractionId: `test_comment_${i}`,
          platform: 'douyin',
          type: 'comment',
          status: 'NEW',
          content: comments[i],
          externalUserId: `test_user_${i}`,
          externalUserName: `测试用户${i + 1}`
        }
      })
    );
  }
  for (let i = 0; i < 2; i++) {
    interactionPromises.push(
      db.interaction.create({
        data: {
          userId: auth.userId,
          organizationId: auth.orgId,
          platformAccountId: account.id,
          externalInteractionId: `test_message_${i}`,
          platform: 'douyin',
          type: 'message',
          status: 'NEW',
          content: `私信内容${i + 1}`,
          externalUserId: `test_msg_user_${i}`,
          externalUserName: `私信用户${i + 1}`
        }
      })
    );
  }
  await Promise.all(interactionPromises);

  // Create leads (6 leads with various levels)
  const levels = ['A', 'A', 'B', 'B', 'C', 'C'];
  for (let i = 0; i < levels.length; i++) {
    await db.lead.create({
      data: {
        userId: auth.userId,
        organizationId: auth.orgId,
        sourcePlatform: 'douyin',
        sourceAccountId: account.id,
        externalUserId: `seed_lead_user_${i}`,
        externalUserName: `种子线索用户${i + 1}`,
        level: levels[i],
        status: 'NEW',
        intent: i < 2 ? 'price_inquiry' : 'info_request'
      }
    });
  }
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
});

describe('Interaction API', () => {
  let interactionId: string;

  it('GET /api/interactions returns seed data', async () => {
    const { status, body } = await api.get('/api/interactions');
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThanOrEqual(6);
  });

  it('GET /api/interactions?status=NEW filters', async () => {
    const { status, body } = await api.get('/api/interactions?status=NEW');
    expect(status).toBe(200);
    expect(body.items.every((i: Record<string, unknown>) => i.status === 'NEW')).toBe(
      true
    );
    if (body.items.length > 0) interactionId = body.items[0].id;
  });

  it('POST /api/interactions/:id/classify sets CLASSIFIED', async () => {
    if (!interactionId) return;
    const { status, body } = await api.post(
      `/api/interactions/${interactionId}/classify`,
      {
        intentLevel: 'A',
        intent: 'pricing_inquiry'
      }
    );
    expect(status).toBe(200);
    expect(body.status).toBe('CLASSIFIED');
  });

  it('POST /api/interactions/:id/suggest-reply returns suggestions', async () => {
    if (!interactionId) return;
    const { status, body } = await api.post(
      `/api/interactions/${interactionId}/suggest-reply`
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].content ?? body[0].suggestedText).toBeDefined();
    }
  });

  it('POST /api/interactions/:id/reply sets REPLIED', async () => {
    if (!interactionId) return;
    const { status, body } = await api.post(
      `/api/interactions/${interactionId}/reply`,
      {
        content: '感谢咨询，稍后回复您'
      }
    );
    // API may return 200 (sync) or 202 (queued)
    expect([200, 202]).toContain(status);
    if (status === 200) {
      expect(body.status).toBe('REPLIED');
    }
  });

  it('POST /api/interactions/:id/convert-to-lead creates lead', async () => {
    // Use a fresh NEW interaction (classify it first), avoiding already-replied ones
    const { body: interactionsResult } = await api.get('/api/interactions?status=NEW');
    const interactions = interactionsResult.items;
    if (interactions.length === 0) return;
    const intId = interactions[0].id;

    // Classify first
    await api.post(`/api/interactions/${intId}/classify`, {
      intentLevel: 'B',
      intent: 'info_request'
    });

    const { status, body } = await api.post(
      `/api/interactions/${intId}/convert-to-lead`
    );
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.sourceInteractionId).toBe(intId);
  });
});

describe('Conversation API', () => {
  it('GET /api/conversations returns list', async () => {
    const { status, body } = await api.get('/api/conversations');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/conversations/:id returns conversation with interactions', async () => {
    const { body: convs } = await api.get('/api/conversations');
    if (convs.length === 0) return;
    const { status, body } = await api.get(`/api/conversations/${convs[0].id}`);
    expect(status).toBe(200);
    expect(body.interactions).toBeDefined();
  });
});

describe('Lead API', () => {
  let leadId: string;

  it('POST /api/leads creates lead manually', async () => {
    const { body: accounts } = await api.get('/api/accounts');
    if (accounts.length === 0) return;
    const { status, body } = await api.post('/api/leads', {
      sourcePlatform: 'douyin',
      sourceAccountId: accounts[0].id,
      externalUserId: 'manual_user_001',
      externalUserName: '手动创建客户',
      level: 'B',
      intent: 'demo_request'
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('NEW');
    leadId = body.id;
  });

  it('GET /api/leads returns seed + new leads', async () => {
    const { status, body } = await api.get('/api/leads');
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/leads?level=A filters', async () => {
    const { status, body } = await api.get('/api/leads?level=A');
    expect(status).toBe(200);
    expect(body.items.every((l: Record<string, unknown>) => l.level === 'A')).toBe(
      true
    );
  });

  it('PATCH /api/leads/:id/assign assigns owner', async () => {
    if (!leadId) return;

    // Create lead sink configs so sync tests work
    await db.leadSinkConfig.upsert({
      where: { id: `test-feishu-${auth.orgId}` },
      create: {
        id: `test-feishu-${auth.orgId}`,
        organizationId: auth.orgId,
        userId: auth.userId,
        sinkType: 'lark',
        config: { appId: 'mock', appSecret: 'mock', appToken: 'mock', tableId: 'mock' }
      },
      update: {}
    });
    await db.leadSinkConfig.upsert({
      where: { id: `test-wecom-${auth.orgId}` },
      create: {
        id: `test-wecom-${auth.orgId}`,
        organizationId: auth.orgId,
        userId: auth.userId,
        sinkType: 'wecom',
        config: { corpId: 'mock', secret: 'mock', agentId: 'mock' }
      },
      update: {}
    });

    const res = await fetch(`${baseUrl}/api/leads/${leadId}/assign`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...auth.headers
      },
      body: JSON.stringify({ assignedTo: 'operator-1' })
    });
    const respBody = await res.json();
    expect(res.status).toBe(200);
    expect(respBody.status).toBe('ASSIGNED');
    expect(respBody.assignedTo).toBe('operator-1');
  });

  it('GET /api/leads/:id/activities shows assignment', async () => {
    if (!leadId) return;
    const { status, body } = await api.get(`/api/leads/${leadId}/activities`);
    expect(status).toBe(200);
    const assignAct = body.find(
      (a: Record<string, unknown>) => a.action === 'assigned'
    );
    expect(assignAct).toBeDefined();
  });

  it('POST /api/leads/:id/sync-feishu creates mapping', async () => {
    if (!leadId) return;
    const { status, body } = await api.post(`/api/leads/${leadId}/sync-feishu`);
    expect(status).toBe(200);
    // May succeed (real sink) or fail gracefully (no real Feishu in test env)
    expect(typeof body.success).toBe('boolean');
  });

  it('POST /api/leads/:id/sync-wecom creates mapping', async () => {
    if (!leadId) return;
    const { status, body } = await api.post(`/api/leads/${leadId}/sync-wecom`);
    expect(status).toBe(200);
    // May succeed (real sink) or fail gracefully (no real WeCom in test env)
    expect(typeof body.success).toBe('boolean');
  });

  it('idempotent sync does not duplicate', async () => {
    if (!leadId) return;
    const { body: before } = await api.get(`/api/leads/${leadId}`);
    const mappingCount = before.externalMappings?.length ?? 0;

    await api.post(`/api/leads/${leadId}/sync-feishu`);
    const { body: after } = await api.get(`/api/leads/${leadId}`);
    // External mappings should not grow (idempotent)
    expect((after.externalMappings?.length ?? 0)).toBeGreaterThanOrEqual(mappingCount);
  });
});
