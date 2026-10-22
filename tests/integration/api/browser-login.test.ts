import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createApiServer } from '../../../apps/api/src';
import {
  createAuthFetch,
  getTestAuth,
  type TestAuthContext
} from '../../setup/test-auth';

const db = createDatabaseClient();
let apiServer: Server;
let baseUrl: string;
let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;
let accountId: string;

async function bridgeRequest(
  path: string,
  token: string,
  init: RequestInit = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await resetDatabase(db);
  await seedDatabase(db);
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });

  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    apiServer.listen(0, '127.0.0.1', resolve)
  );
  const address = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${address.address}:${address.port}`;
  process.env.BROWSER_BRIDGE_API_URL = baseUrl;
  process.env.BROWSER_ASSISTANT_DOWNLOAD_URL =
    'https://downloads.example.com/browser-assistant';
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  const account = await db.platformAccount.create({
    data: {
      organizationId: auth.orgId,
      userId: admin.id,
      platform: 'douyin',
      name: 'local-bridge-account',
      mode: 'browser_assist',
      status: 'active'
    }
  });
  accountId = account.id;
});

afterAll(async () => {
  delete process.env.BROWSER_BRIDGE_API_URL;
  delete process.env.BROWSER_ASSISTANT_DOWNLOAD_URL;
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await db.$disconnect();
});

describe('local browser bridge authorization', () => {
  it('starts immediately without browser-runner and reuses a fresh session', async () => {
    process.env.BROWSER_RUNNER_URL = 'http://127.0.0.1:1';
    const startedAt = Date.now();
    const first = await api.post(
      `/api/accounts/${accountId}/browser-login/start`
    );

    expect(first.status).toBe(202);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(first.body.status).toBe('waiting_local_bridge');
    expect(first.body.bridgeToken).toBeUndefined();
    expect(first.body.launchCommand).toBeUndefined();
    expect(first.body.launchUrl).toMatch(/^aigrowthops:\/\/authorize\?/);
    expect(first.body.installerUrl).toBe(
      'https://downloads.example.com/browser-assistant'
    );
    expect(first.body.launchUrl).not.toContain('browser-runner');

    const launchUrl = new URL(first.body.launchUrl);
    expect(launchUrl.searchParams.get('api')).toBe(baseUrl);
    expect(launchUrl.searchParams.get('session')).toBe(first.body.sessionId);
    expect(launchUrl.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{32,}$/);

    const second = await api.post(
      `/api/accounts/${accountId}/browser-login/start`
    );
    expect(second.status).toBe(202);
    expect(second.body.sessionId).toBe(first.body.sessionId);
    expect(second.body.launchUrl).toBe(first.body.launchUrl);
  });

  it('rejects missing and invalid bridge tokens', async () => {
    const start = await api.post(
      `/api/accounts/${accountId}/browser-login/start`
    );
    const path = `/api/browser-bridge/sessions/${start.body.sessionId}`;
    const missing = await fetch(`${baseUrl}${path}`);
    expect(missing.status).toBe(401);

    const invalid = await bridgeRequest(path, 'invalid-token');
    expect(invalid.status).toBe(401);
  });

  it('claims, validates, encrypts and consumes an authorization session', async () => {
    const start = await api.post(
      `/api/accounts/${accountId}/browser-login/start`
    );
    const path = `/api/browser-bridge/sessions/${start.body.sessionId}`;
    const token = new URL(start.body.launchUrl).searchParams.get('token')!;
    const claim = await bridgeRequest(path, token);

    expect(claim.status).toBe(200);
    expect(claim.body.status).toBe('waiting_user');
    expect(claim.body.platform).toBe('douyin');
    expect(claim.body.loginUrl).toBe('https://creator.douyin.com/');
    expect(claim.body.requiredCookieNames).toContain('sessionid');

    const missingCookie = await bridgeRequest(
      `${path}/complete`,
      token,
      { method: 'POST', body: JSON.stringify({ cookies: 'ttwid=visitor' }) }
    );
    expect(missingCookie.status).toBe(400);
    expect(missingCookie.body.code).toBe('REQUIRED_COOKIE_MISSING');

    const complete = await bridgeRequest(
      `${path}/complete`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          cookies: 'sessionid=fresh; sid_tt=secondary; unrelated=secret'
        })
      }
    );
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('logged_in');
    expect(JSON.stringify(complete.body)).not.toContain('fresh');

    const status = await api.get(
      `/api/accounts/${accountId}/browser-login/status`
    );
    expect(status.body).toMatchObject({ status: 'logged_in' });
    expect(status.body.bridgeToken).toBeUndefined();

    const account = await db.platformAccount.findUniqueOrThrow({
      where: { id: accountId }
    });
    expect(decryptToken(account.cookieRef!)).toBe(
      'sessionid=fresh; sid_tt=secondary'
    );
    expect(account.status).toBe('active');

    const consumed = await bridgeRequest(path, token);
    expect(consumed.status).toBe(401);
  });

  it('cancels a session and rejects its token', async () => {
    const start = await api.post(
      `/api/accounts/${accountId}/browser-login/start`
    );
    const cancelled = await api.post(
      `/api/accounts/${accountId}/browser-login/cancel`
    );
    expect(cancelled).toMatchObject({ status: 200, body: { ok: true } });

    const claim = await bridgeRequest(
      `/api/browser-bridge/sessions/${start.body.sessionId}`,
      new URL(start.body.launchUrl).searchParams.get('token')!
    );
    expect(claim.status).toBe(401);
  });

  it('does not expose another organization account', async () => {
    const foreignOrg = await db.organization.create({
      data: { name: 'Foreign', slug: `foreign-${Date.now()}` }
    });
    const foreign = await db.platformAccount.create({
      data: {
        organizationId: foreignOrg.id,
        userId: auth.userId,
        platform: 'douyin',
        name: 'foreign-account',
        mode: 'browser_assist',
        status: 'active'
      }
    });

    expect(
      (await api.post(`/api/accounts/${foreign.id}/browser-login/start`)).status
    ).toBe(404);
    expect(
      (await api.get(`/api/accounts/${foreign.id}/browser-login/status`)).status
    ).toBe(404);
    expect(
      (await api.post(`/api/accounts/${foreign.id}/browser-login/cancel`)).status
    ).toBe(404);
  });

  it('requires settings permission to start authorization', async () => {
    const membership = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: auth.orgId, userId: auth.userId }
    });
    await db.organizationMember.update({
      where: { id: membership.id },
      data: { role: 'viewer' }
    });
    try {
      expect(
        (await api.post(`/api/accounts/${accountId}/browser-login/start`)).status
      ).toBe(403);
    } finally {
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { role: membership.role }
      });
    }
  });
});
