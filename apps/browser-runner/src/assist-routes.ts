import type { ServerResponse } from 'node:http';
import type { RouteHandler, Route } from './routes.js';
import { createStealthSession } from './browser-session.js';

// ── Platform comment management page URLs ─────────────────────────

const COMMENT_PAGE_URLS: Record<string, (sourceContentId?: string) => string> = {
  douyin: (sourceContentId) =>
    sourceContentId
      ? `https://creator.douyin.com/creator-micro/content/post-comment/${sourceContentId}`
      : 'https://creator.douyin.com/creator-micro/content/manage',
  xiaohongshu: (sourceContentId) =>
    sourceContentId
      ? `https://creator.xiaohongshu.com/creator/edit?noteId=${sourceContentId}`
      : 'https://creator.xiaohongshu.com/creator/notemanage',
  wechat_official: () => 'https://mp.weixin.qq.com/',
  wechat_channels: () => 'https://channels.weixin.qq.com/platform/comment',
  baijiahao: (sourceContentId) =>
    sourceContentId
      ? `https://baijiahao.baidu.com/builder/rc/edit?type=comment&id=${sourceContentId}`
      : 'https://baijiahao.baidu.com/builder/rc/edit?type=comment',
  zhihu: (sourceContentId) =>
    sourceContentId
      ? `https://www.zhihu.com/question/${sourceContentId}`
      : 'https://www.zhihu.com/',
};

const MESSAGE_PAGE_URLS: Record<string, () => string> = {
  douyin: () => 'https://creator.douyin.com/creator-micro/home/message',
  xiaohongshu: () => 'https://creator.xiaohongshu.com/message/chatList',
  wechat_channels: () => 'https://channels.weixin.qq.com/platform/msg',
  zhihu: () => 'https://www.zhihu.com/messages',
};

// ── Per-platform XHR network-intercept patterns ───────────────────

const COMMENT_API_PATTERNS: Record<string, string[]> = {
  douyin: [
    '/aweme/v1/comment/list/',
    '/aweme/v1/creator/comment/list/',
    '/aweme/v1/creator/notice/comment/',
    '/web/api/creator/comment',
    '/api/comment/list',
    '/openapi/v1/post/comment/list/',
    '/creator/openapi/v1/comment/list/',
  ],
  xiaohongshu: [
    '/api/sns/web/v2/comment/page',
    '/web_api/sns/v3/note/comment',
    '/api/sns/web/v1/feed/comment',
  ],
  wechat_official: [
    '/cgi-bin/appmsg_comment',
    '/cgi-bin/comment/list',
  ],
  wechat_channels: [
    '/channels/finder/comment/list',
    '/cgi-bin/channels/platform/comment',
  ],
  baijiahao: [
    '/builderinner/api/content/comment/list',
    '/api/pc/article_comment',
    '/comment/v3/comment/list',
  ],
  zhihu: [
    '/api/v4/comment_v5',
    '/api/v4/answers/',
    '/api/v4/articles/',
    '/api/v4/questions/',
  ],
};

const MESSAGE_API_PATTERNS: Record<string, string[]> = {
  douyin: [
    '/aweme/v1/creator/user_message/list/',
    '/aweme/v1/creator/user_message/notice/',
    '/aweme/v1/im/message/list/',
    '/api/im/message/list',
    '/creator-micro/api/im/',
    '/openapi/v1/im/message/list/',
  ],
  xiaohongshu: [
    '/api/sns/web/v1/msg/chat',
    '/api/sns/web/v2/msg/channels',
    '/api/sns/web/v1/inbox',
  ],
  wechat_channels: [
    '/channels/finder/contact/message',
    '/cgi-bin/channels/platform/contact',
  ],
  zhihu: [
    '/api/v4/messages',
    '/api/v4/inbox',
  ],
};

// ── Reply selectors per platform ──────────────────────────────────

interface ReplySelectors {
  replyButton: string;
  replyInput: string;
  submitButton: string;
}

const REPLY_SELECTORS: Record<string, ReplySelectors> = {
  douyin: {
    replyButton: '[class*="reply-btn"], [class*="replyBtn"], button:has-text("回复")',
    replyInput: '[class*="reply-input"], textarea, [contenteditable="true"]',
    submitButton: '[class*="submit"], button:has-text("发送"), button:has-text("发布")',
  },
  xiaohongshu: {
    replyButton: '[class*="reply"], button:has-text("回复")',
    replyInput: '[class*="reply-input"], textarea, [contenteditable="true"]',
    submitButton: '[class*="submit"], button:has-text("发送")',
  },
  wechat_official: {
    replyButton: '[class*="reply"], .reply_btn, button:has-text("回复")',
    replyInput: 'textarea, [contenteditable="true"], .reply_input',
    submitButton: 'button:has-text("确认"), button:has-text("发表"), button:has-text("提交"), .submit_btn',
  },
  wechat_channels: {
    replyButton: '[class*="reply"], button:has-text("回复")',
    replyInput: 'textarea, [contenteditable="true"]',
    submitButton: '[class*="submit"], button:has-text("发送")',
  },
  baijiahao: {
    replyButton: '[class*="reply"], button:has-text("回复")',
    replyInput: 'textarea, [contenteditable="true"]',
    submitButton: '[class*="submit"], button:has-text("发送"), button:has-text("发布")',
  },
  zhihu: {
    replyButton: '.ReplyButton, button:has-text("回复")',
    replyInput: '.ReplyEditor textarea, textarea, [contenteditable="true"]',
    submitButton: '.ReplyEditor button[type="submit"], button:has-text("发布")',
  },
};

// ── Helpers ───────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/** Extract root domain (e.g. `creator.douyin.com` → `douyin.com`) for cross-subdomain cookie scope. */
function rootDomain(hostname: string): string {
  const parts = hostname.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Thin wrapper that applies cookies on root domain and creates a stealth context. */
async function createSession(cookie: string, targetUrl: string) {
  const hostname = extractDomain(targetUrl);
  const domain = rootDomain(hostname);
  return createStealthSession(cookie, domain);
}

// ── Route handlers ────────────────────────────────────────────────

interface FetchCommentsBody {
  platform: string;
  cookie: string;
  sourceContentId?: string;
  limit?: number;
  cursor?: string;
}

/** Extract a normalised comment list from a raw XHR JSON payload. */
function extractCommentList(platform: string, json: Record<string, unknown>, sourceContentId?: string): Array<Record<string, unknown>> {
  const data = json?.data as Record<string, unknown> | undefined;

  switch (platform) {
    case 'douyin': {
      const list = data?.list ?? data?.comments ?? json?.comments ?? json?.list;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const user = (item.user ?? item.author) as Record<string, unknown> | undefined;
        return {
          externalCommentId: String(item.cid ?? item.comment_id ?? ''),
          externalUserId: String(user?.uid ?? user?.open_id ?? ''),
          userNickname: String(user?.nickname ?? ''),
          content: String(item.text ?? item.content ?? ''),
          likeCount: Number(item.digg_count ?? item.like_count ?? 0),
          replyCount: Number(item.reply_comment_total ?? 0),
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : new Date().toISOString(),
          sourceContentId,
          rawPayload: item,
        };
      });
    }
    case 'xiaohongshu': {
      const list = data?.comments ?? data?.list ?? (json?.data as Record<string, unknown>)?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const userInfo = (item.user_info ?? item.author) as Record<string, unknown> | undefined;
        return {
          externalCommentId: String(item.id ?? item.comment_id ?? ''),
          externalUserId: String(userInfo?.user_id ?? userInfo?.userid ?? ''),
          userNickname: String(userInfo?.nickname ?? ''),
          content: String(item.content ?? item.note_content ?? ''),
          likeCount: Number(item.like_count ?? 0),
          replyCount: Number(item.sub_comment_count ?? 0),
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : new Date().toISOString(),
          sourceContentId,
          rawPayload: item,
        };
      });
    }
    case 'wechat_official': {
      const list = (json?.commentlist ?? data?.commentlist) as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => ({
        externalCommentId: String(item.comment_id ?? item.id ?? ''),
        externalUserId: String(item.user_open_id ?? item.openid ?? ''),
        userNickname: String(item.nick_name ?? item.user_open_id ?? ''),
        content: String(item.content ?? ''),
        likeCount: Number(item.like_num ?? 0),
        publishedAt: item.create_time
          ? new Date(Number(item.create_time) * 1000).toISOString()
          : new Date().toISOString(),
        sourceContentId,
        rawPayload: item,
      }));
    }
    case 'wechat_channels': {
      const list = data?.comments ?? json?.comments;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => ({
        externalCommentId: String(item.comment_id ?? item.id ?? ''),
        externalUserId: String(item.openid ?? item.user_openid ?? ''),
        userNickname: String(item.username ?? item.nickname ?? ''),
        content: String(item.content ?? ''),
        likeCount: Number(item.like_count ?? item.like_num ?? 0),
        publishedAt: item.create_time
          ? new Date(Number(item.create_time) * 1000).toISOString()
          : new Date().toISOString(),
        sourceContentId,
        rawPayload: item,
      }));
    }
    case 'baijiahao': {
      const list = data?.list ?? (data?.data as Record<string, unknown>)?.list;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => ({
        externalCommentId: String(item.comment_id ?? item.id ?? ''),
        externalUserId: String(item.user_id ?? ''),
        userNickname: String(item.user_name ?? item.nick_name ?? ''),
        content: String(item.content ?? ''),
        likeCount: Number(item.like_num ?? item.like_count ?? 0),
        replyCount: Number(item.reply_num ?? 0),
        publishedAt: String(item.create_time ?? new Date().toISOString()),
        sourceContentId,
        rawPayload: item,
      }));
    }
    case 'zhihu': {
      const list = data ?? json?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const author = (item.author ?? item.member) as Record<string, unknown> | undefined;
        return {
          externalCommentId: String(item.id ?? item.comment_id ?? ''),
          externalUserId: String(author?.id ?? author?.url_token ?? ''),
          userNickname: String(author?.name ?? ''),
          content: String((item.content ?? (item.body as Record<string, unknown>)?.content ?? '') as string),
          likeCount: Number(item.vote_count ?? item.like_count ?? 0),
          replyCount: Number(item.child_comment_count ?? 0),
          publishedAt: item.created_time
            ? new Date(Number(item.created_time) * 1000).toISOString()
            : new Date().toISOString(),
          sourceContentId,
          rawPayload: item,
        };
      });
    }
    default:
      return [];
  }
}

async function scrollForLazyLoad(page: import('playwright').Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800 + Math.floor(Math.random() * 400));
  }
  await page.waitForTimeout(1500);
}

function pickDouyinItemId(json: Record<string, unknown>): string | undefined {
  const items = json.items;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const item = items[0] as Record<string, unknown>;
  const direct = item.item_id ?? item.aweme_id ?? item.id ?? item.group_id;
  if (direct != null) return String(direct);
  const nested = item.aweme as Record<string, unknown> | undefined;
  if (nested?.aweme_id != null) return String(nested.aweme_id);
  const match = JSON.stringify(item).match(/"(?:item_id|aweme_id)"\s*:\s*"?(\d+)"?/);
  return match?.[1];
}

const handleFetchComments: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as FetchCommentsBody | null;
  if (!body?.platform || !body?.cookie) {
    sendJson(res, 400, { error: 'Missing platform or cookie' });
    return;
  }

  const urlFn = COMMENT_PAGE_URLS[body.platform];
  if (!urlFn) {
    sendJson(res, 400, { error: `Unsupported platform for comment fetching: ${body.platform}` });
    return;
  }

  let targetUrl = urlFn(body.sourceContentId);
  const xhrPatterns = COMMENT_API_PATTERNS[body.platform] ?? [];
  let resolvedContentId = body.sourceContentId;

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl);
    const { page } = session;

    const captured: Array<Record<string, unknown>> = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (body.platform === 'douyin' && !resolvedContentId && url.includes('/web/api/creator/item/list')) {
        try {
          const json = await response.json() as Record<string, unknown>;
          const id = pickDouyinItemId(json);
          if (id) resolvedContentId = id;
        } catch { /* skip */ }
      }
      if (!xhrPatterns.some((p) => url.includes(p))) return;
      try {
        const json = await response.json() as Record<string, unknown>;
        const items = extractCommentList(body.platform, json, resolvedContentId ?? body.sourceContentId);
        captured.push(...items);
      } catch { /* non-JSON, skip */ }
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (body.platform === 'douyin' && !body.sourceContentId) {
      await page.waitForTimeout(4000);
      if (!resolvedContentId) {
        await page.goto('https://creator.douyin.com/creator-micro/home/message', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await page.waitForTimeout(3000);
      }
      if (resolvedContentId) {
        targetUrl = urlFn(resolvedContentId);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
    }

    await scrollForLazyLoad(page);

    sendJson(res, 200, captured.slice(0, body.limit ?? 50));
  } catch {
    sendJson(res, 200, []);
  } finally {
    await session?.close();
  }
};

interface FetchMessagesBody {
  platform: string;
  cookie: string;
  limit?: number;
  cursor?: string;
}

/** Extract a normalised message list from a raw XHR JSON payload. */
function extractMessageList(platform: string, json: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = json?.data as Record<string, unknown> | undefined;

  switch (platform) {
    case 'douyin': {
      const list = data?.list ?? data?.messages ?? json?.message_list ?? json?.list;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const sender = (item.sender ?? item.from_user) as Record<string, unknown> | undefined;
        const contentRaw = item.content;
        let content = '';
        if (typeof contentRaw === 'string') {
          try { content = (JSON.parse(contentRaw) as { text?: string }).text ?? contentRaw; } catch { content = contentRaw; }
        }
        return {
          externalMessageId: String(item.message_id ?? item.msg_id ?? `msg-${Date.now()}`),
          externalUserId: String(sender?.uid ?? sender?.open_id ?? ''),
          userNickname: String(sender?.nickname ?? ''),
          content,
          type: item.content_type === 'image' ? 'image' : 'text',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : new Date().toISOString(),
          rawPayload: item,
        };
      });
    }
    case 'xiaohongshu': {
      const list = data?.chats ?? data?.list ?? data?.messages ?? json?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const userInfo = (item.user_info ?? item.contact ?? item.sender) as Record<string, unknown> | undefined;
        return {
          externalMessageId: String(item.id ?? item.message_id ?? `msg-${Date.now()}`),
          externalUserId: String(userInfo?.user_id ?? userInfo?.userid ?? ''),
          userNickname: String(userInfo?.nickname ?? ''),
          content: String(item.content ?? item.last_message ?? ''),
          type: item.msg_type === 'image' ? 'image' : 'text',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : new Date().toISOString(),
          rawPayload: item,
        };
      });
    }
    case 'wechat_channels': {
      const list = data?.messages ?? data?.contacts ?? json?.messages;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const sender = (item.sender ?? item.contact) as Record<string, unknown> | undefined;
        return {
          externalMessageId: String(item.message_id ?? item.id ?? `msg-${Date.now()}`),
          externalUserId: String(sender?.openid ?? item.openid ?? ''),
          userNickname: String(sender?.nickname ?? item.nickname ?? ''),
          content: String(item.content ?? ''),
          type: item.msg_type === 'text' ? 'text' : 'other',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : new Date().toISOString(),
          rawPayload: item,
        };
      });
    }
    case 'zhihu': {
      const list = data ?? json?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const sender = (item.sender ?? item.from_member) as Record<string, unknown> | undefined;
        return {
          externalMessageId: String(item.id ?? `msg-${Date.now()}`),
          externalUserId: String(sender?.id ?? sender?.url_token ?? ''),
          userNickname: String(sender?.name ?? ''),
          content: String(item.content ?? ''),
          type: item.type === 'image' ? 'image' : 'text',
          publishedAt: item.created_time
            ? new Date(Number(item.created_time) * 1000).toISOString()
            : new Date().toISOString(),
          rawPayload: item,
        };
      });
    }
    default:
      return [];
  }
}

const handleFetchMessages: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as FetchMessagesBody | null;
  if (!body?.platform || !body?.cookie) {
    sendJson(res, 400, { error: 'Missing platform or cookie' });
    return;
  }

  const urlFn = MESSAGE_PAGE_URLS[body.platform];
  if (!urlFn) {
    sendJson(res, 200, []);
    return;
  }

  const targetUrl = urlFn();
  const xhrPatterns = MESSAGE_API_PATTERNS[body.platform] ?? [];

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl);
    const { page } = session;

    // ── XHR response interception ──────────────────────────────
    const captured: Array<Record<string, unknown>> = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (!xhrPatterns.some((p) => url.includes(p))) return;
      try {
        const json = await response.json() as Record<string, unknown>;
        const items = extractMessageList(body.platform, json);
        captured.push(...items);
      } catch { /* non-JSON, skip */ }
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await scrollForLazyLoad(page);

    sendJson(res, 200, captured.slice(0, body.limit ?? 50));
  } catch {
    sendJson(res, 200, []);
  } finally {
    await session?.close();
  }
};

interface ReplyCommentBody {
  platform: string;
  cookie: string;
  externalCommentId: string;
  replyText: string;
  sourceContentId?: string;
}

const handleReplyComment: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as ReplyCommentBody | null;
  if (!body?.platform || !body?.cookie || !body?.externalCommentId || !body?.replyText) {
    sendJson(res, 400, { error: 'Missing platform, cookie, externalCommentId, or replyText' });
    return;
  }

  const replySels = REPLY_SELECTORS[body.platform];
  const urlFn = COMMENT_PAGE_URLS[body.platform];
  if (!replySels || !urlFn) {
    sendJson(res, 400, { error: `Unsupported platform for comment reply: ${body.platform}` });
    return;
  }

  const targetUrl = urlFn(body.sourceContentId);

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl);
    const { page } = session;

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await page.waitForSelector('[class*="comment"]', { timeout: 8000 });
    } catch {
      // Comments may not have loaded
    }

    // Find the target comment by data-id attribute or by content matching
    const commentLocator = await page.locator(
      `[data-id="${body.externalCommentId}"], [data-comment-id="${body.externalCommentId}"]`
    ).first();

    if (commentLocator) {
      // Click reply button within the comment
      const replyBtn = commentLocator.locator(replySels.replyButton).first();
      try {
        await replyBtn.click({ timeout: 3000 });
      } catch {
        // Reply button may not be found or clickable
      }

      // Type reply text
      const replyInput = commentLocator.locator(replySels.replyInput).first();
      try {
        await replyInput.click({ timeout: 3000 });
        await replyInput.fill(body.replyText);
      } catch {
        // Fallback: try page-level input
        const pageInput = page.locator(replySels.replyInput).first();
        await pageInput.click({ timeout: 3000 });
        await pageInput.fill(body.replyText);
      }

      // Submit
      const submitBtn = commentLocator.locator(replySels.submitButton).first();
      try {
        await submitBtn.click({ timeout: 3000 });
      } catch {
        // Fallback: try page-level submit
        const pageSubmit = page.locator(replySels.submitButton).first();
        await pageSubmit.click({ timeout: 3000 });
      }

      // Brief wait for submission confirmation
      await page.waitForTimeout(2000);

      sendJson(res, 200, { success: true, externalReplyId: `reply-${Date.now()}` });
    } else {
      sendJson(res, 200, { success: false, errorMessage: 'Target comment not found on page' });
    }
  } catch (err) {
    sendJson(res, 200, {
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Unknown error during reply',
    });
  } finally {
    await session?.close();
  }
};

interface ReplyMessageBody {
  platform: string;
  cookie: string;
  externalUserId: string;
  messageText: string;
}

const handleReplyMessage: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as ReplyMessageBody | null;
  if (!body?.platform || !body?.cookie || !body?.externalUserId || !body?.messageText) {
    sendJson(res, 400, { error: 'Missing platform, cookie, externalUserId, or messageText' });
    return;
  }

  const urlFn = MESSAGE_PAGE_URLS[body.platform];
  if (!urlFn) {
    sendJson(res, 200, { success: false, errorMessage: `Messaging not supported for platform: ${body.platform}` });
    return;
  }

  const targetUrl = urlFn();

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl);
    const { page } = session;

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Try to find and click the conversation with the target user
    const userLink = page.locator(
      `[data-id="${body.externalUserId}"], [data-user-id="${body.externalUserId}"], a:has-text("${body.externalUserId}")`
    ).first();
    try {
      await userLink.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch {
      // Conversation not found; try typing in the default input
    }

    // Find message input and type
    const messageInput = page.locator(
      'textarea, [contenteditable="true"], [class*="message-input"], [class*="msg-input"]'
    ).first();
    await messageInput.click({ timeout: 5000 });
    await messageInput.fill(body.messageText);

    // Submit
    const sendBtn = page.locator(
      '[class*="send"], button:has-text("发送"), button:has-text("Send"), button[type="submit"]'
    ).first();
    await sendBtn.click({ timeout: 3000 });

    // Brief wait for confirmation
    await page.waitForTimeout(2000);

    sendJson(res, 200, { success: true, externalReplyId: `msg-reply-${Date.now()}` });
  } catch (err) {
    sendJson(res, 200, {
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Unknown error during message reply',
    });
  } finally {
    await session?.close();
  }
};

// ── Exported route array ──────────────────────────────────────────

export const assistRoutes: Route[] = [
  { method: 'POST', pattern: '/assist/fetch-comments', handler: handleFetchComments },
  { method: 'POST', pattern: '/assist/fetch-messages', handler: handleFetchMessages },
  { method: 'POST', pattern: '/assist/reply-comment', handler: handleReplyComment },
  { method: 'POST', pattern: '/assist/reply-message', handler: handleReplyMessage },
];
