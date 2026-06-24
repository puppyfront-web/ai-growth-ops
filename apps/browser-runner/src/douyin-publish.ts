import { existsSync } from 'node:fs';
import type { Page } from 'playwright';
import { createHeadlessSession } from './browser-session.js';
import { reportPublishProgress } from './report-publish-progress.js';
import { clickWithVisionFallback } from './vision-assist.js';

const UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';
const MANAGE_PATTERN =
  'https://creator.douyin.com/creator-micro/content/manage**';

export type DouyinPublishInput = {
  publishJobId?: string;
  cookie: string;
  contentType: string;
  title: string;
  content: string;
  tags?: string[];
  mediaFilePaths?: string[];
};

export type DouyinPublishResult = {
  success: boolean;
  externalPostId?: string;
  externalUrl?: string;
  errorMessage?: string;
};

function modKey(): string {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

async function isLoginOverlay(page: Page): Promise<boolean> {
  if (
    await page
      .getByRole('textbox', { name: '请输入手机号' })
      .isVisible()
      .catch(() => false)
  )
    return true;
  return page
    .getByText('扫码登录', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);
}

async function fillTitleAndDescription(
  page: Page,
  title: string,
  description: string,
  tags: string[]
): Promise<void> {
  const section = page
    .getByText('作品描述', { exact: true })
    .locator('xpath=ancestor::div[2]')
    .locator('xpath=following-sibling::div[1]');

  const titleInput = section.locator('input[type="text"]').first();
  await titleInput.waitFor({ state: 'visible', timeout: 15_000 });
  await titleInput.fill(title.slice(0, 30));

  const editor = section
    .locator('.zone-container[contenteditable="true"]')
    .first();
  await editor.waitFor({ state: 'visible', timeout: 15_000 });
  await editor.click();
  const mod = modKey();
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press('Delete');
  await page.keyboard.type(description);

  for (const tag of tags.slice(0, 5)) {
    await page.keyboard.type(` #${tag.replace(/^#/, '')}`);
    await page.keyboard.press('Space');
  }
}

async function waitForPublishPage(page: Page): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes('/content/publish') || url.includes('/content/post/video'))
      return;
    await page.waitForTimeout(500);
  }
  throw new Error('等待进入抖音发布编辑页超时');
}

async function waitForUploadFileInput(page: Page): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if ((await page.locator('input[type="file"]').count()) > 0) {
      await page
        .locator('input[type="file"]')
        .first()
        .waitFor({ state: 'attached', timeout: 5000 });
      return;
    }
    if (await isLoginOverlay(page)) {
      throw new Error('抖音登录已失效，请在「集成 → 平台账号」重新扫码登录');
    }
    await page.waitForTimeout(500);
  }
  throw new Error('未找到视频/图片上传控件，请确认创作者账号权限');
}

async function waitForUploadComplete(
  page: Page,
  filePath: string
): Promise<void> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const reupload = await page
      .locator('[class^="long-card"] div:has-text("重新上传")')
      .count();
    if (reupload > 0) return;
    const failed = await page
      .locator('div.progress-div > div:has-text("上传失败")')
      .count();
    if (failed > 0) {
      await page
        .locator('div.progress-div input[type="file"]')
        .first()
        .setInputFiles(filePath)
        .catch(() => {
          return page
            .locator('input[type="file"]')
            .first()
            .setInputFiles(filePath);
        });
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('视频上传超时');
}

async function handleAutoCover(page: Page): Promise<void> {
  const hint = page.getByText('请设置封面后再发布').first();
  if (!(await hint.isVisible().catch(() => false))) return;
  const rec = page.locator('[class^="recommendCover-"]').first();
  if ((await rec.count()) === 0) return;
  try {
    await rec.click();
    await page.waitForTimeout(1000);
    const confirm = page.getByText('是否确认应用此封面？').first();
    if (await confirm.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: '确定' }).click();
      await page.waitForTimeout(1000);
    }
  } catch {
    /* best effort */
  }
}

async function waitForSecondVerifyIfHeaded(page: Page): Promise<boolean> {
  const overlay = page.locator('#uc-second-verify, .second-verify-mask');
  if (!(await overlay.isVisible().catch(() => false))) return false;
  if (process.env.BROWSER_RUNNER_HEADED !== 'true') return false;

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (!(await overlay.isVisible().catch(() => false))) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function handleDeclarationModal(page: Page): Promise<boolean> {
  const title = page.getByText('未添加自主声明', { exact: true }).first();
  if (!(await title.isVisible().catch(() => false))) return false;

  const directPublishButton = page
    .getByRole('button', { name: '直接发布', exact: true })
    .first();
  await directPublishButton.waitFor({ state: 'visible', timeout: 5_000 });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const disabled = await directPublishButton.isDisabled().catch(() => false);
    if (!disabled) {
      await directPublishButton.click({ timeout: 5_000 });
      await page.waitForTimeout(1_000);
      return true;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(
    '抖音出现“未添加自主声明”弹窗，但“直接发布”按钮长时间不可点击，请人工确认声明设置'
  );
}

async function clickPublish(
  page: Page
): Promise<{ postId: string | null; postUrl: string }> {
  const deadline = Date.now() + 120_000;
  let declarationHandled = false;
  while (Date.now() < deadline) {
    if (
      await page
        .locator('#uc-second-verify, .second-verify-mask')
        .isVisible()
        .catch(() => false)
    ) {
      const verified = await waitForSecondVerifyIfHeaded(page);
      if (verified) continue;
      throw new Error(
        '抖音要求二次安全验证（扫码/短信）。请用有界面浏览器登录创作者中心完成验证，或设置 BROWSER_RUNNER_HEADED=true 后重试并在弹出的窗口中完成验证'
      );
    }

    const btn = page.getByRole('button', { name: '发布', exact: true });
    if ((await btn.count()) > 0) {
      // Click via the selector; if the hashed class/name drifted, fall back to
      // a vision model that looks at a screenshot and returns the click point.
      const clicked = await clickWithVisionFallback(
        page,
        btn,
        '发布按钮(抖音创作者中心,用于提交发布作品)',
        { timeout: 10_000 }
      );
      if (!clicked) continue;
      const declarationVisible = await page
        .getByText('未添加自主声明', { exact: true })
        .first()
        .isVisible()
        .catch(() => false);
      if (declarationVisible && (await handleDeclarationModal(page))) {
        if (declarationHandled) {
          throw new Error(
            '抖音“未添加自主声明”弹窗重复出现，已停止重试以避免死循环，请人工确认发布配置'
          );
        }
        declarationHandled = true;
      }
      try {
        await page.waitForURL(MANAGE_PATTERN, { timeout: 15_000 });
      } catch {
        await page.waitForTimeout(2000);
        if (!page.url().includes('/content/manage')) {
          await page.waitForTimeout(500);
          continue;
        }
      }
      // Try to extract the first post ID from the manage page.
      // The manage page renders the work list via an XHR (work_list) whose
      // JSON payload carries item_id — DOM attributes no longer expose it, so
      // intercept the API response instead. Large IDs are quoted to avoid
      // Number precision loss (see parseJsonBigInt in assist-routes).
      const manageUrl = page.url();
      let postId: string | null = null;
      try {
        const workListPromise = page
          .waitForResponse(
            (r) =>
              /work_list|\/item\/list|\/creator\/item\/list/.test(r.url()) &&
              (r.headers()['content-type'] || '').includes('json'),
            { timeout: 10_000 }
          )
          .catch(() => null);

        // Trigger list load by settling on the page.
        await page.waitForTimeout(2000);

        const workListResp = await workListPromise;
        if (workListResp) {
          const raw = await workListResp.text();
          // Quote ≥16-digit integer literals so item_id survives parsing.
          const safe = raw.replace(
            /(?<=[:\[,]\s*)-?\d{16,}(?=\s*[,\]\}])/g,
            (m) => `"${m}"`
          );
          const json = JSON.parse(safe) as Record<string, unknown>;
          const list = (json.aweme_list ?? json.items ?? json.list ?? []) as Array<
            Record<string, unknown>
          >;
          const first = Array.isArray(list) ? list[0] : undefined;
          const id = first?.item_id ?? first?.aweme_id ?? first?.video_id;
          if (id != null) postId = String(id);
        }
      } catch {
        /* best effort — publish itself already succeeded */
      }
      return { postId, postUrl: manageUrl };
    }
    await handleAutoCover(page);
    await page.waitForTimeout(500);
  }
  throw new Error('点击发布按钮超时');
}

async function tryOpenImagePostTab(page: Page): Promise<boolean> {
  const imageUrls = [
    'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
    'https://creator.douyin.com/creator-micro/content/upload/image'
  ];
  for (const url of imageUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2000);
      if ((await page.locator('input[type="file"]').count()) > 0) return true;
    } catch {
      /* try next */
    }
  }

  await page.goto(UPLOAD_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await page.waitForTimeout(2000);

  for (const label of ['发布图文', '图文创作', '图文', '图片']) {
    const tab = page.getByRole('tab', { name: label }).first();
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(2000);
      return true;
    }
    const text = page.getByText(label, { exact: true }).first();
    if (await text.isVisible().catch(() => false)) {
      await text.click();
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

async function publishDouyinVideo(
  page: Page,
  input: DouyinPublishInput,
  videoPath: string
): Promise<{ postId: string | null; postUrl: string }> {
  await reportPublishProgress(
    input.publishJobId,
    'browser_page',
    '打开抖音视频上传页…'
  );
  await page.goto(UPLOAD_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForTimeout(3000);

  if (await isLoginOverlay(page)) {
    throw new Error('抖音登录已失效，请在「集成 → 平台账号」重新扫码登录');
  }

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '上传视频文件…'
  );
  await waitForUploadFileInput(page);
  await page.locator('input[type="file"]').first().setInputFiles(videoPath);
  await waitForPublishPage(page);
  await page.waitForTimeout(1000);

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '填写标题与作品描述…'
  );
  const desc = input.content || input.title;
  await fillTitleAndDescription(page, input.title, desc, input.tags ?? []);

  await reportPublishProgress(
    input.publishJobId,
    'browser_submit',
    '等待视频上传完成…'
  );
  await waitForUploadComplete(page, videoPath);

  await reportPublishProgress(
    input.publishJobId,
    'browser_submit',
    '提交发布…'
  );
  return clickPublish(page);
}

async function publishDouyinImages(
  page: Page,
  input: DouyinPublishInput,
  imagePaths: string[]
): Promise<{ postId: string | null; postUrl: string }> {
  await reportPublishProgress(
    input.publishJobId,
    'browser_page',
    '打开抖音创作者上传页…'
  );
  await page.goto(UPLOAD_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  await page.waitForTimeout(3000);

  if (await isLoginOverlay(page)) {
    throw new Error('抖音登录已失效，请在「集成 → 平台账号」重新扫码登录');
  }

  const onImageTab = await tryOpenImagePostTab(page);

  await reportPublishProgress(input.publishJobId, 'browser_fill', '上传图片…');
  await waitForUploadFileInput(page);
  const fileInput = page.locator('input[type="file"]').first();
  if (imagePaths.length === 1) {
    await fileInput.setInputFiles(imagePaths[0]);
  } else {
    await fileInput.setInputFiles(imagePaths);
  }

  await page.waitForTimeout(2000);

  // 图文上传后常会进入与视频相同的发布编辑页（含「作品描述」）
  try {
    await waitForPublishPage(page);
  } catch {
    /* 部分账号停留在当前页，继续尝试填写 */
  }

  await reportPublishProgress(
    input.publishJobId,
    'browser_fill',
    '填写标题与描述…'
  );
  const desc = input.content || input.title;
  try {
    await fillTitleAndDescription(page, input.title, desc, input.tags ?? []);
  } catch {
    if (!(await page.getByText('作品描述', { exact: true }).count())) {
      throw new Error(
        onImageTab
          ? '图文素材已上传，但未找到「作品描述」编辑区'
          : '未进入抖音图文发布流程，请在创作者中心确认账号支持图文创作'
      );
    }
    throw new Error('找到作品描述区域但填写失败，请稍后重试');
  }

  await reportPublishProgress(
    input.publishJobId,
    'browser_submit',
    '提交发布…'
  );
  return clickPublish(page);
}

function pickVideoFile(paths: string[]): string | null {
  const video = paths.find(
    (p) => /\.(mp4|mov|webm|avi)$/i.test(p) && existsSync(p)
  );
  return video ?? null;
}

function pickImageFiles(paths: string[]): string[] {
  return paths.filter(
    (p) => /\.(png|jpe?g|webp|gif)$/i.test(p) && existsSync(p)
  );
}

export async function publishDouyin(
  input: DouyinPublishInput
): Promise<DouyinPublishResult> {
  const media = (input.mediaFilePaths ?? []).filter((p) => existsSync(p));
  const session = await createHeadlessSession(input.cookie, 'douyin.com');

  try {
    await reportPublishProgress(input.publishJobId, 'browser_launch');

    let publishResult: { postId: string | null; postUrl: string };

    if (input.contentType === 'video' || pickVideoFile(media)) {
      const videoPath = pickVideoFile(media);
      if (!videoPath) {
        return {
          success: false,
          errorMessage:
            '抖音视频发布需要上传 mp4/mov 等视频文件，请先在素材库添加视频'
        };
      }
      publishResult = await publishDouyinVideo(session.page, input, videoPath);
    } else if (
      input.contentType === 'text_image' ||
      pickImageFiles(media).length > 0
    ) {
      const images = pickImageFiles(media);
      if (images.length === 0) {
        return {
          success: false,
          errorMessage:
            '抖音图文发布需要至少一张图片素材；纯文字暂不支持自动发布'
        };
      }
      publishResult = await publishDouyinImages(session.page, input, images);
    } else {
      return {
        success: false,
        errorMessage: '抖音浏览器发布需要视频或图片素材，请为内容关联素材后重试'
      };
    }

    await reportPublishProgress(input.publishJobId, 'done');
    return {
      success: true,
      externalPostId: publishResult.postId ?? undefined,
      externalUrl: publishResult.postUrl
    };
  } catch (err) {
    let errorMessage =
      err instanceof Error ? err.message : 'Douyin publish failed';
    if (/second-verify|uc-second-verify/i.test(errorMessage)) {
      errorMessage =
        '抖音要求二次安全验证（扫码/短信）。请打开创作者中心完成验证，或在 .env 设置 BROWSER_RUNNER_HEADED=true 后重试并在弹出窗口中完成验证';
    }
    await reportPublishProgress(input.publishJobId, 'failed', errorMessage);
    return { success: false, errorMessage };
  } finally {
    await session.close();
  }
}
