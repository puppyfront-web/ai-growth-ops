import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch, type TestAuthContext } from '../../setup/test-auth';

const db = createDatabaseClient();

let apiServer: Server;
let baseUrl: string;
let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;

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

  // Start API server on random port
  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    apiServer.listen(0, '127.0.0.1', resolve)
  );
  const addr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${addr.address}:${addr.port}`;

  // Get authenticated context
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await db.$disconnect();
});

describe('Chat Thread CRUD', () => {
  let threadId: string;

  it('creates a thread', async () => {
    const { status, body } = await api.post('/api/chat/threads', {});
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('active');
    expect(body.title).toBeNull();
    threadId = body.id;
  });

  it('creates a thread with title', async () => {
    const { status, body } = await api.post('/api/chat/threads', {
      title: '测试标题'
    });
    expect(status).toBe(201);
    expect(body.title).toBe('测试标题');
  });

  it('lists threads', async () => {
    const { status, body } = await api.get('/api/chat/threads');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('gets a thread with messages', async () => {
    const { status, body } = await api.get(`/api/chat/threads/${threadId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(threadId);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(0);
  });

  it('adds a message to a thread', async () => {
    const { status, body } = await api.post(
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
    const { body } = await api.get(`/api/chat/threads/${threadId}`);
    expect(body.title).toBe('帮我发布到抖音');
  });

  it('updates thread status', async () => {
    // createAuthFetch doesn't provide patch — use fetch directly with auth headers
    const res = await fetch(`${baseUrl}/api/chat/threads/${threadId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...auth.headers
      },
      body: JSON.stringify({ status: 'archived' })
    });
    const respBody = await res.json();
    expect(res.status).toBe(200);
    expect(respBody.status).toBe('archived');
  });

  it('returns 404 for non-existent thread', async () => {
    const { status } = await api.get('/api/chat/threads/nonexistent');
    expect(status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/api/chat/threads`);
    expect(res.status).toBe(401);
  });
});
