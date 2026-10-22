import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import {
  filterAuthorizationCookies,
  getPlatformAuthorizationAdapter
} from '@ai-growth-ops/shared';
import { BrowserBridgeClient } from './client.js';
import {
  assistantNotification,
  assertAllowedNavigation,
  defaultBrowserBridgeDataDirectory,
  resolveProfileDirectory,
  type AssistantNotificationKind,
  type BrowserBridgeArgs
} from './config.js';

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** .app 安装包内运行时没有终端，用系统通知反馈关键状态；CLI 运行时静默。 */
function notify(kind: AssistantNotificationKind, detail?: string): void {
  if (process.env.BROWSER_ASSISTANT_NOTIFY !== '1' || process.platform !== 'darwin') {
    return;
  }
  const { title, body } = assistantNotification(kind, detail);
  const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
  execFile(
    '/usr/bin/osascript',
    ['-e', script],
    () => {
      /* 通知失败不影响授权主流程 */
    }
  );
}

export async function runBrowserBridge(args: BrowserBridgeArgs): Promise<void> {
  const client = new BrowserBridgeClient(args);
  let context;
  try {
    const session = await client.claim();
    const adapter = getPlatformAuthorizationAdapter(session.platform);
    const profileDirectory = resolveProfileDirectory(
      defaultBrowserBridgeDataDirectory(),
      session.profileRef
    );
    await mkdir(profileDirectory, { recursive: true, mode: 0o700 });

    let unsafeRedirect: Error | null = null;
    context = await chromium.launchPersistentContext(profileDirectory, {
      channel: 'chrome',
      headless: false
    });
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      try {
        assertAllowedNavigation(frame.url(), session.allowedOrigins);
      } catch (error) {
        unsafeRedirect = error instanceof Error ? error : new Error('UNSAFE_REDIRECT');
      }
    });
    await page.goto(session.loginUrl, { waitUntil: 'domcontentloaded' });
    process.stdout.write('浏览器已打开，请在网页中完成扫码和验证。\n');
    notify('launched');

    let pollCount = 0;
    while (Date.now() < new Date(session.expiresAt).getTime()) {
      if (unsafeRedirect) throw unsafeRedirect;
      if (page.isClosed()) throw new Error('BROWSER_CLOSED');
      const cookies = await context.cookies();
      const cookieHeader = filterAuthorizationCookies(adapter, cookies);
      if (cookieHeader) {
        await client.complete(cookieHeader);
        process.stdout.write('授权完成，可以关闭此终端。\n');
        notify('completed');
        return;
      }
      pollCount += 1;
      if (pollCount % 4 === 0) await client.claim();
      await wait(1_500);
    }
    throw new Error('BRIDGE_SESSION_EXPIRED');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes('Executable')
      ? 'BROWSER_NOT_FOUND'
      : message.startsWith('UNSAFE_REDIRECT')
        ? 'UNSAFE_REDIRECT'
        : message;
    await client.fail(code, message.slice(0, 500)).catch(() => undefined);
    notify('failed', message);
    throw error;
  } finally {
    await context?.close().catch(() => undefined);
  }
}
