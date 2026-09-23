import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPlatformProvider } from '@ai-growth-ops/providers';

/** Respond like fetch with the given status for every call. */
function stubFetch(status: number) {
  const fetchMock = vi.fn(
    async () => new Response('mock', { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider validateCredentials — authExpired contract', () => {
  it('douyin cookie: 302 redirect marks authExpired', async () => {
    stubFetch(302);
    const result = await getPlatformProvider('douyin').validateCredentials({
      authType: 'cookie',
      cookie: 'sessionid=abc'
    });
    expect(result.valid).toBe(false);
    expect(result.authExpired).toBe(true);
  });

  it('douyin cookie: 401 marks authExpired', async () => {
    stubFetch(401);
    const result = await getPlatformProvider('douyin').validateCredentials({
      authType: 'cookie',
      cookie: 'sessionid=abc'
    });
    expect(result.valid).toBe(false);
    expect(result.authExpired).toBe(true);
  });

  it('douyin token: 401 marks authExpired', async () => {
    stubFetch(401);
    const result = await getPlatformProvider('douyin').validateCredentials({
      authType: 'official_api',
      accessToken: 'tok'
    });
    expect(result.authExpired).toBe(true);
  });

  it('douyin: missing credentials marks authExpired without a request', async () => {
    const fetchMock = stubFetch(200);
    const result = await getPlatformProvider('douyin').validateCredentials({
      authType: 'official_api'
    });
    expect(result.authExpired).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('douyin: 200 stays valid without authExpired', async () => {
    stubFetch(200);
    const result = await getPlatformProvider('douyin').validateCredentials({
      authType: 'cookie',
      cookie: 'sessionid=abc'
    });
    expect(result.valid).toBe(true);
    expect(result.authExpired).toBeUndefined();
  });

  it('douyin: server error is NOT auth expiry', async () => {
    stubFetch(500);
    const result = await getPlatformProvider('douyin').validateCredentials({
      authType: 'cookie',
      cookie: 'sessionid=abc'
    });
    expect(result.valid).toBe(false);
    expect(result.authExpired).toBeUndefined();
  });

  it.each(['xiaohongshu', 'baijiahao', 'zhihu', 'wechat_official'] as const)(
    '%s cookie: 302 redirect marks authExpired',
    async (platform) => {
      stubFetch(302);
      const result = await getPlatformProvider(
        platform
      ).validateCredentials({ authType: 'cookie', cookie: 'sid=abc' });
      expect(result.valid).toBe(false);
      expect(result.authExpired).toBe(true);
    }
  );

  it.each(['xiaohongshu', 'baijiahao', 'zhihu'] as const)(
    '%s: missing cookie marks authExpired',
    async (platform) => {
      const fetchMock = stubFetch(200);
      const result = await getPlatformProvider(platform).validateCredentials({
        authType: 'cookie'
      });
      expect(result.authExpired).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('wechat_channels cookie: 401 marks authExpired', async () => {
    stubFetch(401);
    const result = await getPlatformProvider(
      'wechat_channels'
    ).validateCredentials({ authType: 'cookie', cookie: 'finder_username=x' });
    expect(result.authExpired).toBe(true);
  });

  it('wechat_channels: no credentials at all marks authExpired', async () => {
    const fetchMock = stubFetch(200);
    const result = await getPlatformProvider(
      'wechat_channels'
    ).validateCredentials({ authType: 'official_api' });
    expect(result.authExpired).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
