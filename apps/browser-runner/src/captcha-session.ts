import { randomUUID } from 'node:crypto';
import { createStealthSession } from './browser-session.js';
import { detectCaptcha } from './captcha-detect.js';

const SESSION_TIMEOUT_MS = 180_000;
const SOLVE_GRACE_MS = 8_000;

type CaptchaSession = {
  sessionId: string;
  close: () => Promise<void>;
  page: import('playwright').Page;
  createdAt: number;
  solved?: boolean;
  sawCaptcha?: boolean;
};

const sessions = new Map<string, CaptchaSession>();

export async function startCaptchaSession(input: {
  cookie: string;
  platform: string;
}): Promise<{ sessionId: string }> {
  const domain = 'douyin.com';
  const home = 'https://www.douyin.com/';
  const stealth = await createStealthSession(input.cookie, domain, true);
  await stealth.page.goto(home, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  });
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    sessionId,
    close: stealth.close,
    page: stealth.page,
    createdAt: Date.now()
  });
  return { sessionId };
}

export async function getCaptchaSessionStatus(sessionId: string): Promise<{
  status: 'waiting' | 'solved' | 'expired';
  error?: string;
}> {
  const session = sessions.get(sessionId);
  if (!session) return { status: 'expired', error: '过码会话不存在或已关闭' };
  if (session.solved) return { status: 'solved' };
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    await cancelCaptchaSession(sessionId);
    return { status: 'expired', error: '过码超时，请重新打开浏览器窗口' };
  }
  const blocked = await detectCaptcha(session.page).catch(() => true);
  if (blocked) {
    session.sawCaptcha = true;
    return { status: 'waiting' };
  }
  const waitedLongEnough = Date.now() - session.createdAt >= SOLVE_GRACE_MS;
  if (session.sawCaptcha || waitedLongEnough) {
    session.solved = true;
    await cancelCaptchaSession(sessionId);
    return { status: 'solved' };
  }
  return { status: 'waiting' };
}

export async function cancelCaptchaSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  await session.close().catch(() => undefined);
}
