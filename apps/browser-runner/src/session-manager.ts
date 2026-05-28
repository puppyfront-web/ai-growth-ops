import { randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  detectLoginWithBaseline,
  getPlatformLoginConfig,
  snapshotCookieKeys,
} from './platform-configs';

interface BrowserSession {
  sessionId: string;
  platform: string;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  baselineCookieKeys: Set<string>;
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
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const baselineCookieKeys = snapshotCookieKeys(await context.cookies());

    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      sessionId,
      platform,
      context,
      page,
      createdAt: Date.now(),
      baselineCookieKeys,
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

    if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
      await this.cancelSession(sessionId);
      return { status: 'expired', error: '登录超时，请重试' };
    }

    try {
      const config = getPlatformLoginConfig(session.platform);

      const currentUrl = session.page.url();
      const contextCookies = await session.context.cookies();
      console.log(`[session:${sessionId.slice(0,8)}] platform=${session.platform} url=${currentUrl} cookies=[${contextCookies.map(c => c.name).join(',')}]`);

      let result = await detectLoginWithBaseline(
        session.page,
        config,
        session.baselineCookieKeys,
      );

      // QR 扫码后 cookie 可能延迟写入，短暂等待后重试一次
      if (!result.loggedIn && session.platform === 'douyin') {
        const url = session.page.url();
        if (url.includes('creator.douyin.com') && !url.includes('/login')) {
          await session.page.waitForTimeout(1500);
          result = await detectLoginWithBaseline(
            session.page,
            config,
            session.baselineCookieKeys,
          );
        }
      }

      console.log(`[session:${sessionId.slice(0,8)}] loggedIn=${result.loggedIn} cookieLen=${result.cookies.length}`);

      if (result.loggedIn && result.cookies.trim()) {
        const cookies = result.cookies;
        this.sessions.delete(sessionId);
        await session.context.browser()?.close();
        return { status: 'logged_in', cookies };
      }

      return { status: 'waiting_scan' };
    } catch (err) {
      console.error(`[session:${sessionId.slice(0,8)}] error:`, err);
      return { status: 'error', error: (err as Error).message };
    }
  }

  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    try {
      await session.context.browser()?.close();
    } catch {}
  }

  cleanupStaleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TIMEOUT_MS) {
        this.cancelSession(id);
      }
    }
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();

setInterval(() => sessionManager.cleanupStaleSessions(), 30_000);
