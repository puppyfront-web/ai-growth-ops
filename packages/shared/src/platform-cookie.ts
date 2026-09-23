const REQUIRED_COOKIE_NAMES: Record<string, readonly string[]> = {
  douyin: ['sessionid'],
  xiaohongshu: ['web_session'],
  wechat_official: ['slave_sid'],
  wechat_channels: ['finder_username'],
  baijiahao: ['BDUSS'],
  zhihu: ['z_c0']
};

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

  const requiredNames = REQUIRED_COOKIE_NAMES[platform];
  if (!requiredNames) return { valid: true, cookie };

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
