import { type Browser, type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply stealth evasion once at module load
chromium.use(StealthPlugin());

export function parseCookieHeader(
  cookie: string
): Array<{ name: string; value: string; domain: string; path: string }> {
  return cookie
    .split(';')
    .map((pair) => {
      const [name, ...rest] = pair.trim().split('=');
      return {
        name: name.trim(),
        value: rest.join('=').trim(),
        domain: '',
        path: '/'
      };
    })
    .filter((c) => c.name.length > 0);
}

/** Apply cookies on parent domain (e.g. `.douyin.com`) so all subdomains receive them. */
export function cookiesForSite(
  cookie: string,
  siteDomain: string
): Array<{ name: string; value: string; domain: string; path: string }> {
  const parent = siteDomain.startsWith('.')
    ? siteDomain
    : `.${siteDomain.replace(/^\./, '')}`;
  return parseCookieHeader(cookie).map((c) => ({
    ...c,
    domain: parent,
    path: '/'
  }));
}

interface StorageStateCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/** Accept Playwright storageState JSON or a `name=value; ...` header. */
export function resolveContextCookies(
  cookie: string,
  siteDomain: string
): Array<{ name: string; value: string; domain: string; path: string }> {
  const trimmed = cookie.trim();
  if (trimmed.startsWith('{')) {
    try {
      const state = JSON.parse(trimmed) as { cookies?: StorageStateCookie[] };
      const fromState = state.cookies ?? [];
      if (fromState.length > 0) {
        return fromState
          .filter((item) => item.name && item.value)
          .map((item) => ({
            name: item.name,
            value: item.value,
            domain: item.domain?.startsWith('.')
              ? item.domain
              : item.domain
                ? `.${item.domain}`
                : siteDomain.startsWith('.')
                  ? siteDomain
                  : `.${siteDomain}`,
            path: item.path || '/'
          }));
      }
      // Valid JSON but empty cookies — return empty array instead of
      // falling through to header parsing which would produce garbage.
      return [];
    } catch {
      // fall through to header parsing
    }
  }

  return cookiesForSite(cookie, siteDomain);
}

// ── Shared browser pool ───────────────────────────────────────────

const BROWSER_TTL_MS = 15 * 60 * 1000;

const sharedBrowsers = new Map<'headed' | 'headless', Browser>();
const browserLastUsed = new Map<'headed' | 'headless', number>();
// Live contexts per shared browser. A browser with active contexts must never
// be recycled (TTL expiry used to close browsers mid-publish, killing in-flight
// sessions with "Target page, context or browser has been closed").
const browserActiveContexts = new Map<'headed' | 'headless', number>();

export function resolveHeadedPreference(override?: boolean): boolean {
  if (typeof override === 'boolean') return override;
  return process.env.BROWSER_RUNNER_HEADED === 'true';
}

/** Headed 模式需要显示服务，Linux 容器里通常没有（无 $DISPLAY/WAYLAND_DISPLAY）。 */
export function hasDisplaySupport(): boolean {
  return (
    process.platform !== 'linux' ||
    Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  );
}

export const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const STEALTH_LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage'
] as const;

/** Remove automation fingerprints before any page script runs. */
export function applyStealthInitScript(
  context: BrowserContext
): Promise<unknown> {
  return context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en']
    });
  });
}

async function getSharedBrowser(headedOverride?: boolean): Promise<Browser> {
  const requested = resolveHeadedPreference(headedOverride);
  // 无显示服务的环境里 headed 启动会让 Chromium 直接退出（Missing X server），
  // 这里降级为 headless，让抓取/同步类任务继续可用。
  const headed = requested && hasDisplaySupport();
  if (requested && !headed) {
    console.warn(
      '[browser-session] 请求了有界面模式，但当前环境没有显示服务（DISPLAY/WAYLAND_DISPLAY 未设置），已降级为 headless'
    );
  }
  const browserKey: 'headed' | 'headless' = headed ? 'headed' : 'headless';
  const now = Date.now();
  const existing = sharedBrowsers.get(browserKey);
  const lastUsed = browserLastUsed.get(browserKey) ?? 0;
  if (existing && now - lastUsed < BROWSER_TTL_MS && existing.isConnected()) {
    browserLastUsed.set(browserKey, now);
    return existing;
  }

  if (existing && existing.isConnected() && (browserActiveContexts.get(browserKey) ?? 0) > 0) {
    // Stale by TTL but still serving in-flight sessions — keep it alive and
    // just refresh the timestamp; recycle on a later acquisition instead.
    browserLastUsed.set(browserKey, now);
    return existing;
  }

  if (existing) {
    try {
      await existing.close();
    } catch {
      /* */
    }
    sharedBrowsers.delete(browserKey);
  }

  const browser = await chromium.launch({
    headless: !headed,
    args: [...STEALTH_LAUNCH_ARGS],
    ignoreDefaultArgs: ['--enable-automation']
  });
  sharedBrowsers.set(browserKey, browser);
  browserLastUsed.set(browserKey, now);
  return browser;
}

/**
 * Create an isolated context (not a new browser) for each request.
 * Reuses the shared browser process to avoid cold-start overhead.
 * Applies stealth init script to remove automation fingerprints.
 */
export async function createStealthSession(
  cookie: string,
  siteDomain: string,
  headedOverride?: boolean
): Promise<{
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}> {
  const browserKey: 'headed' | 'headless' = resolveHeadedPreference(headedOverride)
    ? 'headed'
    : 'headless';
  const browser = await getSharedBrowser(headedOverride);
  browserActiveContexts.set(browserKey, (browserActiveContexts.get(browserKey) ?? 0) + 1);

  const context = await browser.newContext({
    userAgent: STEALTH_USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });

  await applyStealthInitScript(context);

  const cookies = resolveContextCookies(cookie, siteDomain);
  if (cookies.length > 0) await context.addCookies(cookies);

  const page = await context.newPage();

  return {
    context,
    page,
    // Close the context only; browser stays alive for the next request
    close: async () => {
      try {
        await context.close();
      } catch {
        /* */
      } finally {
        const remaining = (browserActiveContexts.get(browserKey) ?? 1) - 1;
        browserActiveContexts.set(browserKey, Math.max(remaining, 0));
      }
    }
  };
}

/** @deprecated Use createStealthSession instead */
export async function createHeadlessSession(
  cookie: string,
  siteDomain: string,
  headedOverride?: boolean
): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}> {
  const browserKey: 'headed' | 'headless' = resolveHeadedPreference(headedOverride)
    ? 'headed'
    : 'headless';
  const browser = await getSharedBrowser(headedOverride);
  browserActiveContexts.set(browserKey, (browserActiveContexts.get(browserKey) ?? 0) + 1);
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  const cookies = resolveContextCookies(cookie, siteDomain);
  if (cookies.length > 0) await context.addCookies(cookies);

  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    close: async () => {
      try {
        await context.close();
      } catch {
        /* */
      } finally {
        const remaining = (browserActiveContexts.get(browserKey) ?? 1) - 1;
        browserActiveContexts.set(browserKey, Math.max(remaining, 0));
      }
    }
  };
}
