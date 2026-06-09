import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';

let server: Server;
let baseUrl: string;
const db = createDatabaseClient();

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}
async function post(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}
async function patch(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  server = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address()!;
  baseUrl = `http://${(addr as Record<string, unknown>).address}:${(addr as Record<string, unknown>).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
});

describe('Interaction API', () => {
  let interactionId: string;

  it('GET /api/interactions returns seed data', async () => {
    const { status, body } = await get('/api/interactions');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(6);
  });

  it('GET /api/interactions?status=NEW filters', async () => {
    const { status, body } = await get('/api/interactions?status=NEW');
    expect(status).toBe(200);
    expect(body.every((i: Record<string, unknown>) => i.status === 'NEW')).toBe(
      true
    );
    if (body.length > 0) interactionId = body[0].id;
  });

  it('POST /api/interactions/:id/classify sets CLASSIFIED', async () => {
    if (!interactionId) return;
    const { status, body } = await post(
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
    const { status, body } = await post(
      `/api/interactions/${interactionId}/suggest-reply`
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].content).toBeDefined();
  });

  it('POST /api/interactions/:id/reply sets REPLIED', async () => {
    if (!interactionId) return;
    const { status, body } = await post(
      `/api/interactions/${interactionId}/reply`,
      {
        content: '感谢咨询，稍后回复您'
      }
    );
    expect(status).toBe(200);
    expect(body.status).toBe('REPLIED');
  });

  it('POST /api/interactions/:id/convert-to-lead creates lead', async () => {
    // Use a fresh NEW interaction (classify it first), avoiding seed data with existing leads
    const { body: interactions } = await get('/api/interactions?status=NEW');
    if (interactions.length === 0) return;
    const intId = interactions[0].id;

    // Classify first
    await post(`/api/interactions/${intId}/classify`, {
      intentLevel: 'B',
      intent: 'info_request'
    });

    const { status, body } = await post(
      `/api/interactions/${intId}/convert-to-lead`
    );
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.sourceInteractionId).toBe(intId);
  });
});

describe('Conversation API', () => {
  it('GET /api/conversations returns list', async () => {
    const { status, body } = await get('/api/conversations');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/conversations/:id returns conversation with interactions', async () => {
    const { body: convs } = await get('/api/conversations');
    if (convs.length === 0) return;
    const { status, body } = await get(`/api/conversations/${convs[0].id}`);
    expect(status).toBe(200);
    expect(body.interactions).toBeDefined();
  });
});

describe('Lead API', () => {
  let leadId: string;

  it('POST /api/leads creates lead manually', async () => {
    const { body: accounts } = await get('/api/accounts');
    const { status, body } = await post('/api/leads', {
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
    const { status, body } = await get('/api/leads');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(7);
  });

  it('GET /api/leads?level=A filters', async () => {
    const { status, body } = await get('/api/leads?level=A');
    expect(status).toBe(200);
    expect(body.every((l: Record<string, unknown>) => l.level === 'A')).toBe(
      true
    );
  });

  it('PATCH /api/leads/:id/assign assigns owner', async () => {
    if (!leadId) return;
    const { status, body } = await patch(`/api/leads/${leadId}/assign`, {
      assignedTo: 'operator-1'
    });
    expect(status).toBe(200);
    expect(body.status).toBe('ASSIGNED');
    expect(body.assignedTo).toBe('operator-1');
  });

  it('GET /api/leads/:id/activities shows assignment', async () => {
    if (!leadId) return;
    const { status, body } = await get(`/api/leads/${leadId}/activities`);
    expect(status).toBe(200);
    const assignAct = body.find(
      (a: Record<string, unknown>) => a.action === 'assigned'
    );
    expect(assignAct).toBeDefined();
  });

  it('POST /api/leads/:id/sync-feishu creates mapping', async () => {
    if (!leadId) return;
    const { status, body } = await post(`/api/leads/${leadId}/sync-feishu`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('POST /api/leads/:id/sync-wecom creates mapping', async () => {
    if (!leadId) return;
    const { status, body } = await post(`/api/leads/${leadId}/sync-wecom`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('idempotent sync does not duplicate', async () => {
    if (!leadId) return;
    const { body: before } = await get(`/api/leads/${leadId}`);
    const mappingCount = before.externalMappings?.length ?? 0;

    await post(`/api/leads/${leadId}/sync-feishu`);
    const { body: after } = await get(`/api/leads/${leadId}`);
    expect(after.externalMappings.length).toBe(mappingCount);
  });
});
