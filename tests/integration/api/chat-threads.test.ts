import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';

const db = createDatabaseClient();

let apiServer: Server;
let baseUrl: string;
let authToken = '';
let orgId = '';

async function post(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${authToken}`,
      'x-organization-id': orgId
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${authToken}`,
      'x-organization-id': orgId
    }
  });
  return { status: res.status, body: await res.json() };
}

async function patch(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${authToken}`,
      'x-organization-id': orgId
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  // Reset DB & seed admin user
  await resetDatabase(db);
  await seedDatabase(db);

  // Create organization + membership for seeded admin
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });
  const org = await db.organization.create({
    data: {
      name: 'Chat Test Org',
      slug: `chat-test-${Date.now()}`,
      status: 'active'
    }
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: admin.id,
      role: 'owner',
      status: 'active'
    }
  });
  orgId = org.id;

  // Start API server on random port
  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    apiServer.listen(0, '127.0.0.1', resolve)
  );
  const addr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${addr.address}:${addr.port}`;

  // Login to get token
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@ai-growth-ops.local',
      password: 'changeme123'
    })
  });
  const loginBody = (await loginRes.json()) as { token: string };
  authToken = loginBody.token;
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await db.$disconnect();
});

describe('Chat Thread CRUD', () => {
  let threadId: string;

  it('creates a thread', async () => {
    const { status, body } = await post('/api/chat/threads', {});
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('active');
    expect(body.title).toBeNull();
    threadId = body.id;
  });

  it('creates a thread with title', async () => {
    const { status, body } = await post('/api/chat/threads', {
      title: '测试标题'
    });
    expect(status).toBe(201);
    expect(body.title).toBe('测试标题');
  });

  it('lists threads', async () => {
    const { status, body } = await get('/api/chat/threads');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('gets a thread with messages', async () => {
    const { status, body } = await get(`/api/chat/threads/${threadId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(threadId);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(0);
  });

  it('adds a message to a thread', async () => {
    const { status, body } = await post(
      `/api/chat/threads/${threadId}/messages`,
      {
        role: 'user',
        content: '帮我发布到抖音'
      }
    );
    expect(status).toBe(201);
    expect(body.role).toBe('user');
    expect(body.content).toBe('帮我发布到抖音');
  });

  it('auto-generates title from first user message', async () => {
    const { body } = await get(`/api/chat/threads/${threadId}`);
    expect(body.title).toBe('帮我发布到抖音');
  });

  it('updates thread status', async () => {
    const { status, body } = await patch(`/api/chat/threads/${threadId}`, {
      status: 'archived'
    });
    expect(status).toBe(200);
    expect(body.status).toBe('archived');
  });

  it('returns 404 for non-existent thread', async () => {
    const { status } = await get('/api/chat/threads/nonexistent');
    expect(status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/api/chat/threads`);
    expect(res.status).toBe(401);
  });
});
