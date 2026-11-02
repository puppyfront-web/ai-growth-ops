import { PLATFORM_LOGIN_ADAPTERS } from './platform-login';

/** 必备 cookie 的单一事实源：packages/shared/src/platform-login.ts 注册表。 */
function requiredCookieNames(platform: string): readonly string[] {
  return PLATFORM_LOGIN_ADAPTERS[platform]?.requiredCookieNames ?? [];
}

function cookieNames(cookie: string): Set<string> {
  return new Set(
    cookie
      .split(';')
      .map((part) => part.trim().split('=', 1)[0])
      .filter(Boolean)
  );
}

export function validatePlatformCookie(
  platform: string,
  rawCookie: string
): { valid: true; cookie: string } | { valid: false; error: string } {
  const cookie = rawCookie.trim();
  if (!cookie || !cookie.includes('=')) {
    return { valid: false, error: 'Cookie 格式无效，请粘贴完整的 Cookie 字符串' };
  }

  const requiredNames = requiredCookieNames(platform);
  if (!requiredNames.length) return { valid: true, cookie };

  const names = cookieNames(cookie);
  const missing = requiredNames.filter((name) => !names.has(name));
  if (missing.length > 0) {
    return {
      valid: false,
      error: `${platform} Cookie 缺少登录字段：${missing.join(', ')}`
    };
  }
  return { valid: true, cookie };
}
