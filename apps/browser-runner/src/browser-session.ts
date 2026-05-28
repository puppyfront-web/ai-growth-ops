import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export function parseCookieHeader(cookie: string): Array<{ name: string; value: string; domain: string; path: string }> {
  return cookie
    .split(';')
    .map((pair) => {
      const [name, ...rest] = pair.trim().split('=');
      return { name: name.trim(), value: rest.join('=').trim(), domain: '', path: '/' };
    })
    .filter((c) => c.name.length > 0);
}

/** Apply cookies on parent domain (e.g. `.douyin.com`) so all subdomains receive them. */
export function cookiesForSite(cookie: string, siteDomain: string): Array<{ name: string; value: string; domain: string; path: string }> {
  const parent = siteDomain.startsWith('.') ? siteDomain : `.${siteDomain.replace(/^\./, '')}`;
  return parseCookieHeader(cookie).map((c) => ({ ...c, domain: parent, path: '/' }));
}

// ── Shared browser pool ───────────────────────────────────────────

const BROWSER_TTL_MS = 15 * 60 * 1000;

const sharedBrowsers = new Map<'headed' | 'headless', Browser>();
const browserLastUsed = new Map<'headed' | 'headless', number>();

export function resolveHeadedPreference(override?: boolean): boolean {
  if (typeof override === 'boolean') return override;
  return process.env.BROWSER_RUNNER_HEADED === 'true';
}

async function getSharedBrowser(headedOverride?: boolean): Promise<Browser> {
  const headed = resolveHeadedPreference(headedOverride);
  const browserKey: 'headed' | 'headless' = headed ? 'headed' : 'headless';
  const now = Date.now();
  const existing = sharedBrowsers.get(browserKey);
  const lastUsed = browserLastUsed.get(browserKey) ?? 0;
  if (existing && now - lastUsed < BROWSER_TTL_MS && existing.isConnected()) {
    browserLastUsed.set(browserKey, now);
    return existing;
  }

  if (existing) {
    try { await existing.close(); } catch { /* */ }
    sharedBrowsers.delete(browserKey);
  }

  const browser = await chromium.launch({
    headless: !headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
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
  headedOverride?: boolean,
): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const browser = await getSharedBrowser(headedOverride);

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  // Remove automation fingerprints before any page script runs
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = { runtime: {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  });

  const cookies = cookiesForSite(cookie, siteDomain);
  if (cookies.length > 0) await context.addCookies(cookies);

  const page = await context.newPage();

  return {
    context,
    page,
    // Close the context only; browser stays alive for the next request
    close: async () => {
      try { await context.close(); } catch { /* */ }
    },
  };
}

/** @deprecated Use createStealthSession instead */
export async function createHeadlessSession(
  cookie: string,
  siteDomain: string,
  headedOverride?: boolean,
): Promise<{ browser: Browser; context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const browser = await getSharedBrowser(headedOverride);
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const cookies = cookiesForSite(cookie, siteDomain);
  if (cookies.length > 0) await context.addCookies(cookies);

  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    close: async () => {
      try { await context.close(); } catch { /* */ }
    },
  };
}
