import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import {
  createDatabaseClient,
  resetDatabase,
  seedDatabase
} from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createApiServer } from '../../../apps/api/src';
import { getTestAuth, createAuthFetch, type TestAuthContext } from '../../setup/test-auth';

let apiServer: Server;
let baseUrl: string;
const db = createDatabaseClient();

// Auth state
let auth: TestAuthContext;
let api: ReturnType<typeof createAuthFetch>;

// Mock browser-runner server
let mockRunner: Server;
let mockRunnerUrl: string;
let mockSessionState: 'waiting' | 'logged_in' | 'expired' | 'error' = 'waiting';
let mockCookies = '';

beforeAll(async () => {
  // 1. Start mock browser-runner
  mockRunner = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });

    if (req.url === '/session/start' && req.method === 'POST') {
      mockSessionState = 'waiting';
      mockCookies = '';
      res.end(
        JSON.stringify({
          sessionId: 'mock-session-001',
          status: 'waiting_scan'
        })
      );
    } else if (
      req.url?.startsWith('/session/') &&
      req.url.endsWith('/status')
    ) {
      if (mockSessionState === 'logged_in') {
        res.end(JSON.stringify({ status: 'logged_in', cookies: mockCookies }));
      } else if (mockSessionState === 'expired') {
        res.end(
          JSON.stringify({ status: 'expired', error: 'Session expired' })
        );
      } else if (mockSessionState === 'error') {
        res.end(JSON.stringify({ status: 'error', error: 'Browser error' }));
      } else {
        res.end(JSON.stringify({ status: 'waiting_scan' }));
      }
    } else if (
      req.url?.startsWith('/session/') &&
      req.url.endsWith('/cancel')
    ) {
      mockSessionState = 'expired';
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  await new Promise<void>((resolve) =>
    mockRunner.listen(0, '127.0.0.1', resolve)
  );
  const addr = mockRunner.address() as { address: string; port: number };
  mockRunnerUrl = `http://${addr.address}:${addr.port}`;

  process.env.BROWSER_RUNNER_URL = mockRunnerUrl;

  // 2. Reset DB & seed admin user (seed creates a default org + membership)
  await resetDatabase(db);
  await seedDatabase(db);

  const admin = await db.user.findFirstOrThrow({
    where: { email: 'admin@ai-growth-ops.local' }
  });

  // 3. Start API server
  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) =>
    apiServer.listen(0, '127.0.0.1', resolve)
  );
  const apiAddr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${apiAddr.address}:${apiAddr.port}`;

  // 4. Get authenticated context (resolves the seeded default org)
  auth = await getTestAuth(db, baseUrl);
  api = createAuthFetch(baseUrl, auth);

  // 5. Create platform accounts in the seeded org (one per platform)
  const platforms = [
    'douyin',
    'xiaohongshu',
    'wechat_official',
    'wechat_channels',
    'baijiahao',
    'zhihu'
  ];
  for (const platform of platforms) {
    await db.platformAccount.create({
      data: {
        organizationId: auth.orgId,
        userId: admin.id,
        platform: platform as 'douyin',
        name: `${platform}-test-account`,
        mode: 'browser_assist',
        status: 'active',
        cookieRef: null
      }
    });
  }
});

afterAll(async () => {
  await new Promise<void>((r) => apiServer.close(() => r()));
  await new Promise<void>((r) => mockRunner.close(() => r()));
  await db.$disconnect();
});

// ── Generic login flow test — runs for every platform ───────────

const platformCookieSamples: Record<string, string> = {
  douyin: 'sessionid=dy_sid_123; sid_tt=tt_456; csrf_session_id=csrf_xyz',
  xiaohongshu: 'web_session=xhs_sess_abc; webId=xhs_001',
  wechat_official: 'slave_sid=wx_off_sid; bizuin=123456',
  wechat_channels: 'finder_username=wx_ch_001; userName=test_channel',
  baijiahao: 'BDUSS=bjh_bduss_xyz; STOKEN=bjh_stk_001',
  zhihu: 'z_c0=zhihu_token_abc; _xsrf=xsr_001'
};

const platforms = Object.keys(platformCookieSamples);

describe('Browser Login Flow — all platforms', () => {
  for (const platform of platforms) {
    describe(`platform: ${platform}`, () => {
      let accountId: string;

      it(`finds seed ${platform} account`, async () => {
        const { body } = await api.get('/api/accounts');
        const accounts = body as Record<string, unknown>[];
        const account = accounts.find(
          (a: Record<string, unknown>) => a.platform === platform
        ) as Record<string, unknown>;
        expect(account).toBeDefined();
        expect(account.cookieRef).toBeNull();
        accountId = account.id;
      });

      it('starts a browser login session', async () => {
        mockSessionState = 'waiting';
        const { status, body } = await api.post(
          `/api/accounts/${accountId}/browser-login/start`
        );
        expect(status).toBe(200);
        expect(body.status).toBe('waiting_scan');
        expect(body.sessionId).toBe('mock-session-001');
      });

      it('returns waiting_scan while not logged in', async () => {
        const { status, body } = await api.get(
          `/api/accounts/${accountId}/browser-login/status`
        );
        expect(status).toBe(200);
        expect(body.status).toBe('waiting_scan');
      });

      it('stores encrypted cookies on login', async () => {
        mockSessionState = 'logged_in';
        mockCookies = platformCookieSamples[platform];

        const { body } = await api.get(
          `/api/accounts/${accountId}/browser-login/status`
        );
        expect(body.status).toBe('logged_in');
        // Bug 2 fix: response should NOT contain plaintext cookies
        expect(body.cookies).toBeUndefined();

        const account = await db.platformAccount.findFirst({
          where: { id: accountId }
        });
        expect(account!.cookieRef).not.toBeNull();
        expect(account!.authType).toBe('cookie');
        expect(account!.mode).toBe('browser_assist');
        expect(account!.status).toBe('active');

        const decrypted = decryptToken(account!.cookieRef!);
        expect(decrypted).toContain(
          platformCookieSamples[platform].split('=')[0]
        );
      });

      it('cancels a login session', async () => {
        mockSessionState = 'waiting';
        await api.post(`/api/accounts/${accountId}/browser-login/start`);

        const { status, body } = await api.post(
          `/api/accounts/${accountId}/browser-login/cancel`
        );
        expect(status).toBe(200);
        expect(body.ok).toBe(true);
      });
    });
  }
});

describe('Browser Login — error handling', () => {
  it('returns 404 for non-existent account', async () => {
    const { status } = await api.post(
      '/api/accounts/nonexistent/browser-login/start'
    );
    expect(status).toBe(404);
  });

  it('handles browser-runner being unreachable', async () => {
    process.env.BROWSER_RUNNER_URL = 'http://127.0.0.1:1';
    const { body } = await api.get('/api/accounts');
    const accounts = body as Record<string, unknown>[];
    const dy = accounts.find(
      (a: Record<string, unknown>) => a.platform === 'douyin'
    ) as Record<string, unknown>;
    const { status, body: resBody } = await api.post(
      `/api/accounts/${dy.id}/browser-login/start`
    );
    expect(status).toBe(502);
    expect(resBody.status).toBe('error');
    expect(resBody.error).toContain('浏览器辅助服务不可用');
    process.env.BROWSER_RUNNER_URL = mockRunnerUrl;
  });
});

// ── 重点测试：本次修复的关键场景 ──────────────────────────────────

describe('Browser Login — concurrent start protection', () => {
  it('rejects duplicate start requests for the same account with 409', async () => {
    const { body } = await api.get('/api/accounts');
    const accounts = body as Record<string, unknown>[];
    const dy = accounts.find(
      (a: Record<string, unknown>) => a.platform === 'douyin'
    ) as Record<string, unknown>;

    // Temporarily override browser-runner URL to a slow mock
    const slowMock = createServer(async (req, res) => {
      if (req.url === '/session/start' && req.method === 'POST') {
        // Simulate slow browser launch — hold the connection open
        await new Promise((r) => setTimeout(r, 500));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            sessionId: 'slow-mock-session',
            status: 'waiting_scan'
          })
        );
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'waiting_scan' }));
      }
    });
    await new Promise<void>((resolve) =>
      slowMock.listen(0, '127.0.0.1', resolve)
    );
    const slowAddr = slowMock.address() as { address: string; port: number };
    process.env.BROWSER_RUNNER_URL = `http://${slowAddr.address}:${slowAddr.port}`;

    // Fire two concurrent start requests
    const [res1, res2] = await Promise.all([
      api.post(`/api/accounts/${dy.id}/browser-login/start`),
      api.post(`/api/accounts/${dy.id}/browser-login/start`)
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One should succeed (200), the other should be rejected (409)
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // The 409 response should have a clear error message
    const rejected = res1.status === 409 ? res1 : res2;
    expect(rejected.body.status).toBe('error');
    expect(rejected.body.error).toContain('正在创建中');

    // Cleanup
    process.env.BROWSER_RUNNER_URL = mockRunnerUrl;
    await new Promise<void>((r) => slowMock.close(() => r()));
  });

  it('allows start after previous session completes', async () => {
    const { body } = await api.get('/api/accounts');
    const accounts = body as Record<string, unknown>[];
    const xhs = accounts.find(
      (a: Record<string, unknown>) => a.platform === 'xiaohongshu'
    ) as Record<string, unknown>;

    // First start — should succeed
    const res1 = await api.post(`/api/accounts/${xhs.id}/browser-login/start`);
    expect(res1.status).toBe(200);

    // Cancel the session
    const cancelRes = await api.post(
      `/api/accounts/${xhs.id}/browser-login/cancel`
    );
    expect(cancelRes.status).toBe(200);

    // Second start after cancel — should also succeed
    const res2 = await api.post(`/api/accounts/${xhs.id}/browser-login/start`);
    expect(res2.status).toBe(200);
  });
});

describe('Browser Login — timeout and error detail', () => {
  it('error message contains runner URL and non-empty detail', async () => {
    process.env.BROWSER_RUNNER_URL = 'http://127.0.0.1:1';
    const { body } = await api.get('/api/accounts');
    const accounts = body as Record<string, unknown>[];
    const dy = accounts.find(
      (a: Record<string, unknown>) => a.platform === 'douyin'
    ) as Record<string, unknown>;

    const { body: resBody } = await api.post(
      `/api/accounts/${dy.id}/browser-login/start`
    );

    // Error should include the URL being connected to
    expect(resBody.error).toContain('http://127.0.0.1:1');
    // Error should NOT end with empty parentheses like "— )"
    expect(resBody.error).not.toMatch(/— \)$/);
    // Error should have actual detail text after "—"
    const afterDash = resBody.error.split('—').pop();
    expect(afterDash?.trim().length).toBeGreaterThan(0);

    process.env.BROWSER_RUNNER_URL = mockRunnerUrl;
  });

  it('status endpoint returns 200 with error for missing session', async () => {
    const { body } = await api.get('/api/accounts');
    const accounts = body as Record<string, unknown>[];
    const bh = accounts.find(
      (a: Record<string, unknown>) => a.platform === 'baijiahao'
    ) as Record<string, unknown>;

    // Poll status without starting a session — should return error gracefully
    const { status, body: resBody } = await api.get(
      `/api/accounts/${bh.id}/browser-login/status`
    );
    expect(status).toBe(200);
    expect(resBody.status).toBe('error');
  });
});
