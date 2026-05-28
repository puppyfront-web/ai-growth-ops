import type { Page } from 'playwright';

export type LoginMode = 'qr' | 'form';

export interface LoginDetectionResult {
  loggedIn: boolean;
  cookies: string;
}

export interface PlatformLoginConfig {
  loginUrl: string;
  loginMode: LoginMode;
  detectLogin: (page: Page) => Promise<LoginDetectionResult>;
  /** Baseline fallback only counts NEW cookies with these names (avoids SSO noise). */
  baselineAuthCookieNames?: string[];
}

/** Detection rule: any match → logged in. All conditions are OR'd. */
export interface DetectionRule {
  /** Cookie names — logged in if any of these exist (case-insensitive) */
  cookieNames?: string[];
  /** URL substrings — logged in if current URL includes any of these */
  urlIncludes?: string[];
}

const MIN_COOKIE_PAYLOAD = 8;

/** Post-login only — do NOT include ttwid / odin_tt / passport_csrf_token. */
export const DOUYIN_AUTH_COOKIE_NAMES = [
  'sessionid',
  'sid_tt',
  'sid_guard',
  'sessionid_ss',
] as const;

const DOUYIN_POST_LOGIN_URL_PATTERNS = [
  '/creator-micro/',
  '/content',
  '/home',
  '/dashboard',
  '/media',
];

const IGNORABLE_COOKIE_NAMES = new Set([
  '_ga',
  '_gid',
  '_gat',
  '__utma',
  '__utmb',
  '__utmc',
  '__utmz',
  'HMACCOUNT',
  'HMACCOUNT_BFESS',
  'sensorsdata2015jssdkcross',
  'sensorsdata2015session',
]);

// ── Shared helpers ──────────────────────────────────────────────

function isIgnorableCookie(name: string): boolean {
  const lower = name.toLowerCase();
  if (IGNORABLE_COOKIE_NAMES.has(name) || IGNORABLE_COOKIE_NAMES.has(lower)) return true;
  return lower.startsWith('_ga') || lower.startsWith('_hj') || lower.startsWith('__utm');
}

function cookieKey(domain: string, name: string): string {
  return `${domain}|${name}`;
}

export function snapshotCookieKeys(cookies: { domain: string; name: string }[]): Set<string> {
  return new Set(cookies.map((c) => cookieKey(c.domain, c.name)));
}

function anyPageUrlMatches(page: Page, patterns: string[]): boolean {
  for (const p of page.context().pages()) {
    const url = p.url();
    if (patterns.some((pattern) => url.includes(pattern))) return true;
  }
  return false;
}

export function hasCookieNamed(cookies: { name: string }[], name: string): boolean {
  const target = name.toLowerCase();
  return cookies.some((c) => c.name.toLowerCase() === target);
}

export function cookieHeaderHasNamedCookie(cookieHeader: string, name: string): boolean {
  const target = name.toLowerCase();
  for (const pair of cookieHeader.split(';')) {
    const key = pair.trim().split('=')[0]?.trim().toLowerCase();
    if (key === target) return true;
  }
  return false;
}

function matchesRule(
  page: Page,
  rule: DetectionRule,
  contextCookies: { name: string }[],
): boolean {
  if (rule.cookieNames?.length) {
    if (rule.cookieNames.some((name) => hasCookieNamed(contextCookies, name))) return true;
  }
  if (rule.urlIncludes?.length) {
    if (anyPageUrlMatches(page, rule.urlIncludes)) return true;
  }
  return false;
}

export async function extractAllCookies(page: Page): Promise<string> {
  const context = page.context();
  const merged = new Map<string, string>();

  try {
    const { cookies: storageCookies } = await context.storageState();
    for (const c of storageCookies) {
      if (c.name && c.value) merged.set(c.name, c.value);
    }
  } catch { /* storageState unavailable, fall through */ }

  try {
    const contextCookies = await context.cookies();
    for (const c of contextCookies) {
      if (c.name && c.value) merged.set(c.name, c.value);
    }
  } catch { /* ignore */ }

  for (const p of context.pages()) {
    try {
      const docCookie = await p.evaluate(() => document.cookie);
      if (!docCookie) continue;
      for (const pair of docCookie.split(';')) {
        const [k, ...v] = pair.trim().split('=');
        if (k && v.join('=')) merged.set(k.trim(), v.join('='));
      }
    } catch { /* frame may be detached */ }
  }

  return Array.from(merged.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function hasNewAuthCookies(
  current: { domain: string; name: string; value: string }[],
  baseline: Set<string>,
  authNames?: string[],
): boolean {
  return current.some((c) => {
    if (!c.value || c.value.length < 4 || isIgnorableCookie(c.name)) return false;
    if (authNames?.length) {
      if (!authNames.some((n) => c.name.toLowerCase() === n.toLowerCase())) return false;
    }
    return !baseline.has(cookieKey(c.domain, c.name));
  });
}

async function finalizeLogin(
  page: Page,
  requiredNames: string[] = [],
): Promise<LoginDetectionResult> {
  const cookies = await extractAllCookies(page);
  if (cookies.length < MIN_COOKIE_PAYLOAD) {
    return { loggedIn: false, cookies: '' };
  }
  for (const name of requiredNames) {
    if (!cookieHeaderHasNamedCookie(cookies, name)) {
      return { loggedIn: false, cookies: '' };
    }
  }
  return { loggedIn: true, cookies };
}

/**
 * Douyin login detector.
 *
 * Primary: session cookies present (fast path).
 * Fallback: page navigated away from login UI — try to collect cookies anyway;
 *           `finalizeLogin` will reject if sessionid is still missing.
 */
async function detectDouyinLogin(page: Page): Promise<LoginDetectionResult> {
  const contextCookies = await page.context().cookies();

  if (
    hasCookieNamed(contextCookies, 'sessionid') ||
    hasCookieNamed(contextCookies, 'sid_tt')
  ) {
    return finalizeLogin(page, ['sessionid']);
  }

  if (!anyPageUrlMatches(page, ['creator.douyin.com'])) {
    return { loggedIn: false, cookies: '' };
  }

  const scanVis = await page
    .getByText('扫码登录', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);
  const phoneVis = await page
    .getByText('手机号登录', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);
  const loginUiGone = !scanVis && !phoneVis;
  const urlLoggedIn = anyPageUrlMatches(page, DOUYIN_POST_LOGIN_URL_PATTERNS);

  if (loginUiGone || urlLoggedIn) {
    // Login UI is gone or page navigated post-login.
    // Cookies may still be propagating; attempt collection and require sessionid.
    return finalizeLogin(page, ['sessionid']);
  }

  return { loggedIn: false, cookies: '' };
}

/** Build a detectLogin function from a declarative rule set. */
function buildDetector(rule: DetectionRule): (page: Page) => Promise<LoginDetectionResult> {
  return async (page: Page) => {
    const contextCookies = await page.context().cookies();
    if (!matchesRule(page, rule, contextCookies)) {
      return { loggedIn: false, cookies: '' };
    }
    return finalizeLogin(page);
  };
}

/** QR / generic fallback: new auth cookies since session start. */
export async function detectLoginWithBaseline(
  page: Page,
  config: PlatformLoginConfig,
  baselineKeys: Set<string>,
): Promise<LoginDetectionResult> {
  const primary = await config.detectLogin(page);
  if (primary.loggedIn) return primary;

  const contextCookies = await page.context().cookies();
  if (!hasNewAuthCookies(contextCookies, baselineKeys, config.baselineAuthCookieNames)) {
    return { loggedIn: false, cookies: '' };
  }

  const required = config.baselineAuthCookieNames?.includes('sessionid')
    ? ['sessionid']
    : [];
  return finalizeLogin(page, required);
}

/** Define a platform config with a simple rule instead of a handwritten function. */
function definePlatform(
  loginUrl: string,
  loginMode: LoginMode,
  rule: DetectionRule,
  baselineAuthCookieNames?: string[],
): PlatformLoginConfig {
  return {
    loginUrl,
    loginMode,
    detectLogin: buildDetector(rule),
    baselineAuthCookieNames,
  };
}

// ── Platform registry ───────────────────────────────────────────

const configs: Record<string, PlatformLoginConfig> = {
  douyin: {
    loginUrl: 'https://creator.douyin.com/',
    loginMode: 'qr',
    detectLogin: detectDouyinLogin,
    baselineAuthCookieNames: [...DOUYIN_AUTH_COOKIE_NAMES],
  },

  xiaohongshu: definePlatform(
    'https://creator.xiaohongshu.com/login',
    'form',
    { cookieNames: ['web_session', 'xsecappid'], urlIncludes: ['/creator/home', '/creator-center'] },
    ['web_session'],
  ),

  wechat_official: definePlatform(
    'https://mp.weixin.qq.com/',
    'qr',
    {
      cookieNames: ['slave_user', 'slave_sid', 'bizuin', 'data_bizuin'],
      urlIncludes: ['/cgi-bin/home', '/cgi-bin/index', '/cgi-bin/frame'],
    },
    ['slave_sid', 'slave_user'],
  ),

  wechat_channels: definePlatform(
    'https://channels.weixin.qq.com/',
    'qr',
    {
      cookieNames: ['finder_username', 'userName', 'sessionid', 'wxuin'],
      urlIncludes: ['/platform/', '/post/', '/login_done', '/cgi-bin/'],
    },
    ['finder_username', 'userName'],
  ),

  baijiahao: definePlatform(
    'https://baijiahao.baidu.com/',
    'form',
    { cookieNames: ['BDUSS', 'STOKEN'], urlIncludes: ['/builder', '/builder/rc'] },
    ['BDUSS'],
  ),

  zhihu: definePlatform(
    'https://www.zhihu.com/signin',
    'form',
    { cookieNames: ['z_c0', '_zap'], urlIncludes: ['/creator', '/settings'] },
    ['z_c0'],
  ),
};

export function getPlatformLoginConfig(platform: string): PlatformLoginConfig {
  const config = configs[platform];
  if (!config) throw new Error(`No login config for platform: ${platform}`);
  return config;
}

export function getSupportedPlatforms(): string[] {
  return Object.keys(configs);
}
