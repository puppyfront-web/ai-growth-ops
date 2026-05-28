import { describe, expect, it } from 'vitest';
import {
  cookieHeaderHasNamedCookie,
  DOUYIN_AUTH_COOKIE_NAMES,
  getPlatformLoginConfig,
  hasCookieNamed,
  snapshotCookieKeys,
  type DetectionRule,
} from '../../../apps/browser-runner/src/platform-configs';

describe('snapshotCookieKeys', () => {
  it('keys cookies by domain and name', () => {
    const keys = snapshotCookieKeys([
      { domain: '.douyin.com', name: 'sessionid' },
      { domain: '.douyin.com', name: '_ga' },
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
    expect(cookieHeaderHasNamedCookie('not_sessionid=1', 'sessionid')).toBe(false);
  });
});

describe('douyin login config', () => {
  it('uses auth-only baseline cookie names', () => {
    expect(DOUYIN_AUTH_COOKIE_NAMES).toEqual([
      'sessionid',
      'sid_tt',
      'sid_guard',
      'sessionid_ss',
    ]);
    expect(DOUYIN_AUTH_COOKIE_NAMES).not.toContain('ttwid');
    expect(DOUYIN_AUTH_COOKIE_NAMES).not.toContain('odin_tt');
    expect(DOUYIN_AUTH_COOKIE_NAMES).not.toContain('passport_csrf_token');
  });

  it('registers custom douyin detector with auth baseline', () => {
    const config = getPlatformLoginConfig('douyin');
    expect(config.loginUrl).toBe('https://creator.douyin.com/');
    expect(config.loginMode).toBe('qr');
    expect(config.baselineAuthCookieNames).toEqual([...DOUYIN_AUTH_COOKIE_NAMES]);
  });
});

describe('DetectionRule shape', () => {
  it('supports combined cookie and url rules', () => {
    const rule: DetectionRule = {
      cookieNames: ['sessionid'],
      urlIncludes: ['/creator/'],
    };
    expect(rule.cookieNames).toContain('sessionid');
    expect(rule.urlIncludes).toContain('/creator/');
  });
});
