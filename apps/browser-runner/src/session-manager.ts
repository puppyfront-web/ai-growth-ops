import { randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  detectLoginWithBaseline,
  getPlatformLoginConfig,
  snapshotCookieKeys,
  DOUYIN_POST_LOGIN_URL_PATTERNS
} from './platform-configs';

interface BrowserSession {
  sessionId: string;
  platform: string;
  browser: import('playwright').Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  baselineCookieKeys: Set<string>;
  /** Once login is detected, cache the cookies so repeated polls still get the result. */
  completedCookies?: string;
  /** Track whether the Douyin navigation retry has already been attempted. */
  douyinNavAttempted?: boolean;
}

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

class SessionManager {
  private sessions = new Map<string, BrowserSession>();

  async createSession(platform: string): Promise<{
    sessionId: string;
  }> {
    const config = getPlatformLoginConfig(platform);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }
    });
    const page = await context.newPage();

    await page.goto(config.loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 等待登录页面完全加载 — 动态渲染的 login UI 需要额外时间
    // 这样 baseline cookie 快照更准确，同时让用户看到完整的 QR 码
    await page.waitForTimeout(3000);

    const baselineCookieKeys = snapshotCookieKeys(await context.cookies());

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      sessionId,
      platform,
      browser,
      context,
      page,
      createdAt: Date.now(),
      baselineCookieKeys
    });

    return { sessionId };
  }

  async getSessionStatus(sessionId: string): Promise<{
    status: 'waiting_scan' | 'logged_in' | 'expired' | 'error';
    cookies?: string;
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) return { status: 'expired', error: '会话已过期或不存在' };

    // If login was already detected in a previous poll, return cached result
    if (session.completedCookies) {
      return { status: 'logged_in', cookies: session.completedCookies };
    }

    if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
      await this.cancelSession(sessionId);
      return { status: 'expired', error: '登录超时，请重试' };
    }

    try {
      const config = getPlatformLoginConfig(session.platform);

      const currentUrl = session.page.url();
      const contextCookies = await session.context.cookies();
      console.log(
        `[session:${sessionId.slice(0, 8)}] platform=${session.platform} url=${currentUrl} cookies=[${contextCookies.map((c) => c.name).join(',')}]`
      );

      let result = await detectLoginWithBaseline(
        session.page,
        config,
        session.baselineCookieKeys
      );

      // QR 扫码后页面可能未自动跳转，主动驱动导航以触发 cookie 写入（仅执行一次）
      // 关键：只有同时满足以下条件时才触发导航（避免在用户还没扫码时就把浏览器导走）：
      //   1. 登录 UI 已经不可见（说明用户已操作或页面已跳转）
      //   2. 页面 URL 仍在 douyin 域名下
      //   3. 距 session 创建超过 15 秒（给用户足够时间扫码）
      if (
        !result.loggedIn &&
        session.platform === 'douyin' &&
        !session.douyinNavAttempted
      ) {
        const sessionAge = Date.now() - session.createdAt;
        if (sessionAge > 15_000) {
          // 检查登录 UI 是否已消失（用户可能已扫码但页面未跳转）
          const loginCardVisible = await session.page
            .locator('[class*="douyin_login"], [id*="douyin-login"]')
            .first()
            .isVisible()
            .catch(() => false);

          if (!loginCardVisible) {
            session.douyinNavAttempted = true;
            console.log(
              `[session:${sessionId.slice(0, 8)}] douyin retry triggered: login UI gone, sessionAge=${Math.round(sessionAge / 1000)}s`
            );

            // 1) 先等待页面自然跳转（最多 5 秒）
            try {
              await session.page.waitForURL(
                (u) =>
                  DOUYIN_POST_LOGIN_URL_PATTERNS.some((p) =>
                    u.toString().includes(p)
                  ),
                { timeout: 5000 }
              );
            } catch {
              // 跳转没发生 — 继续尝试主动导航
            }

            // 2) 如果仍未到 dashboard，主动导航触发 cookie 写入
            const currentUrl = session.page.url();
            if (
              !DOUYIN_POST_LOGIN_URL_PATTERNS.some((p) =>
                currentUrl.includes(p)
              )
            ) {
              try {
                await session.page.goto(
                  'https://creator.douyin.com/creator-micro/home',
                  {
                    waitUntil: 'domcontentloaded',
                    timeout: 8000
                  }
                );
              } catch {
                // 导航失败也继续尝试检测
              }
            }

            // 3) 等待 cookie 写入后重新检测
            await session.page.waitForTimeout(2000);
            result = await detectLoginWithBaseline(
              session.page,
              config,
              session.baselineCookieKeys
            );
          }
        }
      }

      console.log(
        `[session:${sessionId.slice(0, 8)}] loggedIn=${result.loggedIn} cookieLen=${result.cookies.length}`
      );

      if (result.loggedIn && result.cookies.trim()) {
        // Cache cookies so subsequent polls still get the result until API confirms.
        session.completedCookies = result.cookies;
        // Close browser immediately to free resources, but keep session in map.
        try {
          await session.browser.close();
        } catch {
          /* already closed */
        }
        return { status: 'logged_in', cookies: result.cookies };
      }

      return { status: 'waiting_scan' };
    } catch (err) {
      console.error(`[session:${sessionId.slice(0, 8)}] error:`, err);
      return { status: 'error', error: (err as Error).message };
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    try {
      await session.browser.close();
    } catch {
      /* browser may already be closed */
    }
  }

  async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TIMEOUT_MS) {
        await this.cancelSession(id);
      }
    }
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();

setInterval(() => {
  sessionManager.cleanupStaleSessions().catch(() => {});
}, 30_000);
