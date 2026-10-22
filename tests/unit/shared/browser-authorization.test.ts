import { describe, expect, it } from 'vitest';
import {
  canTransitionBrowserAuthorizationStatus,
  createBrowserProfileRef,
  filterAuthorizationCookies,
  getPlatformAuthorizationAdapter
} from '../../../packages/shared/src/browser-authorization';

describe('platform authorization adapters', () => {
  it.each([
    ['douyin', 'sessionid'],
    ['xiaohongshu', 'web_session'],
    ['wechat_official', 'slave_sid'],
    ['wechat_channels', 'finder_username'],
    ['baijiahao', 'BDUSS'],
    ['zhihu', 'z_c0']
  ])('defines login and cookie requirements for %s', (platform, cookieName) => {
    const adapter = getPlatformAuthorizationAdapter(platform);

    expect(adapter.loginUrl).toMatch(/^https:\/\//);
    expect(adapter.requiredCookieNames).toContain(cookieName);
    expect(adapter.allowedOrigins.length).toBeGreaterThan(0);
  });

  it('rejects unsupported platforms', () => {
    expect(() => getPlatformAuthorizationAdapter('unknown')).toThrow(
      'Unsupported browser authorization platform: unknown'
    );
  });
});

describe('browser profile isolation', () => {
  it('uses a deterministic profile per platform account', () => {
    expect(createBrowserProfileRef('douyin', 'account-123')).toBe(
      'douyin/account-123'
    );
    expect(createBrowserProfileRef('douyin', 'account-456')).not.toBe(
      createBrowserProfileRef('douyin', 'account-123')
    );
  });

  it('removes path traversal characters', () => {
    expect(createBrowserProfileRef('../douyin', '../../account')).toBe(
      'douyin/account'
    );
  });
});

describe('authorization cookie filtering', () => {
  it('returns only required cookies from allowed domains', () => {
    const adapter = getPlatformAuthorizationAdapter('douyin');
    const header = filterAuthorizationCookies(adapter, [
      { name: 'sessionid', value: 'signed-in', domain: '.douyin.com' },
      { name: 'sid_tt', value: 'secondary', domain: '.douyin.com' },
      { name: 'sessionid', value: 'foreign', domain: '.example.com' },
      { name: 'unrelated', value: 'secret', domain: '.douyin.com' }
    ]);

    expect(header).toBe('sessionid=signed-in; sid_tt=secondary');
    expect(header).not.toContain('foreign');
    expect(header).not.toContain('unrelated');
  });

  it('returns an empty string when a required cookie is missing', () => {
    const adapter = getPlatformAuthorizationAdapter('zhihu');
    expect(
      filterAuthorizationCookies(adapter, [
        { name: '_xsrf', value: 'token', domain: '.zhihu.com' }
      ])
    ).toBe('');
  });
});

describe('browser authorization state machine', () => {
  it('allows the expected success flow', () => {
    expect(
      canTransitionBrowserAuthorizationStatus(
        'waiting_local_bridge',
        'waiting_user'
      )
    ).toBe(true);
    expect(
      canTransitionBrowserAuthorizationStatus('waiting_user', 'logged_in')
    ).toBe(true);
  });

  it('rejects transitions from terminal states', () => {
    expect(
      canTransitionBrowserAuthorizationStatus('logged_in', 'waiting_user')
    ).toBe(false);
    expect(
      canTransitionBrowserAuthorizationStatus('cancelled', 'logged_in')
    ).toBe(false);
  });
});
