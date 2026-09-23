import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase,
  type DatabaseClient
} from '@ai-growth-ops/database';
import { decryptToken, encryptToken } from '@ai-growth-ops/providers';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch, type TestAuthContext } from '../../setup/test-auth';

let apiServer: Server;
let baseUrl: string;
const db: DatabaseClient = createDatabaseClient();

let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;
let accountId: string;

// Mock browser-runner for the re-login leg
let mockRunner: Server;
let mockRunnerUrl: string;
let mockSessionState: 'waiting' | 'logged_in' = 'waiting';
let mockCookies = '';

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  mockRunner = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/session/start' && req.method === 'POST') {
      mockSessionState = 'waiting';
      res.end(
        JSON.stringify({ sessionId: 'relogin-session-1', status: 'waiting_scan' })
      );
    } else if (req.url?.startsWith('/session/') && req.url.endsWith('/status')) {
      if (mockSessionState === 'logged_in') {
        res.end(JSON.stringify({ status: 'logged_in', cookies: mockCookies }));
      } else {
        res.end(JSON.stringify({ status: 'waiting_scan' }));
      }
    } else if (req.url?.startsWith('/session/') && req.url.endsWith('/cancel')) {
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  await new Promise<void>((resolve) => mockRunner.listen(0, '127.0.0.1', resolve));
  const addr = mockRunner.address() as { address: string; port: number };
  mockRunnerUrl = `http://${addr.address}:${addr.port}`;

  await resetDatabase(db);
  await seedDatabase(db);
  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });

  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiAddr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${apiAddr.address}:${apiAddr.port}`;

  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  // 抖音账号，已保存一份（即将失效的）加密 cookie
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
  await new Promise<void>((r) => apiServer.close(() => r()));
  await new Promise<void>((r) => mockRunner.close(() => r()));
  await db.$disconnect();
});

describe('平台登录失效 → 引导重新授权的标准流程', () => {
  /** 只劫持对平台域名的请求，API/runner 调用透传真实 fetch */
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

  it('检测到平台 302 重定向：账号置为 expired，响应带 authExpired', async () => {
    stubPlatformFetch(302);

    const { status, body } = await api.post(
      `/api/accounts/${accountId}/validate`,
      {}
    );
    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.authExpired).toBe(true);

    const account = await db.platformAccount.findUniqueOrThrow({
      where: { id: accountId }
    });
    expect(account.status).toBe('expired');
  });

  it('重新扫码登录成功后：账号恢复 active，cookie 被更新', async () => {
    // 让 API 的 runner 调用走 mock（不能再用 fetch stub）
    vi.unstubAllGlobals();
    process.env.BROWSER_RUNNER_URL = mockRunnerUrl;

    await api.post(`/api/accounts/${accountId}/browser-login/start`);

    mockSessionState = 'logged_in';
    mockCookies = 'sessionid=fresh_cookie; sid_guard=fresh';

    const { body } = await api.get(
      `/api/accounts/${accountId}/browser-login/status`
    );
    expect(body.status).toBe('logged_in');
    expect(body.cookies).toBeUndefined();

    const account = await db.platformAccount.findUniqueOrThrow({
      where: { id: accountId }
    });
    expect(account.status).toBe('active');
    expect(account.authType).toBe('cookie');
    const decrypted = decryptToken(account.cookieRef!);
    expect(decrypted).toContain('sessionid=fresh_cookie');
  });

  it('验证通过（平台返回 200）：保持 active 且无 authExpired', async () => {
    stubPlatformFetch(200);

    const { body } = await api.post(`/api/accounts/${accountId}/validate`, {});
    expect(body.valid).toBe(true);
    expect(body.authExpired).toBeUndefined();

    const account = await db.platformAccount.findUniqueOrThrow({
      where: { id: accountId }
    });
    expect(account.status).toBe('active');
  });
});
