import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabaseClient, resetDatabase, seedDatabase } from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { createAuthFetch, getTestAuth, type TestAuthContext } from '../../setup/test-auth';

describe('LLM settings boundary', () => {
  const db = createDatabaseClient();
  let server: Server;
  let baseUrl: string;
  let auth: TestAuthContext;
  let api: ReturnType<typeof createAuthFetch>;

  beforeAll(async () => {
    await resetDatabase(db);
    await seedDatabase(db);
    server = createApiServer({ db });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    auth = await getTestAuth(db, baseUrl);
    api = createAuthFetch(baseUrl, auth);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  });

  it('rejects member and viewer configuration writes', async () => {
    for (const role of ['member', 'viewer']) {
      await db.organizationMember.updateMany({ where: { userId: auth.userId }, data: { role } });
      const result = await api.put('/api/settings/llm', { provider: 'openai', model: 'unauthorized' });
      expect(result.status).toBe(403);
    }
  });

  it('requires a separate server credential to read decrypted settings', async () => {
    await db.organizationMember.updateMany({ where: { userId: auth.userId }, data: { role: 'owner' } });
    vi.stubEnv('INTERNAL_API_SECRET', 'test-server-only-key');
    expect((await api.get('/api/settings/ai/internal')).status).toBe(403);
  });

  it('shares the org model across legacy/public/server reads without returning secrets publicly', async () => {
    const saved = await api.put('/api/settings/llm', {
      provider: 'openai', apiKey: 'test-llm-secret', model: 'test-model', baseUrl: 'https://example.test/v1'
    });
    expect(saved.status).toBe(200);
    const legacy = await api.get('/api/settings/ai');
    expect(legacy.body.model).toBe('test-model');
    expect(JSON.stringify(legacy.body)).not.toContain('test-llm-secret');
    const res = await fetch(`${baseUrl}/api/settings/ai/internal`, {
      headers: { ...auth.headers, 'x-internal-api-key': 'test-server-only-key' }
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ model: 'test-model', apiKey: 'test-llm-secret' });
  });

  it('preserves the key on an empty update and rejects invalid providers', async () => {
    expect((await api.put('/api/settings/llm', { model: 'updated-model', apiKey: '' })).status).toBe(200);
    expect((await api.get('/api/settings/llm')).body.hasApiKey).toBe(true);
    expect((await api.put('/api/settings/llm', { provider: 'invalid' })).status).toBe(400);
  });
});
