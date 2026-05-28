import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { createDatabaseClient, resetDatabase, seedDatabase } from '@ai-growth-ops/database';
import { decryptToken } from '@ai-growth-ops/providers';
import { createApiServer } from '../../../apps/api/src';

let apiServer: Server;
let baseUrl: string;
const db = createDatabaseClient();

// Mock browser-runner server
let mockRunner: Server;
let mockRunnerUrl: string;
let mockSessionState: 'waiting' | 'logged_in' | 'expired' | 'error' = 'waiting';
let mockCookies = '';

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}
async function post(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  mockRunner = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });

    if (req.url === '/session/start' && req.method === 'POST') {
      mockSessionState = 'waiting';
      mockCookies = '';
      res.end(JSON.stringify({ sessionId: 'mock-session-001', status: 'waiting_scan' }));
    } else if (req.url?.startsWith('/session/') && req.url.endsWith('/status')) {
      if (mockSessionState === 'logged_in') {
        res.end(JSON.stringify({ status: 'logged_in', cookies: mockCookies }));
      } else if (mockSessionState === 'expired') {
        res.end(JSON.stringify({ status: 'expired', error: 'Session expired' }));
      } else if (mockSessionState === 'error') {
        res.end(JSON.stringify({ status: 'error', error: 'Browser error' }));
      } else {
        res.end(JSON.stringify({ status: 'waiting_scan' }));
      }
    } else if (req.url?.startsWith('/session/') && req.url.endsWith('/cancel')) {
      mockSessionState = 'expired';
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  await new Promise<void>((resolve) => mockRunner.listen(0, '127.0.0.1', resolve));
  const addr = mockRunner.address() as { address: string; port: number };
  mockRunnerUrl = `http://${addr.address}:${addr.port}`;

  process.env.BROWSER_RUNNER_URL = mockRunnerUrl;

  await resetDatabase(db);
  await seedDatabase(db);
  apiServer = createApiServer({ db }) as Server;
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiAddr = apiServer.address() as { address: string; port: number };
  baseUrl = `http://${apiAddr.address}:${apiAddr.port}`;
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
  zhihu: 'z_c0=zhihu_token_abc; _xsrf=xsr_001',
};

const platforms = Object.keys(platformCookieSamples);

describe('Browser Login Flow — all platforms', () => {
  for (const platform of platforms) {
    describe(`platform: ${platform}`, () => {
      let accountId: string;

      it(`finds seed ${platform} account`, async () => {
        const { body } = await get('/api/accounts');
        const accounts = body as any[];
        const account = accounts.find((a: any) => a.platform === platform);
        expect(account).toBeDefined();
        expect(account.cookieRef).toBeNull();
        accountId = account.id;
      });

      it('starts a browser login session', async () => {
        mockSessionState = 'waiting';
        const { status, body } = await post(`/api/accounts/${accountId}/browser-login/start`);
        expect(status).toBe(200);
        expect(body.status).toBe('waiting_scan');
        expect(body.sessionId).toBe('mock-session-001');
      });

      it('returns waiting_scan while not logged in', async () => {
        const { status, body } = await get(`/api/accounts/${accountId}/browser-login/status`);
        expect(status).toBe(200);
        expect(body.status).toBe('waiting_scan');
      });

      it('stores encrypted cookies on login', async () => {
        mockSessionState = 'logged_in';
        mockCookies = platformCookieSamples[platform];

        const { body } = await get(`/api/accounts/${accountId}/browser-login/status`);
        expect(body.status).toBe('logged_in');

        const account = await db.platformAccount.findFirst({ where: { id: accountId } });
        expect(account!.cookieRef).not.toBeNull();
        expect(account!.authType).toBe('cookie');
        expect(account!.mode).toBe('browser_assist');
        expect(account!.status).toBe('active');

        const decrypted = decryptToken(account!.cookieRef!);
        expect(decrypted).toContain(platformCookieSamples[platform].split('=')[0]);
      });

      it('cancels a login session', async () => {
        mockSessionState = 'waiting';
        await post(`/api/accounts/${accountId}/browser-login/start`);

        const { status, body } = await post(`/api/accounts/${accountId}/browser-login/cancel`);
        expect(status).toBe(200);
        expect(body.ok).toBe(true);
      });
    });
  }
});

describe('Browser Login — error handling', () => {
  it('returns 404 for non-existent account', async () => {
    const { status } = await post('/api/accounts/nonexistent/browser-login/start');
    expect(status).toBe(404);
  });

  it('handles browser-runner being unreachable', async () => {
    process.env.BROWSER_RUNNER_URL = 'http://127.0.0.1:1';
    const { body } = await get('/api/accounts');
    const accounts = body as any[];
    const dy = accounts.find((a: any) => a.platform === 'douyin');
    const { status, body: resBody } = await post(`/api/accounts/${dy.id}/browser-login/start`);
    expect(status).toBe(502);
    expect(resBody.status).toBe('error');
    process.env.BROWSER_RUNNER_URL = mockRunnerUrl;
  });
});
