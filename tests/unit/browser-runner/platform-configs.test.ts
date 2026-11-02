import { describe, expect, it } from 'vitest';
import {
  cookieHeaderHasNamedCookie,
  DOUYIN_AUTH_COOKIE_NAMES,
  getPlatformLoginConfig,
  getSupportedPlatforms,
  hasCookieNamed,
  snapshotCookieKeys,
  type DetectionRule
} from '../../../apps/browser-runner/src/platform-configs';
import {
  PLATFORM_LOGIN_ADAPTERS
} from '../../../packages/shared/src/platform-login';

describe('snapshotCookieKeys', () => {
  it('keys cookies by domain and name', () => {
    const keys = snapshotCookieKeys([
      { domain: '.douyin.com', name: 'sessionid' },
      { domain: '.douyin.com', name: '_ga' }
    ]);
    expect(keys.has('.douyin.com|sessionid')).toBe(true);
    expect(keys.has('.douyin.com|_ga')).toBe(true);
    expect(keys.size).toBe(2);
  });
});

describe('hasCookieNamed', () => {
  it('matches case-insensitively', () => {
    const cookies = [{ name: 'sessionid' }, { name: 'TTWID' }];
    expect(hasCookieNamed(cookies, 'SessionID')).toBe(true);
    expect(hasCookieNamed(cookies, 'sid_tt')).toBe(false);
  });
});

describe('cookieHeaderHasNamedCookie', () => {
  it('detects sessionid in cookie header', () => {
    const header = 'ttwid=abc; sessionid=deadbeef; sid_tt=deadbeef';
    expect(cookieHeaderHasNamedCookie(header, 'sessionid')).toBe(true);
    expect(cookieHeaderHasNamedCookie(header, 'sid_tt')).toBe(true);
    expect(cookieHeaderHasNamedCookie(header, 'missing')).toBe(false);
  });

  it('does not false-positive on prefix names', () => {
    const header = 'not_sessionid=1; sessionid=abc';
    expect(cookieHeaderHasNamedCookie(header, 'sessionid')).toBe(true);
    expect(cookieHeaderHasNamedCookie('not_sessionid=1', 'sessionid')).toBe(
      false
    );
  });
});

describe('douyin login config', () => {
  it('uses auth-only baseline cookie names', () => {
    expect(DOUYIN_AUTH_COOKIE_NAMES).toEqual([
      'sessionid',
      'sid_tt',
      'sid_guard',
      'sessionid_ss'
    ]);
    expect(DOUYIN_AUTH_COOKIE_NAMES).not.toContain('ttwid');
    expect(DOUYIN_AUTH_COOKIE_NAMES).not.toContain('odin_tt');
    expect(DOUYIN_AUTH_COOKIE_NAMES).not.toContain('passport_csrf_token');
  });

  it('registers custom douyin detector with auth baseline', () => {
    const config = getPlatformLoginConfig('douyin');
    expect(config.loginUrl).toBe('https://creator.douyin.com/');
    expect(config.loginMode).toBe('qr');
    expect(config.baselineAuthCookieNames).toEqual([
      ...DOUYIN_AUTH_COOKIE_NAMES
    ]);
  });
});

describe('DetectionRule shape', () => {
  it('supports combined cookie and url rules', () => {
    const rule: DetectionRule = {
      cookieNames: ['sessionid'],
      urlIncludes: ['/creator/']
    };
    expect(rule.cookieNames).toContain('sessionid');
    expect(rule.urlIncludes).toContain('/creator/');
  });
});

// ── 检测器强化（spec/29：匿名 cookie 不得误判登录） ─────────────────

import type { Page } from 'playwright';

/** 2026-10-23 实测：未登录打开 creator.xiaohongshu.com/login 即下发的匿名 cookie。 */
const XHS_ANONYMOUS_COOKIES = [
  { name: 'acw_tc', value: 'acw_tc_value' },
  { name: 'webBuild', value: '1234567' },
  { name: 'xsecappid', value: 'xhs-pc-web' },
  { name: 'loadts', value: '1760000000000' },
  { name: 'a1', value: '1900000000000abcdef' },
  { name: 'webId', value: 'webid-value' },
  { name: 'websectiga', value: 'sectiga-value' },
  { name: 'sec_poison_id', value: 'spid-value' },
  { name: 'gid', value: 'gid-value' },
  { name: 'ets', value: 'ets-value' }
];

function fakePage({
  cookies,
  urls
}: {
  cookies: { name: string; value: string }[];
  urls?: string[];
}): Page {
  const cookieList = cookies.map((c) => ({ ...c, domain: '.xiaohongshu.com' }));
  const docCookie = cookieList.map((c) => `${c.name}=${c.value}`).join('; ');
  const urlList = urls ?? ['https://creator.xiaohongshu.com/login'];
  const page = {
    url: () => urlList[0],
    evaluate: async () => docCookie,
    context: () => ({
      cookies: async () => cookieList,
      storageState: async () => ({ cookies: cookieList }),
      pages: () =>
        urlList.map((u) => ({ url: () => u, evaluate: async () => docCookie }))
    })
  };
  return page as unknown as Page;
}

describe('xiaohongshu 登录检测（spec/29 误判修复）', () => {
  const config = getPlatformLoginConfig('xiaohongshu');

  it('仅有匿名 cookie（含 xsecappid）时不判登录', async () => {
    const page = fakePage({ cookies: XHS_ANONYMOUS_COOKIES });
    const result = await config.detectLogin(page);
    expect(result.loggedIn).toBe(false);
  });

  it('出现 web_session 时判登录且带回完整 cookie', async () => {
    const page = fakePage({
      cookies: [
        ...XHS_ANONYMOUS_COOKIES,
        { name: 'web_session', value: '040069b2f9d5a8c9208ce6f9e6a1b2c3' }
      ]
    });
    const result = await config.detectLogin(page);
    expect(result.loggedIn).toBe(true);
    expect(result.cookies).toContain('web_session=');
    expect(result.cookies).toContain('a1=');
  });

  it('仅命中登录后 URL 但缺 web_session 时不判登录（finalize 强校验）', async () => {
    const page = fakePage({
      cookies: XHS_ANONYMOUS_COOKIES,
      urls: ['https://creator.xiaohongshu.com/creator/home']
    });
    const result = await config.detectLogin(page);
    expect(result.loggedIn).toBe(false);
  });
});

describe('与 shared 登录适配器注册表同步', () => {
  it('六平台 loginUrl / 检测规则 / 必备 cookie 均派生自注册表', () => {
    for (const adapter of Object.values(PLATFORM_LOGIN_ADAPTERS)) {
      const config = getPlatformLoginConfig(adapter.platform);
      expect(config.loginUrl).toBe(adapter.loginUrl);
      expect(config.loginMode).toBe(adapter.loginMode);
      expect(config.requiredCookieNames).toEqual(adapter.requiredCookieNames);
      expect(config.baselineAuthCookieNames ?? []).toEqual(
        adapter.baselineAuthCookieNames ?? []
      );
      // 抖音用手写检测器覆盖，detectRule 有意不设（见下一个测试）
      if (adapter.platform !== 'douyin') {
        expect(config.detectRule).toEqual(adapter.detect);
      }
    }
    expect(getSupportedPlatforms().sort()).toEqual(
      Object.keys(PLATFORM_LOGIN_ADAPTERS).sort()
    );
  });

  it('抖音保留手写检测器（非声明式构建）', async () => {
    const config = getPlatformLoginConfig('douyin');
    // 手写检测器不暴露 detectRule，靠函数覆盖注入
    expect(config.detectRule).toBeUndefined();
    expect(config.requiredCookieNames).toEqual(['sessionid']);
  });
});
