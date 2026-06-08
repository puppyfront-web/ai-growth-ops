import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import type { RouteHandler, Route } from './routes.js';
import { reportPublishProgress } from './report-publish-progress.js';
import { createHeadlessSession } from './browser-session.js';
import { publishDouyin } from './douyin-publish.js';

// ── Platform publish page URLs ──────────────────────────────────

const PUBLISH_PAGE_URLS: Record<string, () => string> = {
  douyin: () => 'https://creator.douyin.com/creator-micro/content/upload',
  xiaohongshu: () => 'https://creator.xiaohongshu.com/publish/publish',
  wechat_official: () => 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&isNew=1&type=10&action=edit',
  wechat_channels: () => 'https://channels.weixin.qq.com/platform/post/create',
  baijiahao: () => 'https://baijiahao.baidu.com/builder/rc/edit',
  zhihu: () => 'https://www.zhihu.com/creator/publish',
};

// ── Platform publish selectors ──────────────────────────────────

interface PublishSelectors {
  titleInput: string;
  contentInput: string;
  uploadButton: string;
  submitButton: string;
  tagInput?: string;
}

const PUBLISH_SELECTORS: Record<string, PublishSelectors> = {
  douyin: {
    titleInput: 'input[placeholder*="标题"], input[placeholder*="title"], [class*="title-input"]',
    contentInput: 'textarea, [contenteditable="true"], [class*="editor"], .ql-editor, .ProseMirror',
    uploadButton: 'input[type="file"], [class*="upload"], [class*="add-image"]',
    submitButton: 'button:has-text("发布"), button:has-text("发表"), [class*="publish-btn"]',
  },
  xiaohongshu: {
    titleInput: 'input[placeholder*="标题"], input[placeholder*="title"], [class*="title-input"]',
    contentInput: 'textarea, [contenteditable="true"], [class*="editor"], .ql-editor, .c-input_inner',
    uploadButton: 'input[type="file"], [class*="upload"], [class*="add-image"]',
    submitButton: 'button:has-text("发布"), button:has-text("发表"), [class*="publish-btn"]',
    tagInput: 'input[placeholder*="标签"], input[placeholder*="tag"], [class*="tag-input"]',
  },
  wechat_official: {
    titleInput: 'input[placeholder*="标题"], input[maxlength], #title, [class*="title"]',
    contentInput: 'textarea, [contenteditable="true"], .ql-editor, .ProseMirror, iframe',
    uploadButton: 'input[type="file"], [class*="upload"]',
    submitButton: 'button:has-text("保存并群发"), button:has-text("保存"), button:has-text("发表"), [class*="publish"]',
  },
  wechat_channels: {
    titleInput: 'input[placeholder*="标题"], [class*="title-input"]',
    contentInput: 'textarea, [contenteditable="true"], [class*="editor"]',
    uploadButton: 'input[type="file"], [class*="upload"]',
    submitButton: 'button:has-text("发布"), button:has-text("发表")',
  },
  baijiahao: {
    titleInput: 'input[placeholder*="标题"], [class*="title"], #title',
    contentInput: 'textarea, [contenteditable="true"], [class*="editor"], .ql-editor, #editor',
    uploadButton: 'input[type="file"], [class*="upload"]',
    submitButton: 'button:has-text("发布"), button:has-text("提交"), [class*="submit"]',
  },
  zhihu: {
    titleInput: 'input[placeholder*="标题"], input[placeholder*="title"], [class*="title"]',
    contentInput: 'textarea, [contenteditable="true"], [class*="editor"], .ProseMirror, .public-DraftEditor-content',
    uploadButton: 'input[type="file"], [class*="upload"]',
    submitButton: 'button:has-text("发布"), button:has-text("发表"), button[type="submit"]',
  },
};

// ── Media Upload Helper ──────────────────────────────────────────

async function uploadMediaFiles(
  page: import('playwright').Page,
  selectors: PublishSelectors,
  mediaFilePaths: string[],
  publishJobId: string | undefined,
  platform: string,
) {
  await reportPublishProgress(publishJobId, 'browser_fill', '正在上传媒体文件…');

  try {
    // Check if there's a hidden file input
    const fileInput = page.locator('input[type="file"]').first();
    const hasFileInput = await fileInput.count() > 0;

    if (hasFileInput) {
      // Direct file input — set files directly
      await fileInput.setInputFiles(mediaFilePaths);
      await page.waitForTimeout(3000); // Wait for upload to process
    } else {
      // Click upload button to trigger file chooser
      const uploadSelector = selectors.uploadButton;
      const uploadElement = page.locator(uploadSelector).first();

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        uploadElement.click(),
      ]);
      await fileChooser.setFiles(mediaFilePaths);
      await page.waitForTimeout(3000);
    }

    // Wait for upload completion indicators
    try {
      await page.waitForFunction(() => {
        // Check if upload progress indicators have disappeared
        const progressBars = document.querySelectorAll('[class*="progress"], [class*="uploading"]');
        return progressBars.length === 0;
      }, { timeout: 30000 }).catch(() => {});
    } catch {
      // Timeout is OK — upload may have completed already
    }
  } catch (uploadErr) {
    console.error(`[publish] Media upload failed for ${platform}:`, uploadErr);
    // Don't fail the entire publish — continue without media
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseCookieString(cookie: string): Array<{ name: string; value: string; domain: string; path: string }> {
  return cookie.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain: '', path: '/' };
  }).filter((c) => c.name.length > 0);
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

async function createHeadlessContext(cookie: string, targetDomain: string) {
  const siteDomain = targetDomain.replace(/^creator\./, '').replace(/^www\./, '');
  const session = await createHeadlessSession(cookie, siteDomain.includes('.') ? siteDomain : `.${siteDomain}`);
  return {
    context: session.context,
    page: session.page,
    close: session.close,
  };
}

// ── Publish Content Handler ─────────────────────────────────────

interface PublishContentBody {
  publishJobId?: string;
  platform: string;
  cookie: string;
  contentType: string;
  title?: string;
  content: string;
  tags?: string[];
  mediaUrls?: string[];
  mediaFilePaths?: string[];
}

const handlePublishContent: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as PublishContentBody | null;
  if (!body?.platform || !body?.cookie || !body?.content) {
    sendJson(res, 400, { error: 'Missing platform, cookie, or content' });
    return;
  }

  const urlFn = PUBLISH_PAGE_URLS[body.platform];
  const selectors = PUBLISH_SELECTORS[body.platform];
  if (!urlFn || !selectors) {
    sendJson(res, 400, { error: `Unsupported platform for publishing: ${body.platform}` });
    return;
  }

  if (body.platform === 'douyin') {
    const result = await publishDouyin({
      publishJobId: body.publishJobId,
      cookie: body.cookie,
      contentType: body.contentType,
      title: body.title || '',
      content: body.content,
      tags: body.tags,
      mediaFilePaths: body.mediaFilePaths ?? body.mediaUrls,
    });
    sendJson(res, 200, result);
    return;
  }

  const targetUrl = urlFn();
  const domain = extractDomain(targetUrl);

  let session: Awaited<ReturnType<typeof createHeadlessContext>> | null = null;
  try {
    await reportPublishProgress(body.publishJobId, 'browser_launch');
    session = await createHeadlessContext(body.cookie, domain);
    const { page } = session;

    await reportPublishProgress(body.publishJobId, 'browser_page', '正在打开创作者发布页…');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // ── Platform-specific ordering ──────────────────────────────────
    // Xiaohongshu requires images to be uploaded BEFORE filling text.
    // All other platforms: fill text first, then upload media.

    const hasMedia = body.mediaFilePaths?.length && body.mediaFilePaths.length > 0;

    if (body.platform === 'xiaohongshu' && hasMedia) {
      // XHS: Upload media FIRST, then fill text
      await uploadMediaFiles(page, selectors, body.mediaFilePaths!, body.publishJobId, body.platform);

      await reportPublishProgress(body.publishJobId, 'browser_fill', '正在填写标题与正文…');
      // Fill title
      if (body.title) {
        const titleInput = page.locator(selectors.titleInput).first();
        try {
          await titleInput.click({ timeout: 5000 });
          await titleInput.fill(body.title);
        } catch {
          // Title input may not be available for all content types
        }
      }

      // Fill content
      const contentInput = page.locator(selectors.contentInput).first();
      await contentInput.click({ timeout: 5000 });
      await contentInput.fill(body.content);
    } else {
      // All other platforms: Fill text first, then upload media
      await reportPublishProgress(body.publishJobId, 'browser_fill', '正在填写标题与正文…');
      // Fill title if provided and selector exists
      if (body.title) {
        const titleInput = page.locator(selectors.titleInput).first();
        try {
          await titleInput.click({ timeout: 5000 });
          await titleInput.fill(body.title);
        } catch {
          // Title input may not be available for all content types
        }
      }

      // Fill content
      const contentInput = page.locator(selectors.contentInput).first();
      await contentInput.click({ timeout: 5000 });
      await contentInput.fill(body.content);

      // Upload media files if provided (non-Douyin platforms)
      if (hasMedia) {
        await uploadMediaFiles(page, selectors, body.mediaFilePaths!, body.publishJobId, body.platform);
      }
    }

    // Add tags if supported
    if (body.tags?.length && selectors.tagInput) {
      const tagInput = page.locator(selectors.tagInput).first();
      for (const tag of body.tags.slice(0, 5)) {
        try {
          await tagInput.click({ timeout: 2000 });
          await tagInput.fill(tag);
          await page.keyboard.press('Enter');
        } catch { /* */ }
      }
    }

    await reportPublishProgress(body.publishJobId, 'browser_submit', '正在点击发布按钮…');
    const submitBtn = page.locator(selectors.submitButton).first();
    await submitBtn.click({ timeout: 5000 });

    // Wait for navigation or confirmation
    await page.waitForTimeout(3000);

    const postId = `pub-${Date.now()}-${randomUUID().slice(0, 6)}`;

    sendJson(res, 200, {
      success: true,
      externalPostId: postId,
      status: 'published',
      externalUrl: page.url(),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during publish';
    await reportPublishProgress(body.publishJobId, 'failed', errorMessage);
    sendJson(res, 200, {
      success: false,
      errorMessage,
    });
  } finally {
    await session?.close();
  }
};

// ── Check Publish Status Handler ────────────────────────────────

interface CheckPublishStatusBody {
  platform: string;
  cookie: string;
  contentManagementUrl?: string;
  externalPostId?: string;
}

const handleCheckPublishStatus: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as CheckPublishStatusBody | null;
  if (!body?.platform || !body?.cookie) {
    sendJson(res, 400, { error: 'Missing platform or cookie' });
    return;
  }

  // Navigate to content management page and check status
  const managementUrls: Record<string, () => string> = {
    douyin: () => 'https://creator.douyin.com/creator-micro/content/manage',
    xiaohongshu: () => 'https://creator.xiaohongshu.com/publish/publish?source=official',
    wechat_official: () => 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish?action=list&begin=0&count=10&t=media/appmsg_list_v2',
    wechat_channels: () => 'https://channels.weixin.qq.com/platform/post',
    baijiahao: () => 'https://baijiahao.baidu.com/builder/rc/edit?type=article',
    zhihu: () => 'https://www.zhihu.com/creator/content',
  };

  const targetUrl = body.contentManagementUrl || managementUrls[body.platform]?.();
  if (!targetUrl) {
    sendJson(res, 200, { status: 'unknown', message: 'No management URL for this platform' });
    return;
  }

  const domain = extractDomain(targetUrl);
  let session: Awaited<ReturnType<typeof createHeadlessContext>> | null = null;
  try {
    session = await createHeadlessContext(body.cookie, domain);
    const { page } = session;

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Try to find the post and its status
    const statusInfo = await page.evaluate((postId) => {
      // Look for content status indicators
      const statusMap: Record<string, string> = {
        '已发布': 'published',
        '审核中': 'pending_review',
        '审核不通过': 'rejected',
        '已删除': 'deleted',
        'published': 'published',
        'pending': 'pending_review',
        'rejected': 'rejected',
      };

      const allText = document.body.innerText;
      for (const [key, value] of Object.entries(statusMap)) {
        if (allText.includes(key)) return { status: value };
      }
      return { status: 'unknown' };
    }, body.externalPostId);

    sendJson(res, 200, statusInfo);
  } catch (err) {
    sendJson(res, 200, { status: 'unknown', errorMessage: err instanceof Error ? err.message : 'Check failed' });
  } finally {
    await session?.close();
  }
};

// ── Exported route array ────────────────────────────────────────

export const publishAssistRoutes: Route[] = [
  { method: 'POST', pattern: '/assist/publish', handler: handlePublishContent },
  { method: 'POST', pattern: '/assist/check-publish-status', handler: handleCheckPublishStatus },
];
