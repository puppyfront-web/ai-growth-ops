import type { Locator, Page } from 'playwright';
import { createStealthSession } from './browser-session.js';
import { reportPublishProgress } from './report-publish-progress.js';
import {
  clickWithVisionFallback,
  fillWithVisionFallback
} from './vision-assist.js';
import { pickImageFiles, pickVideoFile } from './media-files.js';

// 选择器与流程移植自 dreammis/social-auto-upload（MIT）
// uploader/xiaohongshu_uploader/main.py，2026-11 版本。
const PUBLISH_URL_BASE = 'https://creator.xiaohongshu.com/publish/publish';
const VIDEO_PUBLISH_URL = `${PUBLISH_URL_BASE}?from=homepage&target=video`;
const IMAGE_PUBLISH_URL = `${PUBLISH_URL_BASE}?from=homepage&target=image`;

const VIDEO_UPLOAD_SELECTOR = "div[class^='upload-content'] input.upload-input";
const VIDEO_UPLOAD_RETRY_SELECTOR =
  'div.progress-div [class^="upload-btn-input"]';
const IMAGE_UPLOAD_SELECTOR = 'input[type="file"][accept*="image"]';
const TITLE_SELECTOR = 'input[placeholder*="填写标题"]';
const CONTENT_EDITOR_SELECTOR = 'p[data-placeholder*="输入正文描述"]';
const TOPIC_CONTAINER_SELECTOR = '#creator-editor-topic-container';

const LOGIN_EXPIRED_MESSAGE =
  '小红书登录已失效，请在「集成 → 平台账号」重新扫码登录';

// worker 侧总超时为 5 分钟，上传等待必须留出填写与提交时间。
const VIDEO_UPLOAD_DEADLINE_MS = 240_000;
const IMAGE_UPLOAD_DEADLINE_MS = 120_000;
const XHS_TITLE_LIMIT = 20;
const XHS_TOPIC_LIMIT = 10;

export type XhsPublishInput = {
  publishJobId?: string;
  cookie: string;
  contentType: string;
  title: string;
  content: string;
  tags?: string[];
  mediaFilePaths?: string[];
};

export type XhsPublishResult = {
  success: boolean;
  externalPostId?: string;
  externalUrl?: string;
  errorMessage?: string;
};

// ── 纯函数（供单测）──────────────────────────────────────────────

const UPLOAD_COMPLETE_MARKERS = [
  '上传成功',
  '分辨率',
  '重新上传',
  '编辑封面',
  '已上传',
  '已选择',
  '100%'
];

export function isXhsUploadCompleteText(text: string): boolean {
  const trimmed = text.trim();
  return UPLOAD_COMPLETE_MARKERS.some((marker) => trimmed.includes(marker));
}

export function truncateXhsTitle(title: string): string {
  return title.slice(0, XHS_TITLE_LIMIT);
}

export function isXhsPublishSuccessUrl(url: string): boolean {
  try {
    return new URL(url).pathname === '/publish/success';
  } catch {
    return false;
  }
}

export type XhsMediaPlan =
  | { kind: 'video'; videoPath: string }
  | { kind: 'images'; imagePaths: string[] }
  | { kind: 'error'; error: string };

export function resolveXhsMedia(
  contentType: string,
  mediaFilePaths: string[]
): XhsMediaPlan {
  const paths = mediaFilePaths ?? [];

  if (contentType === 'video' || pickVideoFile(paths)) {
    const videoPath = pickVideoFile(paths);
    if (!videoPath) {
      return {
        kind: 'error',
        error: '小红书视频发布需要上传 mp4/mov 等视频文件，请先在素材库添加视频'
      };
    }
    return { kind: 'video', videoPath };
  }

  if (contentType === 'text_image' || pickImageFiles(paths).length > 0) {
    const imagePaths = pickImageFiles(paths);
    if (imagePaths.length === 0) {
      return {
        kind: 'error',
        error: '小红书图文发布需要至少一张图片素材；纯文字暂不支持自动发布'
      };
    }
    return { kind: 'images', imagePaths };
  }

  return {
    kind: 'error',
    error: '小红书浏览器发布需要视频或图片素材，请为内容关联素材后重试'
  };
}

// ── 页面流 ──────────────────────────────────────────────────────

function modKey(): string {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

async function isXhsLoginExpired(page: Page): Promise<boolean> {
  if (page.url().includes('/login')) return true;
  return page
    .locator("div[class*='login-box']")
    .first()
    .isVisible()
    .catch(() => false);
}

async function assertXhsLoggedIn(page: Page): Promise<void> {
  await page.waitForTimeout(2_000);
  if (await isXhsLoginExpired(page)) {
    throw new Error(LOGIN_EXPIRED_MESSAGE);
  }
}

async function waitXhsUploadInput(
  page: Page,
  selector: string,
  timeoutMs = 30_000
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const input = page.locator(selector).first();
    if ((await input.count()) > 0) {
      await input
        .waitFor({ state: 'attached', timeout: 5_000 })
        .catch(() => undefined);
      return input;
    }
    if (await isXhsLoginExpired(page)) {
      throw new Error(LOGIN_EXPIRED_MESSAGE);
    }
    await page.waitForTimeout(500);
  }
  throw new Error('未找到小红书上传控件，请确认创作者账号权限');
}

async function findXhsImageUploadInput(page: Page): Promise<Locator> {
  const imageInput = page.locator(IMAGE_UPLOAD_SELECTOR).first();
  if ((await imageInput.count()) > 0) return imageInput;
  return waitXhsUploadInput(page, VIDEO_UPLOAD_SELECTOR);
}

async function waitForXhsVideoUploadComplete(
  page: Page,
  videoPath: string
): Promise<void> {
  const deadline = Date.now() + VIDEO_UPLOAD_DEADLINE_MS;
  const titleInput = page.locator(TITLE_SELECTOR).first();

  while (Date.now() < deadline) {
    if (await isXhsLoginExpired(page)) {
      throw new Error(LOGIN_EXPIRED_MESSAGE);
    }

    const preview = page
      .locator(VIDEO_UPLOAD_SELECTOR)
      .first()
      .locator(
        'xpath=following-sibling::div[contains(@class, "preview-new")]'
      );
    const previewCount = await preview.count().catch(() => 0);
    for (let i = 0; i < previewCount; i++) {
      const text = await preview.nth(i).innerText().catch(() => '');
      if (text.includes('上传失败')) {
        await page
          .locator(VIDEO_UPLOAD_RETRY_SELECTOR)
          .first()
          .setInputFiles(videoPath)
          .catch(() => undefined);
        break;
      }
      if (isXhsUploadCompleteText(text)) return;
    }

    // 兜底：上传完成后页面进入编辑表单，标题框可见即可继续填写。
    if (await titleInput.isVisible().catch(() => false)) return;

    await page.waitForTimeout(2_000);
  }
  throw new Error('小红书视频上传超时');
}

async function waitForXhsImagesReady(page: Page): Promise<void> {
  const deadline = Date.now() + IMAGE_UPLOAD_DEADLINE_MS;
  const titleInput = page.locator(TITLE_SELECTOR).first();
  while (Date.now() < deadline) {
    if (await isXhsLoginExpired(page)) {
      throw new Error(LOGIN_EXPIRED_MESSAGE);
    }
    if (await titleInput.isVisible().catch(() => false)) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error('小红书图片上传超时');
}

async function fillXhsTitle(page: Page, title: string): Promise<void> {
  const truncated = truncateXhsTitle(title || '');
  if (!truncated) return;
  // 小红书标题为可选项：定位失败不阻断发布（正文才是核心内容）。
  await fillWithVisionFallback(
    page,
    page.locator(TITLE_SELECTOR).first(),
    '小红书标题输入框(填写标题会有更多曝光)',
    truncated,
    { timeout: 8_000 }
  );
}

async function typeXhsContent(page: Page, content: string): Promise<void> {
  const editor = page.locator(CONTENT_EDITOR_SELECTOR).first();
  await editor.waitFor({ state: 'visible', timeout: 8_000 });
  const clicked = await clickWithVisionFallback(
    page,
    editor,
    '小红书正文编辑器(输入正文描述)',
    { timeout: 8_000 }
  );
  if (!clicked) {
    throw new Error('未找到小红书正文编辑区');
  }
  const mod = modKey();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press('Delete');
  if (content.trim()) {
    await page.keyboard.type(content);
    await page.keyboard.press('Enter');
  }
}

async function typeXhsTopics(page: Page, tags: string[]): Promise<void> {
  for (const raw of tags.slice(0, XHS_TOPIC_LIMIT)) {
    const tag = raw.replace(/^#/, '').trim();
    if (!tag) continue;
    const typed = `#${tag}`;
    try {
      await page.keyboard.type(typed, { delay: 30 });
      const firstItem = page
        .locator(TOPIC_CONTAINER_SELECTOR)
        .locator('.item')
        .first();
      await firstItem.waitFor({ state: 'visible', timeout: 4_000 });
      await firstItem.click({ timeout: 2_000 });
      await page.waitForTimeout(300);
    } catch {
      // 候选未出现：回删残留文本并跳过该话题，不中断发布。
      for (let i = 0; i < typed.length; i++) {
        await page.keyboard.press('Backspace');
      }
    }
  }
}

async function fillXhsMeta(
  page: Page,
  input: XhsPublishInput
): Promise<void> {
  await fillXhsTitle(page, input.title);
  await typeXhsContent(page, input.content);
  await typeXhsTopics(page, input.tags ?? []);
}

async function clickXhsPublish(page: Page): Promise<{ postUrl: string }> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isXhsLoginExpired(page)) {
      throw new Error(LOGIN_EXPIRED_MESSAGE);
    }

    // 精确匹配优先，避免误点「定时发布」。
    const candidates = [
      page.getByRole('button', { name: '发布', exact: true }).first(),
      page.locator('button:has-text("发布")').first()
    ];
    for (const btn of candidates) {
      if ((await btn.count().catch(() => 0)) === 0) continue;
      const clicked = await clickWithVisionFallback(
        page,
        btn,
        '发布按钮(小红书创作者中心,用于提交发布笔记)',
        { timeout: 10_000 }
      );
      if (!clicked) continue;
      try {
        await page.waitForURL('**/publish/success**', { timeout: 10_000 });
        return { postUrl: page.url() };
      } catch {
        await page.waitForTimeout(2_000);
        if (isXhsPublishSuccessUrl(page.url())) {
          return { postUrl: page.url() };
        }
        break; // 按钮点击未生效（如上传未完成禁用态），回到外层重试
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error('点击小红书发布按钮超时');
}

async function publishXhsVideo(
  page: Page,
  input: XhsPublishInput,
  videoPath: string
): Promise<{ postUrl: string }> {
  await reportPublishProgress(
    input.publishJobId,
    'browser_page',
    '打开小红书视频发布页…'
  );
  await page.goto(VIDEO_PUBLISH_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await assertXhsLoggedIn(page);

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '上传视频文件…'
  );
  const uploadInput = await waitXhsUploadInput(page, VIDEO_UPLOAD_SELECTOR);
  await uploadInput.setInputFiles(videoPath);

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '等待视频上传完成…'
  );
  await waitForXhsVideoUploadComplete(page, videoPath);

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '填写标题、正文与话题…'
  );
  await fillXhsMeta(page, input);

  await reportPublishProgress(input.publishJobId, 'browser_submit', '提交发布…');
  return clickXhsPublish(page);
}

async function publishXhsImages(
  page: Page,
  input: XhsPublishInput,
  imagePaths: string[]
): Promise<{ postUrl: string }> {
  await reportPublishProgress(
    input.publishJobId,
    'browser_page',
    '打开小红书图文发布页…'
  );
  await page.goto(IMAGE_PUBLISH_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await assertXhsLoggedIn(page);

  await reportPublishProgress(input.publishJobId, 'browser_fill', '上传图片…');
  const uploadInput = await findXhsImageUploadInput(page);
  await uploadInput.setInputFiles(imagePaths);

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '等待图片上传完成…'
  );
  await waitForXhsImagesReady(page);

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '填写标题、正文与话题…'
  );
  await fillXhsMeta(page, input);

  await reportPublishProgress(input.publishJobId, 'browser_submit', '提交发布…');
  return clickXhsPublish(page);
}

function extractXhsPostId(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(
      /\/(explore|discovery\/item)\/([a-f0-9]+)/i
    );
    return match ? match[2] : null;
  } catch {
    return null;
  }
}

export async function publishXiaohongshu(
  input: XhsPublishInput
): Promise<XhsPublishResult> {
  const plan = resolveXhsMedia(input.contentType, input.mediaFilePaths ?? []);
  if (plan.kind === 'error') {
    return { success: false, errorMessage: plan.error };
  }

  const session = await createStealthSession(input.cookie, 'xiaohongshu.com');
  try {
    await reportPublishProgress(input.publishJobId, 'browser_launch');

    const result =
      plan.kind === 'video'
        ? await publishXhsVideo(session.page, input, plan.videoPath)
        : await publishXhsImages(session.page, input, plan.imagePaths);

    await reportPublishProgress(input.publishJobId, 'done');
    return {
      success: true,
      externalPostId: extractXhsPostId(result.postUrl) ?? undefined,
      externalUrl: result.postUrl
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : '小红书发布失败';
    await reportPublishProgress(input.publishJobId, 'failed', errorMessage);
    return { success: false, errorMessage };
  } finally {
    await session.close();
  }
}
