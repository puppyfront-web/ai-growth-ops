import { describe, expect, it } from 'vitest';
import {
  getPlatformLoginAdapter,
  getPlatformLoginAdapterPlatforms,
  PLATFORM_LOGIN_ADAPTERS
} from '../../../packages/shared/src/platform-login';
import { validatePlatformCookie } from '../../../packages/shared/src/platform-cookie';

const EXPECTED_PLATFORMS = [
  'douyin',
  'xiaohongshu',
  'wechat_official',
  'wechat_channels',
  'baijiahao',
  'zhihu'
] as const;

describe('PLATFORM_LOGIN_ADAPTERS 注册表', () => {
  it('覆盖六个平台且字段完整', () => {
    expect(getPlatformLoginAdapterPlatforms().sort()).toEqual(
      [...EXPECTED_PLATFORMS].sort()
    );
    for (const platform of EXPECTED_PLATFORMS) {
      const adapter = getPlatformLoginAdapter(platform);
      expect(adapter.platform).toBe(platform);
      expect(adapter.loginUrl).toMatch(/^https:\/\//);
      expect(['qr', 'form']).toContain(adapter.loginMode);
      expect(adapter.requiredCookieNames.length).toBeGreaterThan(0);
      expect(
        adapter.detect.cookieNames?.length || adapter.detect.urlIncludes?.length
      ).toBeTruthy();
    }
  });

  it('未知平台抛错', () => {
    expect(() => getPlatformLoginAdapter('nope')).toThrow(/platform/i);
  });

  it('登录态候选 cookie 不得包含匿名访问即下发的 cookie', () => {
    // 实测（2026-10-23）：未登录打开 creator.xiaohongshu.com/login 即有 xsecappid/a1/webId/acw_tc。
    // 这些名字一旦进入或语义检测规则，会话创建即被误判已登录（spec/29 §1.2）。
    const anonymousCookieNames = ['xsecappid', 'a1', 'webId', 'acw_tc', 'ttwid'];
    for (const adapter of Object.values(PLATFORM_LOGIN_ADAPTERS)) {
      for (const name of anonymousCookieNames) {
        expect(adapter.detect.cookieNames ?? []).not.toContain(name);
      }
    }
  });
});

describe('xiaohongshu 登录适配器', () => {
  const adapter = getPlatformLoginAdapter('xiaohongshu');

  it('以 web_session 作为候选与必备登录 cookie', () => {
    expect(adapter.detect.cookieNames).toEqual(['web_session']);
    expect(adapter.requiredCookieNames).toEqual(['web_session']);
    expect(adapter.baselineAuthCookieNames).toEqual(['web_session']);
    expect(adapter.loginUrl).toBe('https://creator.xiaohongshu.com/login');
    expect(adapter.loginMode).toBe('qr');
  });

  it('不声明任何登录页准备动作——与抖音共用同一交互链路', () => {
    // 交互方案统一：有显示环境弹真实浏览器窗口由操作员完成登录（扫码或短信均可），
    // 适配器只负责登录态检测，不携带自动点击等平台专属动作（2026-10-24 决策）。
    expect('prepare' in adapter).toBe(false);
    expect(adapter).toEqual(
      expect.objectContaining({ platform: 'xiaohongshu' })
    );
  });
});

describe('注册表与 validatePlatformCookie 的必备字段一致性', () => {
  it('仅含注册表必备 cookie 即通过校验', () => {
    for (const adapter of Object.values(PLATFORM_LOGIN_ADAPTERS)) {
      const cookie = adapter.requiredCookieNames
        .map((name) => `${name}=value_${name}_payload`)
        .join('; ');
      const result = validatePlatformCookie(adapter.platform, cookie);
      expect(result.valid).toBe(true);
    }
  });

  it('缺少任一必备 cookie 即校验失败', () => {
    for (const adapter of Object.values(PLATFORM_LOGIN_ADAPTERS)) {
      const partial = adapter.requiredCookieNames
        .slice(1)
        .map((name) => `${name}=value_${name}_payload`)
        .join('; ');
      const result = validatePlatformCookie(adapter.platform, partial);
      expect(result.valid).toBe(false);
    }
  });
});
