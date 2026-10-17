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
  /** 整页实时画面（JPEG data URL），供操作员远程处理滑块/验证码等交互。 */
  pageImage?: string;
  lastPageAt?: number;
}

const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
/** 前端轮询约 3s 一次，截图节流避免每次轮询都截屏。 */
const QR_CAPTURE_INTERVAL_MS = 2500;
/** 整页实时画面刷新间隔（交互操作后需要较快看到反馈）。 */
const PAGE_IMAGE_INTERVAL_MS = 1200;
/** 登录页视口（与 createSession 的 viewport 一致，前端据此换算坐标）。 */
export const PAGE_VIEWPORT = { width: 1280, height: 900 } as const;

// 二维码过期后登录页会出现「点击刷新 / 刷新二维码」，点一下即可换新码；
// 找不到可点的按钮就整页刷新换新码（cookie 基线在 context 层，不受刷新影响）。
const QR_EXPIRED_MARKERS = ['text=二维码已过期', 'text=已过期'];
const QR_REFRESH_BUTTONS = ['text=点击刷新', 'text=刷新二维码', 'text=刷新'];
// 命中登录卡片时裁剪截图（体积小、码更清晰），否则退回整页截图。
const LOGIN_CARD_SELECTOR =
  '[class*="douyin_login"], [id*="douyin-login"], [class*="login-card"], [class*="qrcode"], [class*="qr-login"], [class*="login_panel"], [class*="login-box"]';
const VIEWPORT = { width: 1280, height: 900 };

function toDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** 整页实时画面：CDP 截图并缩到一半（640×450 JPEG），供前端展示与交互。 */
async function capturePageImage(
  session: BrowserSession
): Promise<string | undefined> {
  try {
    const cdp = await session.context.newCDPSession(session.page);
    try {
      const { data } = (await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 45,
        clip: {
          x: 0,
          y: 0,
          width: PAGE_VIEWPORT.width,
          height: PAGE_VIEWPORT.height,
          scale: 0.5
        }
      })) as { data?: string };
      return data ? `data:image/jpeg;base64,${data}` : undefined;
    } finally {
      await cdp.detach().catch(() => {});
    }
  } catch {
    return undefined;
  }
}

function clampClip(
  box: { x: number; y: number; width: number; height: number },
  pad: number
) {
  const x = Math.max(box.x - pad, 0);
  const y = Math.max(box.y - pad, 0);
  return {
    x,
    y,
    width: Math.min(box.width + pad * 2, VIEWPORT.width - x),
    height: Math.min(box.height + pad * 2, VIEWPORT.height - y)
  };
}

/** 在页面上下文里找二维码本体：
 *  - 只看 img/canvas（装饰性背景 div 常是整页大小，会干扰选择）；
 *  - 近似正方形（0.85~1.18）、尺寸 120~500px；
 *  - 若能定位登录卡片，则必须位于卡片内部（排除页面上其他方图）；
 *  - 多个命中时取面积最大者。
 *  布局无关——不依赖抖音的类名约定。返回视口坐标（与 screenshot clip 同系）。 */
const QR_BOX_SCRIPT = `
(() => {
  const cardSel = '[class*="login-card"],[class*="qrcode"],[class*="qr-login"],[class*="login_panel"],[class*="login-box"]';
  let card = null;
  const cards = [];
  for (const el of document.querySelectorAll(cardSel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 80 && r.height > 80) {
      cards.push(Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.x) + ',' + Math.round(r.y));
      if (!card) card = r;
    }
  }
  const imgs = [];
  let best = null;
  for (const el of document.querySelectorAll('img, canvas')) {
    const r = el.getBoundingClientRect();
    const sq = r.width >= 120 && r.height >= 120 && r.width <= 500 && r.height <= 500 &&
      (() => { const ratio = r.width / r.height; return ratio >= 0.85 && ratio <= 1.18; })();
    if (sq) imgs.push(Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.x) + ',' + Math.round(r.y));
    if (!sq) continue;
    if (card) {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx < card.x || cx > card.x + card.width || cy < card.y || cy > card.y + card.height)
        continue;
    }
    const area = r.width * r.height;
    if (!best || area > best.area) {
      best = { area, x: r.x, y: r.y, width: r.width, height: r.height };
    }
  }
  return {
    box: best,
    diag: 'card=[' + cards.join('|') + '] 方形img/canvas=[' + imgs.join('|') + '] 全部img=' + document.querySelectorAll('img').length
  };
})()`;

async function locateQrBox(page: Page): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  const res = await page
    .evaluate(QR_BOX_SCRIPT)
    .then(r => r as { box: unknown; diag: string } | null)
    .catch(err => {
      console.warn('[session] 二维码探测脚本异常:', String(err).slice(0, 80));
      return null;
    });
  if (!res?.box) {
    console.warn('[session] 未定位到二维码元素:', res?.diag ?? 'evaluate 失败');
    return null;
  }
  return res.box as { x: number; y: number; width: number; height: number };
}

async function captureLoginScreenshot(
  session: BrowserSession,
  { waitQr = false }: { waitQr?: boolean } = {}
): Promise<string> {
  const { page } = session;
  // 首选：只截二维码本体并留白边（整卡截图缩到对话框里码会小到扫不出来）。
  // 二维码图片是异步加载的，首次截图前轮询等待它出现。
  try {
    const attempts = waitQr ? 8 : 1;
    let qr = null;
    for (let i = 0; i < attempts && !qr; i++) {
      qr = await locateQrBox(page);
      if (!qr && i < attempts - 1) await page.waitForTimeout(500).catch(() => {});
    }
    if (qr) {
      const buf = await page.screenshot({
        type: 'png',
        clip: clampClip(qr, Math.round(qr.width * 0.06))
      });
      return toDataUrl(buf);
    }
  } catch {
    /* fall through to card/full page */
  }
  try {
    const card = page.locator(LOGIN_CARD_SELECTOR).first();
    const box = await card.boundingBox().catch(() => null);
    if (box && box.width > 80 && box.height > 80) {
      const buf = await page.screenshot({
        type: 'png',
        clip: clampClip(box, 24)
      });
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
      viewport: { ...VIEWPORT },
      // 2 倍渲染密度：二维码截图像素翻倍，手机更容易识别
      deviceScaleFactor: 2,
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
    session.qrImage = await captureLoginScreenshot(session, {
      waitQr: true
    }).catch(() => '');
    session.lastQrAt = Date.now();
    this.sessions.set(sessionId, session);

    return { sessionId, qrImage: session.qrImage ?? '' };
  }

  async getSessionStatus(sessionId: string): Promise<{
    status: 'waiting_scan' | 'logged_in' | 'expired' | 'error';
    cookies?: string;
    qrImage?: string;
    pageImage?: string;
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
      // 整页实时画面：操作员据此远程处理滑块/验证码等二次验证交互
      let pageImage: string | undefined;
      if (now - (session.lastPageAt ?? 0) > PAGE_IMAGE_INTERVAL_MS) {
        pageImage = await capturePageImage(session);
        if (pageImage) session.lastPageAt = now;
      } else {
        pageImage = session.pageImage;
      }
      if (pageImage) session.pageImage = pageImage;
      return { status: 'waiting_scan', qrImage: session.qrImage, pageImage };
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

  // ── 远程交互：操作员在前端画面上点击/拖拽/输入，转发到无头页面执行 ──

  private resolveInteractiveSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { ok: false as const, error: '会话已过期或不存在' };
    }
    return { ok: true as const, session };
  }

  async clickAt(
    sessionId: string,
    x: number,
    y: number
  ): Promise<{ ok: boolean; error?: string }> {
    const r = this.resolveInteractiveSession(sessionId);
    if (!r.ok) return r;
    try {
      await r.session.page.mouse.click(x, y);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async typeText(
    sessionId: string,
    text: string
  ): Promise<{ ok: boolean; error?: string }> {
    const r = this.resolveInteractiveSession(sessionId);
    if (!r.ok) return r;
    if (!text) return { ok: false, error: '缺少输入内容' };
    try {
      // 输入到当前聚焦元素；操作员先点击画面中的输入框再发送
      await r.session.page.keyboard.type(text.slice(0, 200), { delay: 30 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async pressKey(
    sessionId: string,
    key: string
  ): Promise<{ ok: boolean; error?: string }> {
    const r = this.resolveInteractiveSession(sessionId);
    if (!r.ok) return r;
    const allowed = new Set([
      'Enter',
      'Backspace',
      'Escape',
      'Tab',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight'
    ]);
    if (!allowed.has(key)) return { ok: false, error: `不支持的按键: ${key}` };
    try {
      await r.session.page.keyboard.press(key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async drag(
    sessionId: string,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): Promise<{ ok: boolean; error?: string }> {
    const r = this.resolveInteractiveSession(sessionId);
    if (!r.ok) return r;
    try {
      // 滑块验证：按下 → 分步移动（模拟人手轨迹）→ 松开
      await r.session.page.mouse.move(from.x, from.y);
      await r.session.page.mouse.down();
      const steps = 25;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ease = 1 - Math.pow(1 - t, 2);
        await r.session.page.mouse.move(
          from.x + (to.x - from.x) * ease,
          from.y + (to.y - from.y) * ease + Math.sin(t * Math.PI) * 3
        );
        await r.session.page.waitForTimeout(8);
      }
      await r.session.page.mouse.up();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
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
