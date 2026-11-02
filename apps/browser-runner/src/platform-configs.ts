import type { Page } from 'playwright';
import {
  PLATFORM_LOGIN_ADAPTERS,
  type PlatformLoginAdapter
} from '@ai-growth-ops/shared';

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
  /** 派生自 shared 适配器：登录成功必须在场的 cookie，finalize 强校验。 */
  requiredCookieNames?: string[];
  /** 派生自 shared 适配器的声明式规则（诊断与一致性测试用）；手写检测器平台不设。 */
  detectRule?: DetectionRule;
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
  'sessionid_ss'
] as const;

export const DOUYIN_POST_LOGIN_URL_PATTERNS = [
  '/creator-micro/',
  '/content',
  '/home',
  '/dashboard',
  '/media'
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
  'sensorsdata2015session'
]);

// ── Shared helpers ──────────────────────────────────────────────

function isIgnorableCookie(name: string): boolean {
  const lower = name.toLowerCase();
  if (IGNORABLE_COOKIE_NAMES.has(name) || IGNORABLE_COOKIE_NAMES.has(lower))
    return true;
  return (
    lower.startsWith('_ga') ||
    lower.startsWith('_hj') ||
    lower.startsWith('__utm')
  );
}

function cookieKey(domain: string, name: string): string {
  return `${domain}|${name}`;
}

export function snapshotCookieKeys(
  cookies: { domain: string; name: string }[]
): Set<string> {
  return new Set(cookies.map((c) => cookieKey(c.domain, c.name)));
}

function anyPageUrlMatches(page: Page, patterns: string[]): boolean {
  for (const p of page.context().pages()) {
    const url = p.url();
    if (patterns.some((pattern) => url.includes(pattern))) return true;
  }
  return false;
}

export function hasCookieNamed(
  cookies: { name: string }[],
  name: string
): boolean {
  const target = name.toLowerCase();
  return cookies.some((c) => c.name.toLowerCase() === target);
}

export function cookieHeaderHasNamedCookie(
  cookieHeader: string,
  name: string
): boolean {
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
  contextCookies: { name: string }[]
): boolean {
  if (rule.cookieNames?.length) {
    if (rule.cookieNames.some((name) => hasCookieNamed(contextCookies, name)))
      return true;
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
  } catch {
    /* storageState unavailable, fall through */
  }

  try {
    const contextCookies = await context.cookies();
    for (const c of contextCookies) {
      if (c.name && c.value) merged.set(c.name, c.value);
    }
  } catch {
    /* ignore */
  }

  for (const p of context.pages()) {
    try {
      const docCookie = await p.evaluate(() => document.cookie);
      if (!docCookie) continue;
      for (const pair of docCookie.split(';')) {
        const [k, ...v] = pair.trim().split('=');
        if (k && v.join('=')) merged.set(k.trim(), v.join('='));
      }
    } catch {
      /* frame may be detached */
    }
  }

  return Array.from(merged.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function hasNewAuthCookies(
  current: { domain: string; name: string; value: string }[],
  baseline: Set<string>,
  authNames?: string[]
): boolean {
  return current.some((c) => {
    if (!c.value || c.value.length < 4 || isIgnorableCookie(c.name))
      return false;
    if (authNames?.length) {
      if (!authNames.some((n) => c.name.toLowerCase() === n.toLowerCase()))
        return false;
    }
    return !baseline.has(cookieKey(c.domain, c.name));
  });
}

async function finalizeLogin(
  page: Page,
  requiredNames: string[] = []
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
 * Check whether the Douyin login form is present and fully rendered.
 *
 * The login UI loads dynamically — we need multiple signals to avoid false
 * negatives when the page hasn't finished hydrating.  Signals:
 *   1. Login card container exists (`douyin_login_new_class` / `douyin-login-new-id`)
 *   2. "扫码登录" tab text is visible
 *   3. QR code canvas / image is present inside the card
 *   4. Alternative login tabs ("验证码登录", "密码登录") are visible
 */
async function isDouyinLoginFormReady(page: Page): Promise<boolean> {
  // Quick structural check — login card container
  const loginCard = page
    .locator(
      '[class*="douyin_login"], [id*="douyin-login"], [class*="login-card"]'
    )
    .first();
  const cardCount = await loginCard.count();
  if (cardCount === 0) return false;

  // The login UI is considered "ready" when EITHER:
  // a) The QR tab text is visible, OR
  // b) An alternative login tab is visible (验证码登录 / 密码登录)
  const qrTabVis = await page
    .getByText('扫码登录', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);
  if (qrTabVis) return true;

  const altTabVis = await page
    .locator('text=验证码登录')
    .first()
    .isVisible()
    .catch(() => false);
  if (altTabVis) return true;

  const pwdTabVis = await page
    .locator('text=密码登录')
    .first()
    .isVisible()
    .catch(() => false);
  if (pwdTabVis) return true;

  return false;
}

/**
 * Douyin login detector.
 *
 * Primary: session cookies present (fast path).
 * Fallback: login UI has disappeared AND page shows post-login URL —
 *           `finalizeLogin` will reject if sessionid is still missing.
 */
async function detectDouyinLogin(page: Page): Promise<LoginDetectionResult> {
  const contextCookies = await page.context().cookies();

  // Fast path: auth cookies already set
  if (
    hasCookieNamed(contextCookies, 'sessionid') ||
    hasCookieNamed(contextCookies, 'sid_tt')
  ) {
    return finalizeLogin(page, ['sessionid']);
  }

  if (!anyPageUrlMatches(page, ['creator.douyin.com'])) {
    return { loggedIn: false, cookies: '' };
  }

  // If login form is still visible → user hasn't scanned yet
  const loginReady = await isDouyinLoginFormReady(page);
  if (loginReady) {
    return { loggedIn: false, cookies: '' };
  }

  // Login UI gone — user may have scanned QR.
  // Only consider "logged in" if page also navigated to a post-login URL.
  const urlLoggedIn = anyPageUrlMatches(page, DOUYIN_POST_LOGIN_URL_PATTERNS);
  if (urlLoggedIn) {
    return finalizeLogin(page, ['sessionid']);
  }

  return { loggedIn: false, cookies: '' };
}

/** Build a detectLogin function from a declarative rule set.
 *  命中候选规则只是第一步：finalize 还会强校验平台必备 cookie（如小红书 web_session），
 *  避免匿名 cookie（xsecappid 等）或仅 URL 跳转造成误判（spec/29 §1.2）。 */
function buildDetector(
  rule: DetectionRule,
  requiredNames: string[] = []
): (page: Page) => Promise<LoginDetectionResult> {
  return async (page: Page) => {
    const contextCookies = await page.context().cookies();
    if (!matchesRule(page, rule, contextCookies)) {
      return { loggedIn: false, cookies: '' };
    }
    return finalizeLogin(page, requiredNames);
  };
}

/** QR / generic fallback: new auth cookies since session start. */
export async function detectLoginWithBaseline(
  page: Page,
  config: PlatformLoginConfig,
  baselineKeys: Set<string>
): Promise<LoginDetectionResult> {
  const primary = await config.detectLogin(page);
  if (primary.loggedIn) return primary;

  const contextCookies = await page.context().cookies();
  if (
    !hasNewAuthCookies(
      contextCookies,
      baselineKeys,
      config.baselineAuthCookieNames
    )
  ) {
    return { loggedIn: false, cookies: '' };
  }

  return finalizeLogin(page, config.requiredCookieNames ?? []);
}

// ── Platform registry ───────────────────────────────────────────
// 单一事实源在 packages/shared/src/platform-login.ts；此处仅构建执行配置，
// 需要手写检测器的平台（抖音：登录 UI 消失 + 跳转兜底）以覆盖方式注入。

const configs: Record<string, PlatformLoginConfig> = {};

for (const adapter of Object.values(PLATFORM_LOGIN_ADAPTERS)) {
  configs[adapter.platform] = {
    loginUrl: adapter.loginUrl,
    loginMode: adapter.loginMode,
    detectLogin: buildDetector(adapter.detect, adapter.requiredCookieNames),
    baselineAuthCookieNames: adapter.baselineAuthCookieNames,
    requiredCookieNames: adapter.requiredCookieNames,
    detectRule: adapter.detect
  };
}

// 抖音：声明式规则不足以覆盖「登录 UI 消失 + 跳转后导航兜底」的时序，保留手写检测器。
const douyinConfig = configs.douyin;
if (douyinConfig) {
  douyinConfig.detectLogin = detectDouyinLogin;
  delete douyinConfig.detectRule;
}

export function getPlatformLoginConfig(platform: string): PlatformLoginConfig {
  const config = configs[platform];
  if (!config) throw new Error(`No login config for platform: ${platform}`);
  return config;
}

export function getSupportedPlatforms(): string[] {
  return Object.keys(configs);
}

export type { PlatformLoginAdapter };
