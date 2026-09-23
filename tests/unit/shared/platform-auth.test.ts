import { describe, expect, it } from 'vitest';
import {
  isPlatformAuthExpiredError,
  markPlatformAuthExpired,
  PLATFORM_AUTH_EXPIRED_CODE
} from '@ai-growth-ops/shared';

describe('isPlatformAuthExpiredError', () => {
  it('matches provider health-check error texts', () => {
    expect(isPlatformAuthExpiredError('Cookie 已失效，被重定向到登录页')).toBe(
      true
    );
    expect(isPlatformAuthExpiredError('Cookie 已过期 (401)')).toBe(true);
    expect(isPlatformAuthExpiredError('Token 已过期或无效 (401)')).toBe(true);
    expect(isPlatformAuthExpiredError('缺少 Access Token 或 Cookie')).toBe(true);
    expect(isPlatformAuthExpiredError('缺少 Cookie')).toBe(true);
    expect(
      isPlatformAuthExpiredError('缺少 AppID/AppSecret 或 Cookie')
    ).toBe(true);
    expect(isPlatformAuthExpiredError('Cookie 已失效 (HTTP 401)')).toBe(true);
  });

  it('matches Error instances and marked messages', () => {
    expect(isPlatformAuthExpiredError(new Error('登录已失效，请重新扫码'))).toBe(
      true
    );
    expect(isPlatformAuthExpiredError(markPlatformAuthExpired('boom'))).toBe(
      true
    );
  });

  it('does not match unrelated failures', () => {
    expect(isPlatformAuthExpiredError(new Error('网络错误: timeout'))).toBe(
      false
    );
    expect(isPlatformAuthExpiredError('验证失败 (HTTP 500)')).toBe(false);
    expect(isPlatformAuthExpiredError(undefined)).toBe(false);
    expect(isPlatformAuthExpiredError({ nope: 1 })).toBe(false);
  });
});

describe('markPlatformAuthExpired', () => {
  it('embeds the contract code', () => {
    const marked = markPlatformAuthExpired('平台返回 302');
    expect(marked).toContain(PLATFORM_AUTH_EXPIRED_CODE);
    expect(isPlatformAuthExpiredError(marked)).toBe(true);
  });
});
