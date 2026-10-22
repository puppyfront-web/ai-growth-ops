import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBrowserBridge } from '../../../apps/browser-bridge/src/runner';

const { execFileMock, chromiumMock, mkdirMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  chromiumMock: { launchPersistentContext: vi.fn() },
  mkdirMock: vi.fn()
}));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('node:fs/promises', () => ({ mkdir: mkdirMock }));
vi.mock('playwright-core', () => ({ chromium: chromiumMock }));

const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')
  ?.value;
const ORIGINAL_NOTIFY = process.env.BROWSER_ASSISTANT_NOTIFY;

function notificationScripts(): string[] {
  return execFileMock.mock.calls
    .filter((entry) => entry[0] === '/usr/bin/osascript')
    .map((entry) => String(entry[1]?.[1] ?? ''));
}

function allNotifications(): string {
  return notificationScripts().join('\n');
}

function douyinSessionJson(): string {
  return JSON.stringify({
    sessionId: 'session-1',
    platformAccountId: 'account-1',
    platform: 'douyin',
    status: 'waiting_user',
    loginUrl: 'https://creator.douyin.com/',
    allowedOrigins: ['https://douyin.com'],
    cookieDomains: ['douyin.com'],
    requiredCookieNames: ['sessionid'],
    cookieNames: ['sessionid'],
    profileRef: 'douyin/account-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  process.env.BROWSER_ASSISTANT_NOTIFY = '1';
  execFileMock.mockReset();
  mkdirMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_PLATFORM === undefined) {
    delete (process as { platform?: string }).platform;
  } else {
    Object.defineProperty(process, 'platform', {
      value: ORIGINAL_PLATFORM
    });
  }
  if (ORIGINAL_NOTIFY === undefined) {
    delete process.env.BROWSER_ASSISTANT_NOTIFY;
  } else {
    process.env.BROWSER_ASSISTANT_NOTIFY = ORIGINAL_NOTIFY;
  }
  vi.unstubAllGlobals();
});

describe('browser bridge runner notifications', () => {
  it('claim 网络失败时发出 failed 系统通知而不是静默退出', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('fetch failed')))
    );

    await expect(
      runBrowserBridge({
        apiUrl: 'https://ops.example.com',
        sessionId: 'session-1',
        token: 'secret-token'
      })
    ).rejects.toThrow('fetch failed');

    const notifications = allNotifications();
    expect(notifications).toContain('授权失败');
    expect(notifications).not.toContain('secret-token');
  });

  it('会话不存在（BRIDGE_SESSION_CLOSED）时同样发出 failed 通知', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 'BRIDGE_SESSION_CLOSED' }), {
          status: 409
        })
      )
    );

    await expect(
      runBrowserBridge({
        apiUrl: 'https://ops.example.com',
        sessionId: 'session-1',
        token: 'secret-token'
      })
    ).rejects.toThrow('BRIDGE_SESSION_CLOSED');

    expect(allNotifications()).toContain('授权失败');
  });

  it('Chrome 启动失败时发出 failed 通知并回传错误码', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/error')) {
        return new Response(JSON.stringify({ status: 'error' }), { status: 200 });
      }
      return new Response(douyinSessionJson(), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    chromiumMock.launchPersistentContext.mockRejectedValueOnce(
      new Error('Executable doesn\'t exist at /chrome')
    );

    await expect(
      runBrowserBridge({
        apiUrl: 'https://ops.example.com',
        sessionId: 'session-1',
        token: 'secret-token'
      })
    ).rejects.toThrow("Executable doesn't exist");

    expect(allNotifications()).toContain('授权失败');
    const errorCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).endsWith('/error')
    );
    expect(errorCall?.[1]?.body).toContain('BROWSER_NOT_FOUND');
  });

  it('采集到登录 Cookie 后回传凭据并发出 completed 通知', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/complete')) {
        return new Response(JSON.stringify({ status: 'logged_in' }), {
          status: 200
        });
      }
      return new Response(douyinSessionJson(), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const context = {
      pages: () => [
        {
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue(undefined),
          isClosed: () => false
        }
      ],
      cookies: vi.fn().mockResolvedValue([
        { name: 'sessionid', value: 'sid-1', domain: '.douyin.com', path: '/' }
      ]),
      close: vi.fn().mockResolvedValue(undefined)
    };
    chromiumMock.launchPersistentContext.mockResolvedValueOnce(context);

    await runBrowserBridge({
      apiUrl: 'https://ops.example.com',
      sessionId: 'session-1',
      token: 'secret-token'
    });

    expect(allNotifications()).toContain('授权完成');
    const completeCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).endsWith('/complete')
    );
    expect(String(completeCall?.[1]?.body)).toContain('sessionid=sid-1');
    expect(context.close).toHaveBeenCalled();
  });
});
