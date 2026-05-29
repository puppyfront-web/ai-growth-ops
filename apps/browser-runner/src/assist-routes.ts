import type { ServerResponse } from 'node:http';
import type { RouteHandler, Route } from './routes.js';
import { createStealthSession } from './browser-session.js';
import {
  dedupeByKey,
  isPublishedTodayInShanghai,
  RECENT_INTERACTION_FALLBACK_LIMIT,
  selectTodayOrRecent,
} from '@ai-growth-ops/shared';

// ── Platform comment management page URLs ─────────────────────────

/** 抖音创作者中心：互动管理 → 评论管理 */
const DOUYIN_COMMENT_MANAGE_URL = 'https://creator.douyin.com/creator-micro/interaction/comment';
const DOUYIN_ITEM_LIST_PATTERNS = [
  '/web/api/creator/item/list',
  '/aweme/v1/creator/item/list',
  '/creator/item/list',
];

function douyinPostCommentUrl(itemId: string): string {
  return `https://creator.douyin.com/creator-micro/content/post-comment/${encodeURIComponent(itemId)}`;
}

const COMMENT_PAGE_URLS: Record<string, (sourceContentId?: string) => string> = {
  douyin: (sourceContentId) =>
    sourceContentId ? douyinPostCommentUrl(sourceContentId) : DOUYIN_COMMENT_MANAGE_URL,
  xiaohongshu: (sourceContentId) =>
    sourceContentId ? xhsNotePublicUrl(sourceContentId) : XHS_NOTE_MANAGE_URL,
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
    '/api/sns/web/v3/note/comment',
    '/web_api/sns/v3/note/comment',
    '/api/sns/web/v1/feed/comment',
    '/api/sns/web/v1/note/comment/page',
    '/web_api/sns/v2/note/comment',
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

// ── Search API patterns ─────────────────────────────────────────────

const SEARCH_API_PATTERNS: Record<string, string[]> = {
  douyin: [
    '/aweme/v1/web/search/item/',
    '/aweme/v1/general/search/',
    '/api/v2/search/',
  ],
  xiaohongshu: [
    '/api/sns/web/v1/search/notes',
    '/api/sns/web/v1/elrsearch',
  ],
};

const SEARCH_PAGE_URLS: Record<string, (keyword: string) => string> = {
  douyin: (keyword) => `https://www.douyin.com/search/${encodeURIComponent(keyword)}`,
  xiaohongshu: (keyword) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`,
};

interface SearchResultItem {
  contentId: string;
  title: string;
  author: string;
}

export function extractSearchResults(
  platform: string,
  json: Record<string, unknown>,
): SearchResultItem[] {
  if (platform === 'douyin') {
    const data = json.data as Record<string, unknown> | undefined;
    const list = (data?.list ?? json.list ?? []) as Array<Record<string, unknown>>;
    return list
      .filter((item) => {
        const aweme = item.aweme_info as Record<string, unknown> | undefined;
        return aweme?.aweme_id || aweme?.id;
      })
      .map((item) => {
        const aweme = item.aweme_info as Record<string, unknown>;
        const authorInfo = aweme.author as Record<string, unknown> | undefined;
        return {
          contentId: String(aweme.aweme_id ?? aweme.id ?? ''),
          title: String(aweme.desc ?? aweme.title ?? ''),
          author: String(authorInfo?.nickname ?? ''),
        };
      });
  }

  if (platform === 'xiaohongshu') {
    const data = json.data as Record<string, unknown> | undefined;
    const items = (data?.items ?? json.items ?? []) as Array<Record<string, unknown>>;
    return items
      .filter((item) => {
        const card = item.note_card ?? item as Record<string, unknown>;
        return (card as Record<string, unknown>).note_id;
      })
      .map((item) => {
        const card = (item.note_card ?? item) as Record<string, unknown>;
        const user = card.user as Record<string, unknown> | undefined;
        return {
          contentId: String(card.note_id ?? ''),
          title: String(card.title ?? card.display_title ?? ''),
          author: String(user?.nickname ?? ''),
        };
      });
  }

  return [];
}

// ── Search and fetch comments handler ──────────────────────────────

interface SearchAndFetchCommentsBody {
  platform: string;
  cookie: string;
  keyword: string;
  topN?: number;
  headed?: boolean;
}

const handleSearchAndFetchComments: RouteHandler = async (req, res, ctx) => {
  const body = ctx.body as SearchAndFetchCommentsBody;
  if (!body.platform || !body.cookie || !body.keyword) {
    sendJson(res, 400, { error: 'Missing required fields: platform, cookie, keyword' });
    return;
  }

  const supportedPlatforms = ['douyin', 'xiaohongshu'];
  if (!supportedPlatforms.includes(body.platform)) {
    sendJson(res, 400, { error: `Unsupported platform for search: ${body.platform}. Supported: ${supportedPlatforms.join(', ')}` });
    return;
  }

  const topN = body.topN ?? 3;
  const searchPatterns = SEARCH_API_PATTERNS[body.platform] ?? [];
  const commentPatterns = COMMENT_API_PATTERNS[body.platform] ?? [];
  const searchUrl = SEARCH_PAGE_URLS[body.platform]?.(body.keyword);
  if (!searchUrl) {
    sendJson(res, 400, { error: `No search URL for platform: ${body.platform}` });
    return;
  }

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, searchUrl, body.headed);
    const { page } = session;

    // ── Phase 1: Search → extract top N content IDs ──────────────
    const searchResults: SearchResultItem[] = [];
    const searchTasks: Promise<void>[] = [];

    const searchListener = (response: import('playwright').Response) => {
      const url = response.url();
      if (!searchPatterns.some((p) => url.includes(p))) return;
      const task = (async () => {
        try {
          const json = await response.json() as Record<string, unknown>;
          const results = extractSearchResults(body.platform, json);
          searchResults.push(...results);
        } catch { /* non-JSON, skip */ }
      })();
      searchTasks.push(task);
    };
    page.on('response', searchListener);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await scrollForLazyLoad(page);
    await page.waitForTimeout(2000);

    page.off('response', searchListener);
    await Promise.allSettled(searchTasks);

    const topResults = searchResults.slice(0, topN);
    if (topResults.length === 0) {
      sendJson(res, 200, { keyword: body.keyword, results: [], message: 'No search results found' });
      return;
    }

    // ── Phase 2: For each result, fetch comments ─────────────────
    const allResults: Array<{
      contentId: string;
      title: string;
      author: string;
      comments: Array<Record<string, unknown>>;
    }> = [];

    for (const result of topResults) {
      // Determine the content page URL
      let contentUrl: string;
      if (body.platform === 'douyin') {
        contentUrl = `https://www.douyin.com/video/${result.contentId}`;
      } else {
        contentUrl = xhsNotePublicUrl(result.contentId);
      }

      const captured: Array<Record<string, unknown>> = [];
      const commentTasks: Promise<void>[] = [];

      const commentListener = (response: import('playwright').Response) => {
        const url = response.url();
        if (!commentPatterns.some((p) => url.includes(p))) return;
        const task = (async () => {
          try {
            const json = await response.json() as Record<string, unknown>;
            const items = extractCommentList(body.platform, json, result.contentId);
            captured.push(...items);
          } catch { /* non-JSON, skip */ }
        })();
        commentTasks.push(task);
      };
      page.on('response', commentListener);

      try {
        await page.goto(contentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await scrollForLazyLoad(page);
        await page.waitForTimeout(2000);
      } catch {
        // Navigation failed for this content — skip
      }

      page.off('response', commentListener);
      await Promise.allSettled(commentTasks);

      allResults.push({
        contentId: result.contentId,
        title: result.title,
        author: result.author,
        comments: dedupeByKey(captured, (c) => String(c.externalCommentId ?? '')).slice(0, 20),
      });
    }

    sendJson(res, 200, { keyword: body.keyword, results: allResults });
  } catch (error) {
    sendJson(res, 502, {
      error: 'Search and fetch comments failed',
      errorCode: 'SEARCH_FETCH_COMMENTS_FAILED',
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await session?.close();
  }
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

function sendAssistFetchError(
  res: ServerResponse,
  fetchType: 'comments' | 'messages',
  error: unknown,
) {
  sendJson(res, 502, {
    error: `Failed to fetch ${fetchType}`,
    errorCode:
      fetchType === 'comments'
        ? 'ASSIST_FETCH_COMMENTS_FAILED'
        : 'ASSIST_FETCH_MESSAGES_FAILED',
    details: error instanceof Error ? error.message : String(error),
  });
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
async function createSession(cookie: string, targetUrl: string, headed?: boolean) {
  const hostname = extractDomain(targetUrl);
  const domain = rootDomain(hostname);
  return createStealthSession(cookie, domain, headed);
}

// ── Route handlers ────────────────────────────────────────────────

interface FetchCommentsBody {
  platform: string;
  cookie: string;
  sourceContentId?: string;
  limit?: number;
  cursor?: string;
  headed?: boolean;
}

function douyinCommentPublishedAt(item: Record<string, unknown>): string {
  const raw = item.time_stamp ?? item.create_time;
  if (raw == null || raw === '') return '';
  return new Date(Number(raw) * 1000).toISOString();
}

function xhsCommentPublishedAt(item: Record<string, unknown>): string {
  const raw = item.create_time;
  if (raw == null || raw === '') return '';
  const timestamp = Number(raw);
  return new Date(timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000).toISOString();
}

/** Extract a normalised comment list from a raw XHR JSON payload. */
export function extractCommentList(platform: string, json: Record<string, unknown>, sourceContentId?: string): Array<Record<string, unknown>> {
  const data = json?.data as Record<string, unknown> | undefined;

  switch (platform) {
    case 'douyin': {
      const list =
        (Array.isArray(data) ? data : null) ??
        data?.list ??
        data?.comments ??
        json?.comments ??
        json?.list;
      if (!Array.isArray(list)) return [];
      return list
        .map((item: Record<string, unknown>) => {
          const user = (item.user ?? item.author) as Record<string, unknown> | undefined;
          const itemId = item.item_id != null ? String(item.item_id) : undefined;
          const externalCommentId = String(item.id ?? item.cid ?? item.comment_id ?? '');
          return {
            externalCommentId,
            externalUserId: String(user?.uid ?? user?.open_id ?? item.user_id ?? item.uid ?? ''),
            userNickname: String(user?.nickname ?? item.nick_name ?? item.nickname ?? ''),
            content: String(item.text ?? item.content ?? ''),
            likeCount: Number(item.digg_count ?? item.like_count ?? 0),
            replyCount: Number(item.reply_comment_total ?? item.all_comment_num ?? 0),
            publishedAt: douyinCommentPublishedAt(item),
            sourceContentId: sourceContentId ?? itemId,
            rawPayload: item,
          };
        })
        .filter((item) => item.externalCommentId.length > 0);
    }
    case 'xiaohongshu': {
      const list =
        data?.comments ??
        data?.list ??
        data?.data ??
        json?.comments ??
        json?.list;
      if (!Array.isArray(list)) return [];
      return list
        .map((item: Record<string, unknown>) => {
          const userInfo = (item.user_info ?? item.author ?? item.user) as Record<string, unknown> | undefined;
          const itemNoteId = item.note_id != null ? String(item.note_id) : undefined;
          const externalCommentId = String(item.id ?? item.comment_id ?? '');
          return {
            externalCommentId,
            externalUserId: String(userInfo?.user_id ?? userInfo?.userid ?? userInfo?.id ?? item.user_id ?? ''),
            userNickname: String(userInfo?.nickname ?? userInfo?.name ?? ''),
            content: String(item.content ?? item.note_content ?? ''),
            likeCount: Number(item.like_count ?? item.liked_count ?? 0),
            replyCount: Number(item.sub_comment_count ?? item.reply_count ?? item.sub_comment_num ?? 0),
            publishedAt: xhsCommentPublishedAt(item),
            sourceContentId: sourceContentId ?? itemNoteId,
            rawPayload: item,
          };
        })
        .filter((item) => item.externalCommentId.length > 0);
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
          : '',
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
          : '',
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
        publishedAt: item.create_time != null ? String(item.create_time) : '',
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
            : '',
          sourceContentId,
          rawPayload: item,
        };
      });
    }
    default:
      return [];
  }
}

async function openDouyinCommentManagement(page: import('playwright').Page): Promise<void> {
  await page.goto(DOUYIN_COMMENT_MANAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  if (!page.url().includes('interaction')) {
    const interactionEntry = page.getByText('互动管理').first();
    try {
      await interactionEntry.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch {
      // sidebar may already expose comment entry
    }
  }

  const commentEntry = page.getByText('评论管理').first();
  try {
    await commentEntry.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch {
    // direct route may already load comment inbox
  }
}

async function scrollForLazyLoad(page: import('playwright').Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800 + Math.floor(Math.random() * 400));
  }
  await page.waitForTimeout(1500);
}

/** XHS note management page — used to discover the latest note ID when none is supplied. */
const XHS_NOTE_MANAGE_URL = 'https://creator.xiaohongshu.com/creator/notemanage';

/**
 * API paths fired by the note management page that carry note IDs.
 * The homepage fires `/latest_note_data` with the most recent note; note management
 * pages fire `/user/posted` / `/note/list` variants.
 */
const XHS_NOTE_LIST_PATTERNS = [
  '/api/galaxy/creator/home/latest_note_data',
  '/api/galaxy/creator/data/note_detail_new',
  '/api/creator/note/user/posted',
  '/api/creator/note/list',
  '/api/galaxy/creator/home/notemanage',
];

export function xhsNotePublicUrl(noteId: string, xsecToken?: string): string {
  const url = new URL(`https://www.xiaohongshu.com/explore/${noteId}`);
  if (xsecToken) {
    url.searchParams.set('xsec_token', xsecToken);
    url.searchParams.set('xsec_source', 'pc_creator');
  }
  return url.toString();
}

interface XhsNoteRef {
  id: string;
  xsecToken?: string;
}

export function pickXhsNoteRef(json: Record<string, unknown>): XhsNoteRef | undefined {
  const data = json.data as Record<string, unknown> | undefined;

  // latest_note_data format: { data: { noteInfo: { id: '...' } } }
  const noteInfo = data?.noteInfo as Record<string, unknown> | undefined;
  if (noteInfo?.id) {
    const xsecToken = noteInfo.xsec_token ?? noteInfo.xsecToken;
    return {
      id: String(noteInfo.id),
      xsecToken: xsecToken != null ? String(xsecToken) : undefined,
    };
  }

  // note_detail_new / note list formats: { data: { notes: [{id, note_id}] } }
  const notes =
    (data?.notes ?? data?.list ?? data?.items ?? json.notes ?? json.list) as unknown[] | undefined;
  if (Array.isArray(notes) && notes.length > 0) {
    const first = notes[0] as Record<string, unknown>;
    const id = first.note_id ?? first.id ?? first.noteId;
    const xsecToken = first.xsec_token ?? first.xsecToken;
    if (id != null) {
      return {
        id: String(id),
        xsecToken: xsecToken != null ? String(xsecToken) : undefined,
      };
    }
  }

  return undefined;
}

function pickXhsNoteId(json: Record<string, unknown>): string | undefined {
  return pickXhsNoteRef(json)?.id;
}

async function waitForXhsNoteRef(page: import('playwright').Page): Promise<XhsNoteRef | undefined> {
  try {
    const response = await page.waitForResponse(
      (item) => XHS_NOTE_LIST_PATTERNS.some((pattern) => item.url().includes(pattern)),
      { timeout: 10000 },
    );
    return pickXhsNoteRef(await response.json() as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

export function isDouyinEncodedItemId(value: string): boolean {
  return value.startsWith('@') || (value.length > 18 && !/^\d+$/.test(value));
}

function pickDouyinItemIdFromItem(item: Record<string, unknown>): string | undefined {
  const encodedInJson = JSON.stringify(item).match(/"(?:item_id|open_item_id)"\s*:\s*"(@[^"]+)"/);
  if (encodedInJson?.[1]) return encodedInJson[1];

  const candidates = [item.item_id, item.open_item_id, item.id, item.aweme_id, item.group_id];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const value = String(candidate);
    if (isDouyinEncodedItemId(value)) return value;
  }

  const nested = item.aweme as Record<string, unknown> | undefined;
  if (nested?.aweme_id != null && isDouyinEncodedItemId(String(nested.aweme_id))) {
    return String(nested.aweme_id);
  }

  for (const candidate of candidates) {
    if (candidate != null) return String(candidate);
  }
  if (nested?.aweme_id != null) return String(nested.aweme_id);
  return undefined;
}

export function pickDouyinItemId(json: Record<string, unknown>): string | undefined {
  const noticeComments = json.comments;
  if (Array.isArray(noticeComments) && noticeComments.length > 0) {
    const first = noticeComments[0] as Record<string, unknown>;
    if (first.item_id != null) return String(first.item_id);
  }

  const data = json.data as Record<string, unknown> | undefined;
  const items =
    json.items ??
    data?.items ??
    data?.item_list ??
    json.item_list;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return pickDouyinItemIdFromItem(items[0] as Record<string, unknown>);
}

export function pickDouyinEncodedItemId(json: Record<string, unknown>): string | undefined {
  const id = pickDouyinItemId(json);
  return id && isDouyinEncodedItemId(id) ? id : undefined;
}

async function trySelectVideoOnCommentPage(page: import('playwright').Page): Promise<void> {
  const selectVideo = page.getByText('选择视频').first();
  try {
    await selectVideo.click({ timeout: 4000 });
    await page.waitForTimeout(1500);
  } catch {
    // selector may already show the video list
  }

  const rowSelectors = [
    '[class*="video-item"]',
    '[class*="content-card"]',
    '[class*="item-card"]',
    '[class*="video-card"]',
    '[class*="list"] [class*="item"]',
    'tr',
  ];
  for (const selector of rowSelectors) {
    try {
      const row = page.locator(selector).first();
      await row.click({ timeout: 3000 });
      await page.waitForTimeout(2500);
      return;
    } catch {
      // try next selector
    }
  }
}

async function loadDouyinCommentsFromLatestVideo(
  page: import('playwright').Page,
  itemIdRef: { encoded?: string; numeric?: string },
): Promise<void> {
  if (!itemIdRef.encoded && !itemIdRef.numeric) {
    // Page should already be on comment management from caller;
    // just try to select a video directly instead of re-navigating.
    await trySelectVideoOnCommentPage(page);
    await page.waitForTimeout(3000);
    return;
  }

  if (itemIdRef.encoded) {
    await page.goto(douyinPostCommentUrl(itemIdRef.encoded), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    return;
  }

  await openDouyinCommentManagement(page);
  await page.waitForTimeout(2000);
  await trySelectVideoOnCommentPage(page);
  await page.waitForTimeout(3000);
}

function dedupeAndFilterTodayComments(items: Array<Record<string, unknown>>, limit: number): Array<Record<string, unknown>> {
  return selectTodayOrRecent(
    items,
    (item) => String(item.externalCommentId ?? ''),
    (item) => item.publishedAt,
    { limit, fallbackLimit: RECENT_INTERACTION_FALLBACK_LIMIT },
  );
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

  const targetUrl = urlFn(body.sourceContentId);
  const xhrPatterns = COMMENT_API_PATTERNS[body.platform] ?? [];
  const itemIdRef: { encoded?: string; numeric?: string } = {};
  if (body.sourceContentId) {
    if (isDouyinEncodedItemId(body.sourceContentId)) itemIdRef.encoded = body.sourceContentId;
    else itemIdRef.numeric = body.sourceContentId;
  }
  const resolveDouyinItemId = () => itemIdRef.encoded ?? itemIdRef.numeric ?? body.sourceContentId;

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl, body.headed);
    const { page } = session;

    const captured: Array<Record<string, unknown>> = [];
    const responseTasks: Array<Promise<void>> = [];

    const rememberDouyinItemId = (json: Record<string, unknown>) => {
      const encoded = pickDouyinEncodedItemId(json);
      if (encoded) {
        itemIdRef.encoded = encoded;
        return;
      }
      const id = pickDouyinItemId(json);
      if (!id) return;
      if (isDouyinEncodedItemId(id)) itemIdRef.encoded = id;
      else itemIdRef.numeric = id;
    };

    // XHS: capture the first note ref from creator APIs so we can pivot to the
    // public note page with its xsec token.
    const xhsNoteRef: { value?: XhsNoteRef } = {};
    if (body.sourceContentId) xhsNoteRef.value = { id: body.sourceContentId };

    const responseListener = (response: import('playwright').Response) => {
      const task = (async () => {
      const url = response.url();
      if (body.platform === 'douyin' && DOUYIN_ITEM_LIST_PATTERNS.some((pattern) => url.includes(pattern))) {
        try {
          rememberDouyinItemId(await response.json() as Record<string, unknown>);
        } catch { /* skip */ }
      }
      if (body.platform === 'douyin' && url.includes('/aweme/v1/creator/notice/comment')) {
        try {
          rememberDouyinItemId(await response.json() as Record<string, unknown>);
        } catch { /* skip */ }
      }
      if (body.platform === 'xiaohongshu' && !xhsNoteRef.value?.xsecToken && XHS_NOTE_LIST_PATTERNS.some((p) => url.includes(p))) {
        try {
          const note = pickXhsNoteRef(await response.json() as Record<string, unknown>);
          if (note && (!xhsNoteRef.value || note.id === xhsNoteRef.value.id)) xhsNoteRef.value = note;
        } catch { /* skip */ }
      }
      if (!xhrPatterns.some((p) => url.includes(p))) return;
      try {
        const json = await response.json() as Record<string, unknown>;
        const items = extractCommentList(
          body.platform,
          json,
          body.platform === 'xiaohongshu' ? xhsNoteRef.value?.id : resolveDouyinItemId(),
        );
        captured.push(...items);
      } catch { /* non-JSON, skip */ }
      })();
      responseTasks.push(task);
    };
    page.on('response', responseListener);

    if (body.platform === 'douyin' && !body.sourceContentId) {
      await openDouyinCommentManagement(page);
      await scrollForLazyLoad(page);
      await page.waitForTimeout(2500);
      if (captured.length === 0) {
        await loadDouyinCommentsFromLatestVideo(page, itemIdRef);
        await scrollForLazyLoad(page);
        await page.waitForTimeout(2500);
      }
    } else if (body.platform === 'xiaohongshu' && !body.sourceContentId) {
      // Step 1: note management page → triggers note list API → captures note ID
      await page.goto(XHS_NOTE_MANAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      xhsNoteRef.value ??= await waitForXhsNoteRef(page);
      await Promise.allSettled(responseTasks.splice(0));
      // Step 2: if we got a note ref, navigate to its public page where comments load
      if (xhsNoteRef.value) {
        await page.goto(xhsNotePublicUrl(xhsNoteRef.value.id, xhsNoteRef.value.xsecToken), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await scrollForLazyLoad(page);
        await page.waitForTimeout(2000);
      }
    } else {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (body.platform === 'douyin') {
        await page.waitForTimeout(5000);
        if (body.sourceContentId) {
          await scrollForLazyLoad(page);
        }
      } else if (body.platform === 'xiaohongshu') {
        // With sourceContentId: on the public note page, wait then scroll
        await page.waitForTimeout(3000);
        await scrollForLazyLoad(page);
        await page.waitForTimeout(2000);
      }
    }

    if (body.platform !== 'douyin' && body.platform !== 'xiaohongshu') {
      await scrollForLazyLoad(page);
    } else if (body.platform === 'douyin' && body.sourceContentId) {
      await scrollForLazyLoad(page);
    }

    page.off('response', responseListener);
    await Promise.allSettled(responseTasks.splice(0));
    sendJson(res, 200, dedupeAndFilterTodayComments(captured, body.limit ?? 50));
  } catch (error) {
    sendAssistFetchError(res, 'comments', error);
  } finally {
    await session?.close();
  }
};

interface FetchMessagesBody {
  platform: string;
  cookie: string;
  limit?: number;
  cursor?: string;
  headed?: boolean;
}

function dedupeAndFilterTodayMessages(items: Array<Record<string, unknown>>, limit: number): Array<Record<string, unknown>> {
  return selectTodayOrRecent(
    items,
    (item) => String(item.externalMessageId ?? ''),
    (item) => item.publishedAt,
    { limit, fallbackLimit: RECENT_INTERACTION_FALLBACK_LIMIT },
  );
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
          externalMessageId: String(item.message_id ?? item.msg_id ?? ''),
          externalUserId: String(sender?.uid ?? sender?.open_id ?? ''),
          userNickname: String(sender?.nickname ?? ''),
          content,
          type: item.content_type === 'image' ? 'image' : 'text',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : '',
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
          externalMessageId: String(item.id ?? item.message_id ?? ''),
          externalUserId: String(userInfo?.user_id ?? userInfo?.userid ?? ''),
          userNickname: String(userInfo?.nickname ?? ''),
          content: String(item.content ?? item.last_message ?? ''),
          type: item.msg_type === 'image' ? 'image' : 'text',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : '',
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
          externalMessageId: String(item.message_id ?? item.id ?? ''),
          externalUserId: String(sender?.openid ?? item.openid ?? ''),
          userNickname: String(sender?.nickname ?? item.nickname ?? ''),
          content: String(item.content ?? ''),
          type: item.msg_type === 'text' ? 'text' : 'other',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : '',
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
          externalMessageId: String(item.id ?? ''),
          externalUserId: String(sender?.id ?? sender?.url_token ?? ''),
          userNickname: String(sender?.name ?? ''),
          content: String(item.content ?? ''),
          type: item.type === 'image' ? 'image' : 'text',
          publishedAt: item.created_time
            ? new Date(Number(item.created_time) * 1000).toISOString()
            : '',
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
    session = await createSession(body.cookie, targetUrl, body.headed);
    const { page } = session;

    // ── XHR response interception ──────────────────────────────
    const captured: Array<Record<string, unknown>> = [];

    const messageListener = async (response: import('playwright').Response) => {
      const url = response.url();
      if (!xhrPatterns.some((p) => url.includes(p))) return;
      try {
        const json = await response.json() as Record<string, unknown>;
        const items = extractMessageList(body.platform, json);
        captured.push(...items);
      } catch { /* non-JSON, skip */ }
    };
    page.on('response', messageListener);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await scrollForLazyLoad(page);

    page.off('response', messageListener);
    sendJson(res, 200, dedupeAndFilterTodayMessages(captured, body.limit ?? 50));
  } catch (error) {
    sendAssistFetchError(res, 'messages', error);
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
    const commentLocator = page.locator(
      `[data-id="${body.externalCommentId}"], [data-comment-id="${body.externalCommentId}"]`
    ).first();

    if (await commentLocator.count() > 0) {
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
  { method: 'POST', pattern: '/assist/search-and-fetch-comments', handler: handleSearchAndFetchComments },
];
