import type { Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch } from '../../setup/test-auth';

describe('agent run API (integration)', () => {
  const db: DatabaseClient = createDatabaseClient();
  let server: Server;
  let baseUrl: string;
  let api: ReturnType<typeof createAuthFetch>;

  beforeAll(async () => {
    await resetDatabase(db);
    await seedDatabase(db);
    server = createApiServer({ db });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP address');
    }
    baseUrl = `http://${address.address}:${address.port}`;
    const auth = await getTestAuth(db, baseUrl);
    api = createAuthFetch(baseUrl, auth);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.$disconnect();
  });

  it('POST /api/agent/runs creates an AgentRun and returns runId + queued flag', async () => {
    const { status, body } = await api.post('/api/agent/runs', {
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: true
    });
    expect(status).toBe(200);
    expect(body.runId).toBeTruthy();
    // queued is a boolean — true if Redis enqueue succeeded, false if best-effort fallback
    expect(typeof body.queued).toBe('boolean');
  });

  it('GET /api/agent/runs/:id reads back the created run', async () => {
    // First trigger a run
    const create = await api.post('/api/agent/runs', {
      autonomyLevel: 'L2_AUTOPILOT_LIGHT',
      dryRun: false
    });
    expect(create.status).toBe(200);
    const runId = create.body.runId as string;
    expect(runId).toBeTruthy();

    // Then read it back — no worker has run, so status stays 'pending'
    const { status, body } = await api.get(`/api/agent/runs/${runId}`);
    expect(status).toBe(200);
    expect(body.id).toBe(runId);
    expect(typeof body.status).toBe('string');
    expect(body.status).toBe('pending');
  });

  it('GET /api/agent/runs/:id returns 404 for unknown run', async () => {
    const { status } = await api.get('/api/agent/runs/nonexistent-run-id');
    expect(status).toBe(404);
  });

  it('POST /api/agent/runs without auth returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/agent/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autonomyLevel: 'L2_AUTOPILOT_LIGHT' })
    });
    expect(res.status).toBe(401);
  });
});
