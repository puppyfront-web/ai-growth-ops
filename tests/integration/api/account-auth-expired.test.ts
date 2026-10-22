import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { decryptToken, encryptToken } from '@ai-growth-ops/providers';
import { createApiServer } from '../../../apps/api/src';
import {
  createAuthFetch,
  getTestAuth,
  type TestAuthContext
} from '../../setup/test-auth';

let apiServer: Server;
let baseUrl: string;
const db: DatabaseClient = createDatabaseClient();
let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;
let accountId: string;

afterEach(() => vi.unstubAllGlobals());

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
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  const account = await db.platformAccount.create({
    data: {
      organizationId: auth.orgId,
      userId: admin.id,
      platform: 'douyin',
      name: 'auth-expired-flow-account',
      mode: 'browser_assist',
      status: 'active',
      authType: 'cookie',
      cookieRef: encryptToken('sessionid=stale_cookie; sid_tt=stale')
    }
  });
  accountId = account.id;
});

afterAll(async () => {
  delete process.env.BROWSER_BRIDGE_API_URL;
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await db.$disconnect();
});

describe('平台登录失效 → 本地浏览器重新授权', () => {
  function stubPlatformFetch(status: number) {
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (/douyin\.com|xiaohongshu\.com|weixin\.qq\.com|zhihu\.com|baidu\.com/.test(url)) {
          return new Response('platform-stub', { status });
        }
        return realFetch(input, init);
      })
    );
  }

  it('检测到平台 302 重定向后将账号置为 expired', async () => {
    stubPlatformFetch(302);
    const { body } = await api.post(`/api/accounts/${accountId}/validate`, {});
    expect(body).toMatchObject({ valid: false, authExpired: true });
    expect(
      (await db.platformAccount.findUniqueOrThrow({ where: { id: accountId } }))
        .status
    ).toBe('expired');
  });

  it('本地 Bridge 重新授权后恢复 active 并更新 cookie', async () => {
    vi.unstubAllGlobals();
    const start = await api.post(
      `/api/accounts/${accountId}/browser-login/start`
    );
    await fetch(
      `${baseUrl}/api/browser-bridge/sessions/${start.body.sessionId}`,
      { headers: { authorization: `Bearer ${start.body.bridgeToken}` } }
    );
    const response = await fetch(
      `${baseUrl}/api/browser-bridge/sessions/${start.body.sessionId}/complete`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${start.body.bridgeToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          cookies: 'sessionid=fresh_cookie; sid_guard=fresh'
        })
      }
    );
    expect(response.status).toBe(200);

    const status = await api.get(
      `/api/accounts/${accountId}/browser-login/status`
    );
    expect(status.body.status).toBe('logged_in');
    expect(status.body.cookies).toBeUndefined();

    const account = await db.platformAccount.findUniqueOrThrow({
      where: { id: accountId }
    });
    expect(account.status).toBe('active');
    expect(account.authType).toBe('cookie');
    expect(decryptToken(account.cookieRef!)).toContain('sessionid=fresh_cookie');
  });

  it('验证通过时保持 active 且无 authExpired', async () => {
    stubPlatformFetch(200);
    const { body } = await api.post(`/api/accounts/${accountId}/validate`, {});
    expect(body.valid).toBe(true);
    expect(body.authExpired).toBeUndefined();
    expect(
      (await db.platformAccount.findUniqueOrThrow({ where: { id: accountId } }))
        .status
    ).toBe('active');
  });
});
