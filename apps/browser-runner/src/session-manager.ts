import { randomUUID } from 'node:crypto';
import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  detectLoginWithBaseline,
  getPlatformLoginConfig,
  snapshotCookieKeys,
  DOUYIN_POST_LOGIN_URL_PATTERNS
} from './platform-configs';
import {
  applyStealthInitScript,
  STEALTH_LAUNCH_ARGS,
  STEALTH_USER_AGENT
} from './browser-session';

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
  /** 登录页截图（data URL），前端直接展示给操作员扫码。 */
  qrImage?: string;
  lastQrAt?: number;
}

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
/** 前端轮询约 3s 一次，截图节流避免每次轮询都截屏。 */
const QR_CAPTURE_INTERVAL_MS = 2500;

// 二维码过期后登录页会出现「点击刷新 / 刷新二维码」，点一下即可换新码；
// 找不到可点的按钮就整页刷新换新码（cookie 基线在 context 层，不受刷新影响）。
const QR_EXPIRED_MARKERS = ['text=二维码已过期', 'text=已过期'];
const QR_REFRESH_BUTTONS = ['text=点击刷新', 'text=刷新二维码', 'text=刷新'];
// 命中登录卡片时裁剪截图（体积小、码更清晰），否则退回整页截图。
const LOGIN_CARD_SELECTOR =
  '[class*="douyin_login"], [id*="douyin-login"], [class*="login-card"], [class*="qrcode"], [class*="qr-login"], [class*="login_panel"], [class*="login-box"]';

function toDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function captureLoginScreenshot(session: BrowserSession): Promise<string> {
  const { page } = session;
  try {
    const card = page.locator(LOGIN_CARD_SELECTOR).first();
    const box = await card.boundingBox().catch(() => null);
    if (box && box.width > 80 && box.height > 80) {
      const pad = 24;
      const clip = {
        x: Math.max(box.x - pad, 0),
        y: Math.max(box.y - pad, 0),
        width: box.width + pad * 2,
        height: box.height + pad * 2
      };
      clip.width = Math.min(clip.width, 1280 - clip.x);
      clip.height = Math.min(clip.height, 900 - clip.y);
      const buf = await page.screenshot({ type: 'png', clip });
      return toDataUrl(buf);
    }
  } catch {
    /* fall back to full page */
  }
  const buf = await page.screenshot({ type: 'png' });
  return toDataUrl(buf);
}

/** 仅在页面明确显示「二维码已过期」时刷新，避免误伤用户正在扫的码。 */
async function refreshExpiredQr(page: Page): Promise<void> {
  try {
    let expired = false;
    for (const marker of QR_EXPIRED_MARKERS) {
      const el = page.locator(marker).first();
      if (
        (await el.count()) > 0 &&
        (await el.isVisible().catch(() => false))
      ) {
        expired = true;
        break;
      }
    }
    if (!expired) return;

    for (const sel of QR_REFRESH_BUTTONS) {
      const btn = page.locator(sel).first();
      if (
        (await btn.count()) > 0 &&
        (await btn.isVisible().catch(() => false))
      ) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        return;
      }
    }
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
  } catch {
    /* 刷新失败不影响轮询 */
  }
}

class SessionManager {
  private sessions = new Map<string, BrowserSession>();

  async createSession(platform: string): Promise<{
    sessionId: string;
    qrImage: string;
  }> {
    const config = getPlatformLoginConfig(platform);
    // 无头启动 + 登录页截图：容器部署无需显示服务，二维码由前端直接展示。
    const browser = await chromium.launch({
      headless: true,
      args: [...STEALTH_LAUNCH_ARGS],
      ignoreDefaultArgs: ['--enable-automation']
    });
    const context = await browser.newContext({
      userAgent: STEALTH_USER_AGENT,
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai'
    });
    await applyStealthInitScript(context);
    const page = await context.newPage();

    await page.goto(config.loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 等待登录页面完全加载 — 动态渲染的 login UI 需要额外时间
    // 这样 baseline cookie 快照更准确，同时让二维码完成渲染
    await page.waitForTimeout(3000);

    const baselineCookieKeys = snapshotCookieKeys(await context.cookies());

    const sessionId = randomUUID();
    const session: BrowserSession = {
      sessionId,
      platform,
      browser,
      context,
      page,
      createdAt: Date.now(),
      baselineCookieKeys
    };
    session.qrImage = await captureLoginScreenshot(session).catch(() => '');
    session.lastQrAt = Date.now();
    this.sessions.set(sessionId, session);

    return { sessionId, qrImage: session.qrImage ?? '' };
  }

  async getSessionStatus(sessionId: string): Promise<{
    status: 'waiting_scan' | 'logged_in' | 'expired' | 'error';
    cookies?: string;
    qrImage?: string;
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

      // 仍等待扫码 — 二维码过期则自动刷新，并把最新登录页截图带给前端展示
      await refreshExpiredQr(session.page);
      const now = Date.now();
      if (
        !session.qrImage ||
        now - (session.lastQrAt ?? 0) > QR_CAPTURE_INTERVAL_MS
      ) {
        session.qrImage = await captureLoginScreenshot(session).catch(
          () => session.qrImage
        );
        session.lastQrAt = now;
      }
      return { status: 'waiting_scan', qrImage: session.qrImage };
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
}, 30_000).unref();
