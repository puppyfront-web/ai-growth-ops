import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAllowedNavigation,
  assistantNotification,
  mergeTrustedOrigins,
  parseBrowserAssistantLaunch,
  parseBrowserBridgeArgs,
  resolveProfileDirectory
} from '../../../apps/browser-bridge/src/config';

describe('browser bridge arguments', () => {
  it('parses the custom protocol used by the production web flow', () => {
    expect(
      parseBrowserAssistantLaunch(
        'aigrowthops://authorize?api=https%3A%2F%2Fops.example.com&session=session-1&token=secret-token',
        ['https://ops.example.com']
      )
    ).toEqual({
      apiUrl: 'https://ops.example.com',
      sessionId: 'session-1',
      token: 'secret-token'
    });
  });

  it('rejects custom protocol requests from an untrusted server', () => {
    expect(() =>
      parseBrowserAssistantLaunch(
        'aigrowthops://authorize?api=https%3A%2F%2Fevil.example.com&session=session-1&token=secret-token',
        ['https://ops.example.com']
      )
    ).toThrow('授权服务地址不受信任');
  });

  it('parses the login command without logging secrets', () => {
    expect(
      parseBrowserBridgeArgs([
        'login',
        '--',
        '--api',
        'https://ops.example.com',
        '--session',
        'session-1',
        '--token',
        'secret-token'
      ])
    ).toEqual({
      apiUrl: 'https://ops.example.com',
      sessionId: 'session-1',
      token: 'secret-token'
    });
  });

  it('rejects incomplete commands', () => {
    expect(() => parseBrowserBridgeArgs(['login', '--api', 'https://ops.example.com']))
      .toThrow('缺少参数: --session, --token');
  });
});

describe('browser bridge profile isolation', () => {
  it('resolves a deterministic account profile under the data directory', () => {
    expect(
      resolveProfileDirectory('/tmp/bridge-data', 'douyin/account-123')
    ).toBe(join('/tmp/bridge-data', 'profiles', 'douyin', 'account-123'));
  });

  it('rejects a profile outside the data directory', () => {
    expect(() => resolveProfileDirectory('/tmp/bridge-data', '../escape'))
      .toThrow('Profile 路径无效');
  });
});

describe('browser bridge navigation boundary', () => {
  it('allows platform subdomains and local browser pages', () => {
    expect(() =>
      assertAllowedNavigation('https://passport.douyin.com/login', [
        'https://douyin.com'
      ])
    ).not.toThrow();
    expect(() => assertAllowedNavigation('about:blank', [])).not.toThrow();
  });

  it('rejects redirects outside the platform boundary', () => {
    expect(() =>
      assertAllowedNavigation('https://phishing.example.com/login', [
        'https://douyin.com'
      ])
    ).toThrow('UNSAFE_REDIRECT');
  });
});

describe('browser assistant trusted origins', () => {
  it('merges env and installer-baked origins, ignoring comments and duplicates', () => {
    expect(
      mergeTrustedOrigins(
        'https://ops.example.com , https://ops.example.com',
        '# packaged at build time\nhttps://ops.example.com\n\nhttp://localhost:3002\n'
      )
    ).toEqual(['https://ops.example.com', 'http://localhost:3002']);
  });

  it('still trusts env origins when the installer file is absent', () => {
    expect(mergeTrustedOrigins('https://ops.example.com', '')).toEqual([
      'https://ops.example.com'
    ]);
  });
});

describe('browser assistant notifications', () => {
  it('describes launched, completed and failed states in user-facing wording', () => {
    expect(assistantNotification('launched')).toEqual({
      title: '浏览器助手',
      body: '已打开登录页，请在浏览器中完成授权。'
    });
    expect(assistantNotification('completed')).toEqual({
      title: '浏览器助手',
      body: '授权完成，凭据已安全保存。'
    });
    expect(assistantNotification('failed', 'UNSAFE_REDIRECT: evil.example.com')).toMatchObject({
      title: '浏览器助手'
    });
  });

  it('never leaks tokens or full URLs in failure notifications', () => {
    const notice = assistantNotification(
      'failed',
      'aigrowthops://authorize?token=secret-token-123 failed'
    );
    expect(JSON.stringify(notice)).not.toContain('secret-token-123');
    expect(notice.body.length).toBeLessThanOrEqual(120);
  });
});
