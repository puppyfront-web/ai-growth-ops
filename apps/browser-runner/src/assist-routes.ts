import type { ServerResponse } from 'node:http';
import type { RouteHandler, Route } from './routes.js';
import { createStealthSession } from './browser-session.js';
import { detectCaptcha } from './captcha-detect.js';
import {
  cancelCaptchaSession,
  getCaptchaSessionStatus,
  startCaptchaSession
} from './captcha-session.js';
import {
  fillWithVisionFallback,
  clickWithVisionFallback
} from './vision-assist.js';
import {
  dedupeByKey,
  isOfficialDouyinInboxNoise,
  RECENT_INTERACTION_FALLBACK_LIMIT,
  selectTodayOrRecent
} from '@ai-growth-ops/shared';

// ── Platform comment management page URLs ─────────────────────────

/**
 * 抖音评论入口。
 *
 * 创作者中心 `/creator-micro/interaction/comment` 已下线。可靠路径是：
 *   - 先走作品管理 `work_list` 拿 aweme_id（字符串，精度完整）
 *   - 再打开对应公开页触发 `/aweme/v1/web/comment/list/`
 *     图文 aweme_type=2 → `/note/{id}`，视频 → `/video/{id}`
 */
const DOUYIN_CONTENT_MANAGE_URL =
  'https://creator.douyin.com/creator-micro/content/manage';
const DOUYIN_COMMENT_MANAGE_URL = DOUYIN_CONTENT_MANAGE_URL;
const DOUYIN_COMMENT_NOTICE_URL = 'https://www.douyin.com/notification';
const DOUYIN_ITEM_LIST_PATTERNS = [
  'work_list',
  '/web/api/creator/item/list',
  '/aweme/v1/creator/item/list',
  '/creator/item/list'
];

export function douyinPostCommentUrl(itemId: string, awemeType?: number): string {
  const kind = awemeType === 2 ? 'note' : 'video';
  return `https://www.douyin.com/${kind}/${encodeURIComponent(itemId)}`;
}

export function parseDouyinContentHref(href: string): {
  contentId: string;
  awemeType?: number;
} | null {
  const match = href.match(/\/(video|note)\/([^/?#]+)/);
  if (!match?.[1] || !match[2]) return null;
  return {
    contentId: match[2],
    awemeType: match[1] === 'note' ? 2 : undefined
  };
}

async function openDouyinCommentNoticeInbox(
  page: import('playwright').Page
): Promise<void> {
  await page.goto(DOUYIN_COMMENT_NOTICE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(4000);
  await dismissDouyinPopups(page);
  for (const name of ['评论', '收到的评论', '互动消息']) {
    try {
      await page.getByText(name, { exact: true }).first().click({ timeout: 2500 });
      await page.waitForTimeout(2500);
      break;
    } catch {
      /* try next tab label */
    }
  }
  await scrollForLazyLoad(page);
  await page.waitForTimeout(2000);
}

async function openDouyinPublicCommentPanel(
  page: import('playwright').Page
): Promise<void> {
  try {
    await page
      .getByText('评论', { exact: true })
      .first()
      .click({ timeout: 4000 });
  } catch {
    /* panel may already be open */
  }
  await page
    .evaluate(() => {
      document
        .querySelectorAll('[class*="comment"], [class*="Comment"]')
        .forEach((node) =>
          node.scrollIntoView({ block: 'center' })
        );
      window.scrollBy(0, 400);
    })
    .catch(() => {});
  await page.waitForTimeout(2500);
}

const MAX_EXPAND_REPLY_CLICKS = 5;

async function expandDouyinCommentReplies(
  page: import('playwright').Page,
  maxClicks = MAX_EXPAND_REPLY_CLICKS
): Promise<void> {
  await page.evaluate((limit) => {
    const nodes = [...document.querySelectorAll('span, p, div, button, a')]
      .filter((el) => {
        const text = (el.textContent || '').replace(/\s+/g, '').trim();
        return /^(展开\d+条回复|查看\d+条回复|展开更多回复)$/.test(text);
      })
      .slice(0, limit);
    for (const el of nodes) {
      (el as HTMLElement).click();
    }
  }, maxClicks);
  await page.waitForTimeout(1200);
}

const DOUYIN_DOM_COMMENT_JUNK =
  /^(互相关注|关注|已关注|分享|喜欢|收藏|评论|回复|展开|收起|作者)$/;

export async function scrapeDouyinVisibleComments(
  page: import('playwright').Page
): Promise<Array<Record<string, unknown>>> {
  const rows = await page.evaluate(() => {
    const selectors = [
      '[data-e2e="comment-item"]',
      '[data-e2e="comment-list"] [data-e2e="comment-item"]'
    ];
    const nodes = [
      ...new Set(selectors.flatMap((sel) => [...document.querySelectorAll(sel)]))
    ];
    return nodes.slice(0, 40).map((el, index) => {
      const nick =
        el.querySelector('[data-e2e="comment-user"]')?.textContent?.trim() ?? '';
      const text =
        el.querySelector('[data-e2e="comment-content"]')?.textContent?.trim() ??
        '';
      return { nick, text, index };
    });
  });
  return rows
    .filter(
      (row) =>
        row.text.length > 1 &&
        !DOUYIN_DOM_COMMENT_JUNK.test(row.text) &&
        !DOUYIN_DOM_COMMENT_JUNK.test(row.nick)
    )
    .map((row) => ({
      externalCommentId: `dom-${row.index}-${row.text.slice(0, 24)}`,
      externalUserId: '',
      userNickname: row.nick,
      content: row.text,
      likeCount: 0,
      replyCount: 0,
      publishedAt: '',
      rawPayload: { source: 'dom' }
    }));
}

const COMMENT_PAGE_URLS: Record<string, (sourceContentId?: string) => string> =
  {
    douyin: (sourceContentId) =>
      sourceContentId
        ? douyinPostCommentUrl(sourceContentId)
        : DOUYIN_COMMENT_MANAGE_URL,
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
        : 'https://www.zhihu.com/'
  };

const MESSAGE_PAGE_URLS: Record<string, () => string> = {
  douyin: () => 'https://creator.douyin.com/creator-micro/home/message',
  xiaohongshu: () => 'https://creator.xiaohongshu.com/message/chatList',
  wechat_channels: () => 'https://channels.weixin.qq.com/platform/msg',
  zhihu: () => 'https://www.zhihu.com/messages'
};

// ── Per-platform XHR network-intercept patterns ───────────────────

const COMMENT_API_PATTERNS: Record<string, string[]> = {
  douyin: [
    '/aweme/v1/web/comment/list/',
    '/aweme/v1/web/comment/list/reply',
    '/aweme/v1/web/comment/',
    '/aweme/v1/comment/list/',
    '/aweme/v1/creator/comment/list/',
    '/aweme/v1/creator/notice/comment/',
    '/web/api/creator/comment',
    '/api/comment/list',
    '/openapi/v1/post/comment/list/',
    '/creator/openapi/v1/comment/list/',
    '/aweme/v1/web/notice/',
    '/aweme/v1/notice/',
    'comment_notice'
  ],
  xiaohongshu: [
    '/api/sns/web/v2/comment/page',
    '/api/sns/web/v3/note/comment',
    '/web_api/sns/v3/note/comment',
    '/api/sns/web/v1/feed/comment',
    '/api/sns/web/v1/note/comment/page',
    '/web_api/sns/v2/note/comment'
  ],
  wechat_official: ['/cgi-bin/appmsg_comment', '/cgi-bin/comment/list'],
  wechat_channels: [
    '/channels/finder/comment/list',
    '/cgi-bin/channels/platform/comment'
  ],
  baijiahao: [
    '/builderinner/api/content/comment/list',
    '/api/pc/article_comment',
    '/comment/v3/comment/list'
  ],
  zhihu: [
    '/api/v4/comment_v5',
    '/api/v4/answers/',
    '/api/v4/articles/',
    '/api/v4/questions/'
  ]
};

const MESSAGE_API_PATTERNS: Record<string, string[]> = {
  douyin: [
    '/aweme/v1/creator/user_message/list/',
    '/aweme/v1/creator/user_message/notice/',
    '/aweme/v1/creator/user_message/',
    '/aweme/v1/creator/msg/',
    '/aweme/v1/im/message/list/',
    '/api/im/message/list',
    '/web/api/v1/im/',
    '/creator-micro/api/im/',
    '/openapi/v1/im/message/list/'
  ],
  xiaohongshu: [
    '/api/sns/web/v1/msg/chat',
    '/api/sns/web/v2/msg/channels',
    '/api/sns/web/v1/inbox'
  ],
  wechat_channels: [
    '/channels/finder/contact/message',
    '/cgi-bin/channels/platform/contact'
  ],
  zhihu: ['/api/v4/messages', '/api/v4/inbox']
};

// ── Search API patterns ─────────────────────────────────────────────

const _SEARCH_API_PATTERNS: Record<string, string[]> = {
  douyin: [
    '/aweme/v1/web/search/item/',
    '/aweme/v1/general/search/',
    '/api/v2/search/'
  ],
  xiaohongshu: ['/api/sns/web/v1/search/notes', '/api/sns/web/v1/elrsearch']
};

const SEARCH_PAGE_URLS: Record<string, (keyword: string) => string> = {
  douyin: (keyword) =>
    `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`,
  xiaohongshu: (keyword) =>
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`
};

interface SearchResultItem {
  contentId: string;
  title: string;
  author: string;
  awemeType?: number;
}

export function extractSearchResults(
  platform: string,
  json: Record<string, unknown>
): SearchResultItem[] {
  if (platform === 'douyin') {
    const data = json.data as Record<string, unknown> | undefined;
    const list = (data?.list ?? json.list ?? []) as Array<
      Record<string, unknown>
    >;
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
          awemeType:
            typeof aweme.aweme_type === 'number' ? aweme.aweme_type : undefined
        };
      });
  }

  if (platform === 'xiaohongshu') {
    const data = json.data as Record<string, unknown> | undefined;
    const items = (data?.items ?? json.items ?? []) as Array<
      Record<string, unknown>
    >;
    return items
      .filter((item) => {
        const card = item.note_card ?? (item as Record<string, unknown>);
        return (card as Record<string, unknown>).note_id;
      })
      .map((item) => {
        const card = (item.note_card ?? item) as Record<string, unknown>;
        const user = card.user as Record<string, unknown> | undefined;
        return {
          contentId: String(card.note_id ?? ''),
          title: String(card.title ?? card.display_title ?? ''),
          author: String(user?.nickname ?? '')
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
  commentScrollRounds?: number;
  maxCommentsPerVideo?: number;
}

interface SearchVideosBody {
  platform: string;
  cookie: string;
  keyword: string;
  topN?: number;
  headed?: boolean;
}

interface FetchSearchVideoCommentsBody {
  platform: string;
  cookie: string;
  contentId: string;
  title?: string;
  author?: string;
  awemeType?: number;
  commentScrollRounds?: number;
  maxCommentsPerVideo?: number;
  headed?: boolean;
}

async function runKeywordVideoSearch(
  body: SearchVideosBody
): Promise<{
  keyword: string;
  results: SearchResultItem[];
  captchaRequired?: boolean;
  message?: string;
}> {
  const searchUrl = SEARCH_PAGE_URLS[body.platform]?.(body.keyword);
  if (!searchUrl) {
    throw new Error(`No search URL for platform: ${body.platform}`);
  }

  const topN = body.topN ?? 3;
  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, searchUrl, body.headed);
    const { page } = session;

    if (body.platform === 'douyin') {
      try {
        await page.goto('https://www.douyin.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        await page.waitForTimeout(2000);
        await dismissDouyinPopups(page);
      } catch {
        /* non-fatal */
      }
    }

    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(4000);

    const captchaDetected = await detectCaptcha(page);
    if (captchaDetected) {
      await page.waitForTimeout(5000);
      if (await detectCaptcha(page)) {
        return {
          keyword: body.keyword,
          results: [],
          captchaRequired: true,
          message: '搜索页面出现验证码，请在浏览器中手动完成验证后重试'
        };
      }
    }

    await humanLikeScroll(page, 5);
    await page.waitForTimeout(2000);

    const searchResults = await extractSearchResultsFromDOM(
      page,
      body.platform
    );
    return {
      keyword: body.keyword,
      results: searchResults.slice(0, topN)
    };
  } finally {
    await session?.close();
  }
}

async function runSearchVideoCommentFetch(
  body: FetchSearchVideoCommentsBody
): Promise<{
  contentId: string;
  title: string;
  author: string;
  url: string;
  comments: Array<Record<string, unknown>>;
}> {
  const contentUrl =
    body.platform === 'douyin'
      ? douyinPostCommentUrl(body.contentId, body.awemeType)
      : xhsNotePublicUrl(body.contentId);

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, contentUrl, body.headed);
    const { page } = session;
    const captured: Array<Record<string, unknown>> = [];
    const responseTasks: Array<Promise<void>> = [];
    const xhrPatterns = COMMENT_API_PATTERNS[body.platform] ?? [];

    const responseListener = (response: import('playwright').Response) => {
      const task = (async () => {
        const url = response.url();
        if (!xhrPatterns.some((pattern) => url.includes(pattern))) return;
        try {
          const json = parseJsonBigInt(await response.text()) as Record<
            string,
            unknown
          >;
          captured.push(
            ...extractCommentList(body.platform, json, body.contentId)
          );
        } catch {
          /* skip non-JSON */
        }
      })();
      responseTasks.push(task);
    };
    page.on('response', responseListener);

    await page.goto(contentUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(4000);
    await dismissDouyinPopups(page);
    if (await detectCaptcha(page)) {
      throw new Error('平台触发了验证码，请在浏览器中完成验证后继续');
    }

    if (body.platform === 'douyin') {
      await openDouyinPublicCommentPanel(page);
    }

    await page.mouse.move(900, 500);
    await page.waitForTimeout(300);
    const scrollRounds = body.commentScrollRounds ?? 10;
    await humanLikeScroll(page, scrollRounds);

    if (body.platform === 'douyin') {
      await expandDouyinCommentReplies(page);
      await page.waitForTimeout(2000);
      await humanLikeScroll(page, 2);
    }

    page.off('response', responseListener);
    await Promise.allSettled(responseTasks);

    const comments = [
      ...captured,
      ...(await extractCommentsFromDOM(page, body.platform, body.contentId))
    ];
    const maxPerVideo = body.maxCommentsPerVideo ?? 50;

    return {
      contentId: body.contentId,
      title: body.title ?? '',
      author: body.author ?? '',
      url: contentUrl,
      comments: dedupeByKey(comments, (c) =>
        String(c.externalCommentId ?? '')
      ).slice(0, maxPerVideo)
    };
  } finally {
    await session?.close();
  }
}

const handleSearchVideos: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as SearchVideosBody | null;
  if (!body?.platform || !body?.cookie || !body?.keyword) {
    sendJson(res, 400, {
      error: 'Missing required fields: platform, cookie, keyword'
    });
    return;
  }

  const supportedPlatforms = ['douyin', 'xiaohongshu'];
  if (!supportedPlatforms.includes(body.platform)) {
    sendJson(res, 400, {
      error: `Unsupported platform for search: ${body.platform}. Supported: ${supportedPlatforms.join(', ')}`
    });
    return;
  }

  try {
    const payload = await runKeywordVideoSearch(body);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Search videos failed',
      errorCode: 'SEARCH_VIDEOS_FAILED',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

const handleFetchSearchVideoComments: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as FetchSearchVideoCommentsBody | null;
  if (!body?.platform || !body?.cookie || !body?.contentId) {
    sendJson(res, 400, {
      error: 'Missing required fields: platform, cookie, contentId'
    });
    return;
  }

  const supportedPlatforms = ['douyin', 'xiaohongshu'];
  if (!supportedPlatforms.includes(body.platform)) {
    sendJson(res, 400, {
      error: `Unsupported platform: ${body.platform}. Supported: ${supportedPlatforms.join(', ')}`
    });
    return;
  }

  try {
    const result = await runSearchVideoCommentFetch(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Fetch search video comments failed',
      errorCode: 'FETCH_SEARCH_VIDEO_COMMENTS_FAILED',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

function parseCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('万')) {
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? Math.round(n * 10000) : null;
  }
  const n = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function userField(user: Record<string, unknown> | null, key: string): unknown {
  return user?.[key];
}

function pickDouyinUserPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const nested =
    root.user ??
    root.user_info ??
    (root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>).user ?? root.data
      : null);
  return nested && typeof nested === 'object'
    ? (nested as Record<string, unknown>)
    : null;
}

type DouyinDomProfile = {
  nickname: string | null;
  signature: string | null;
  followerText: string | null;
  followingText: string | null;
  likeText: string | null;
  location: string | null;
};

async function extractDouyinUserProfile(
  page: import('playwright').Page
): Promise<DouyinDomProfile> {
  return page.evaluate(String.raw`(() => {
    const text = document.body && document.body.innerText ? document.body.innerText : '';
    const nicknameEl = document.querySelector('h1') || document.querySelector('[data-e2e="user-info-nickname"]');
    const nickname = nicknameEl && nicknameEl.textContent ? nicknameEl.textContent.trim() : null;
    const signatureEl =
      document.querySelector('[data-e2e="user-info-desc"], [data-e2e="user-signature"]') ||
      document.querySelector('[class*="signature"], [class*="desc"]');
    const signatureRaw = signatureEl && signatureEl.textContent ? signatureEl.textContent.trim() : null;
    const followerFound = text.match(/([\d.]+万?)\s*粉丝|粉丝\s*([\d.]+万?)/);
    const followingFound = text.match(/([\d.]+万?)\s*关注|关注\s*([\d.]+万?)/);
    const likeFound = text.match(/([\d.]+万?)\s*获赞|获赞\s*([\d.]+万?)/);
    const locationFound = text.match(/IP属地[:：]?\s*([^\s]+)/) || text.match(/IP[:：]\s*([^\s]+)/);
    return {
      nickname: nickname,
      signature: signatureRaw && signatureRaw.length < 400 ? signatureRaw : null,
      followerText: (followerFound && (followerFound[1] || followerFound[2])) || null,
      followingText: (followingFound && (followingFound[1] || followingFound[2])) || null,
      likeText: (likeFound && (likeFound[1] || likeFound[2])) || null,
      location: (locationFound && locationFound[1]) || null
    };
  })()`) as Promise<DouyinDomProfile>;
}

const handleFetchUserProfile: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as {
    platform?: string;
    cookie?: string;
    homepage?: string;
    headed?: boolean;
  } | null;
  if (!body?.platform || !body?.cookie || !body?.homepage) {
    sendJson(res, 400, {
      error: 'Missing required fields: platform, cookie, homepage'
    });
    return;
  }

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, body.homepage, body.headed);
    const { page } = session;
    let apiUser: Record<string, unknown> | null = null;

    page.on('response', async (response) => {
      const url = response.url();
      if (!/user\/profile|\/user\/info|web\/user\//.test(url)) return;
      try {
        const json = await response.json();
        apiUser = pickDouyinUserPayload(json) ?? apiUser;
      } catch {
        /* ignore non-json */
      }
    });

    await page.goto(body.homepage, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(4000);
    await dismissDouyinPopups(page);
    if (await detectCaptcha(page)) {
      sendJson(res, 429, {
        error: '平台触发了验证码，请在浏览器中完成验证后继续',
        captchaRequired: true
      });
      return;
    }
    await page.waitForTimeout(1500);

    const dom = await extractDouyinUserProfile(page);
    const nickname = userField(apiUser, 'nickname');
    const signature = userField(apiUser, 'signature');
    const location = userField(apiUser, 'ip_location');
    sendJson(res, 200, {
      nickname: (typeof nickname === 'string' && nickname) || dom.nickname,
      signature: (typeof signature === 'string' && signature) || dom.signature,
      followerCount:
        parseCount(userField(apiUser, 'follower_count')) ??
        parseCount(userField(apiUser, 'mplatform_followers_count')) ??
        parseCount(dom.followerText),
      followingCount:
        parseCount(userField(apiUser, 'following_count')) ??
        parseCount(dom.followingText),
      likeCount:
        parseCount(userField(apiUser, 'total_favorited')) ??
        parseCount(dom.likeText),
      location: (typeof location === 'string' && location) || dom.location,
      homepage: body.homepage,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 502, {
      error: 'Fetch user profile failed',
      errorCode: 'FETCH_USER_PROFILE_FAILED',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await session?.close();
  }
};

const handleSearchAndFetchComments: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as SearchAndFetchCommentsBody;
  if (!body.platform || !body.cookie || !body.keyword) {
    sendJson(res, 400, {
      error: 'Missing required fields: platform, cookie, keyword'
    });
    return;
  }

  const supportedPlatforms = ['douyin', 'xiaohongshu'];
  if (!supportedPlatforms.includes(body.platform)) {
    sendJson(res, 400, {
      error: `Unsupported platform for search: ${body.platform}. Supported: ${supportedPlatforms.join(', ')}`
    });
    return;
  }

  try {
    const searchPayload = await runKeywordVideoSearch(body);
    if (searchPayload.captchaRequired) {
      sendJson(res, 200, searchPayload);
      return;
    }

    if (searchPayload.results.length === 0) {
      sendJson(res, 200, {
        keyword: body.keyword,
        results: [],
        message: 'No search results found on page'
      });
      return;
    }

    const allResults: Array<{
      contentId: string;
      title: string;
      author: string;
      url: string;
      comments: Array<Record<string, unknown>>;
    }> = [];

    for (const result of searchPayload.results) {
      try {
        const video = await runSearchVideoCommentFetch({
          platform: body.platform,
          cookie: body.cookie,
          contentId: result.contentId,
          title: result.title,
          author: result.author,
          awemeType: result.awemeType,
          commentScrollRounds: body.commentScrollRounds,
          maxCommentsPerVideo: body.maxCommentsPerVideo,
          headed: body.headed
        });
        allResults.push(video);
      } catch (err) {
        allResults.push({
          contentId: result.contentId,
          title: result.title,
          author: result.author,
          url:
            body.platform === 'douyin'
              ? douyinPostCommentUrl(result.contentId, result.awemeType)
              : xhsNotePublicUrl(result.contentId),
          comments: []
        });
        console.log(
          '[prospecting] Video',
          result.contentId,
          'failed:',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    sendJson(res, 200, { keyword: body.keyword, results: allResults });
  } catch (error) {
    sendJson(res, 502, {
      error: 'Search and fetch comments failed',
      errorCode: 'SEARCH_FETCH_COMMENTS_FAILED',
      details: error instanceof Error ? error.message : String(error)
    });
  }
};

// ── DOM-based extraction helpers ──────────────────────────────

/** Dismiss common Douyin popups (login, verification overlays). */
async function dismissDouyinPopups(
  page: import('playwright').Page
): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelectorAll(
        '[class*=mask], [id*=dialog], [id*=verify], [id*=trust]'
      )
      .forEach((m) => {
        if (m instanceof HTMLElement) m.style.display = 'none';
      });
  });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

async function extractSearchResultsFromDOM(
  page: import('playwright').Page,
  platform: string
): Promise<SearchResultItem[]> {
  if (platform === 'douyin') {
    return page.evaluate(() => {
      const container = document.getElementById('search-result-container');
      if (!container) return [];
      // Match both /video/ID and /note/ID patterns
      const links = container.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/video/"], a[href*="/note/"]'
      );
      const seen = new Set<string>();
      const results: Array<{
        contentId: string;
        title: string;
        author: string;
        awemeType?: number;
      }> = [];

      links.forEach((a) => {
        const href = a.href;
        const match = href.match(/\/(video|note)\/([^/?#]+)/);
        if (!match || seen.has(match[2])) return;
        seen.add(match[2]);

        const card = (a.closest('div') || a) as HTMLElement;
        const text = card.innerText || '';
        const lines = text.split('\n').filter((l: string) => l.trim());

        // Find the title (longest meaningful line) and author (starts with @)
        const author = (
          lines.find((l: string) => l.startsWith('@')) || ''
        ).replace('@', '');
        const title =
          lines.find(
            (l: string) => l.length > 5 && !l.match(/^\d{2}:\d{2}$/)
          ) || '';

        results.push({
          contentId: match[2],
          title,
          author,
          awemeType: match[1] === 'note' ? 2 : undefined
        });
      });
      return results;
    });
  }

  // Fallback for other platforms (XHS etc.) — not yet implemented
  return [];
}

/** UI-noise filter patterns for comment extraction. */
const COMMENT_NOISE_PATTERNS = [
  '分享',
  '回复',
  '展开',
  '收起',
  '删除',
  '点赞',
  '留下你的精彩评论',
  '全部评论',
  '精选',
  '推荐',
  '客户端',
  '充钻石',
  '...',
  '…',
  '作者',
  '粉丝'
];

/** Check if a string is likely UI noise rather than a real comment. */
function _isUINoise(text: string): boolean {
  return (
    COMMENT_NOISE_PATTERNS.some((p) => text === p) ||
    /^\d+$/.test(text) ||
    /^[\d.]+万?$/.test(text)
  );
}

/** Extract comments from the video page DOM. */
async function extractCommentsFromDOM(
  page: import('playwright').Page,
  platform: string,
  sourceContentId: string
): Promise<Array<Record<string, unknown>>> {
  if (platform === 'douyin') {
    return page.evaluate(
      (args: { noisePatterns: string[]; contentId: string }) => {
        const { noisePatterns, contentId } = args;
        const userLinks =
          document.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"]');
        const results: Array<Record<string, unknown>> = [];
        const seen = new Set<string>();

        for (const link of userLinks) {
          const href = link.getAttribute('href') || '';
          if (!href.includes('/user/')) continue;

          // Walk up the DOM tree to find the comment container
          let el: HTMLElement | null = link;
          for (let i = 0; i < 6; i++) {
            el = el?.parentElement as HTMLElement | null;
            if (!el) break;
            const text = el.innerText || '';
            const lines = text.split('\n').filter((l: string) => l.trim());

            // A proper comment has: username + content + metadata (3+ lines)
            if (lines.length < 3 || lines.length > 12) continue;

            const username = lines[0]?.trim() || '';
            const contentLine = lines.slice(1).find((l: string) => {
              const trimmed = l.trim();
              return (
                trimmed.length >= 3 &&
                trimmed !== username &&
                !noisePatterns.some((p: string) => trimmed === p) &&
                trimmed.length < 300 &&
                !/^\d+\s*(分享|回复|展开|收起|删除|点赞)/.test(trimmed) &&
                !/^[\d.]+万?$/.test(trimmed) &&
                !/^\d+$/.test(trimmed)
              );
            });

            if (!contentLine || !username || username.length > 30) continue;
            if (noisePatterns.some((p: string) => username === p)) continue;

            const key = username + contentLine.slice(0, 20);
            if (seen.has(key)) continue;
            seen.add(key);

            // Get time info
            const timeLine = lines.find((l: string) =>
              /前|天|小时|分钟|秒/.test(l)
            );

            const secUid = href.split('/user/')[1]?.split(/[?#]/)[0] || '';
            const likeLine = lines
              .slice(1)
              .find((l: string) => /^[\d.]+万?$/.test(l.trim()));
            const likeText = likeLine?.trim() || '';
            const likeCount = likeText.endsWith('万')
              ? Math.round(parseFloat(likeText) * 10000)
              : Number(likeText) || 0;

            results.push({
              externalCommentId: `dom-${href.slice(-10)}-${key.replace(/\s/g, '').slice(0, 8)}`,
              externalUserId: secUid,
              userNickname: username,
              userHomepage: secUid
                ? `https://www.douyin.com/user/${secUid}`
                : '',
              avatarUrl: el.querySelector('img')?.getAttribute('src') || '',
              content: contentLine.trim().slice(0, 300),
              likeCount,
              publishedAt: timeLine || '',
              sourceContentId: contentId
            });
            break; // Found the right container level
          }
        }

        return results;
      },
      { noisePatterns: COMMENT_NOISE_PATTERNS, contentId: sourceContentId }
    );
  }

  return [];
}

// ── Reply selectors per platform ──────────────────────────────────

interface ReplySelectors {
  replyButton: string;
  replyInput: string;
  submitButton: string;
}

const REPLY_SELECTORS: Record<string, ReplySelectors> = {
  douyin: {
    replyButton:
      '[class*="reply-btn"], [class*="replyBtn"], button:has-text("回复")',
    replyInput: '[class*="reply-input"], textarea, [contenteditable="true"]',
    submitButton:
      '[class*="submit"], button:has-text("发送"), button:has-text("发布")'
  },
  xiaohongshu: {
    replyButton: '[class*="reply"], button:has-text("回复")',
    replyInput: '[class*="reply-input"], textarea, [contenteditable="true"]',
    submitButton: '[class*="submit"], button:has-text("发送")'
  },
  wechat_official: {
    replyButton: '[class*="reply"], .reply_btn, button:has-text("回复")',
    replyInput: 'textarea, [contenteditable="true"], .reply_input',
    submitButton:
      'button:has-text("确认"), button:has-text("发表"), button:has-text("提交"), .submit_btn'
  },
  wechat_channels: {
    replyButton: '[class*="reply"], button:has-text("回复")',
    replyInput: 'textarea, [contenteditable="true"]',
    submitButton: '[class*="submit"], button:has-text("发送")'
  },
  baijiahao: {
    replyButton: '[class*="reply"], button:has-text("回复")',
    replyInput: 'textarea, [contenteditable="true"]',
    submitButton:
      '[class*="submit"], button:has-text("发送"), button:has-text("发布")'
  },
  zhihu: {
    replyButton: '.ReplyButton, button:has-text("回复")',
    replyInput: '.ReplyEditor textarea, textarea, [contenteditable="true"]',
    submitButton: '.ReplyEditor button[type="submit"], button:has-text("发布")'
  }
};

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Parse a JSON string while preserving every integer beyond the
 * safe-integer range as a string.
 *
 * Douyin/XHS IDs (item_id, aweme_id, comment_id, …) are 18–19 digit integers
 * that exceed Number.MAX_SAFE_INTEGER, so `JSON.parse`/`response.json()`
 * silently zero out their trailing digits (…5360953 → …536000). By quoting
 * large integer literals in the raw text *before* parsing, the IDs survive as
 * strings. Small integers (statistics, counts) are untouched and stay numeric.
 */
function parseJsonBigInt(text: string): unknown {
  // Build a same-length mask where every character inside a string literal
  // becomes 's' — the big-int regex then only matches real number tokens.
  // A bare lookbehind regex cannot tell digits inside strings (e.g. a
  // comment containing "，1234567890123456789") from actual IDs, and quoting
  // those breaks the whole JSON payload ("Expected ',' or '}' ...").
  const maskChars: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        maskChars.push('"');
        continue;
      }
      maskChars.push('s');
    } else if (ch === '"') {
      inString = true;
      maskChars.push('"');
    } else {
      maskChars.push(ch);
    }
  }
  const ranges: Array<[number, number]> = [];
  for (const m of maskChars
    .join('')
    .matchAll(/(?<=[:[,]\s*)-?\d{16,}(?=\s*[,\]}])/g)) {
    ranges.push([m.index as number, (m.index as number) + m[0].length]);
  }
  let safe = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    safe += `${text.slice(cursor, start)}"${text.slice(start, end)}"`;
    cursor = end;
  }
  safe += text.slice(cursor);
  return JSON.parse(safe);
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendAssistFetchError(
  res: ServerResponse,
  fetchType: 'comments' | 'messages',
  error: unknown
) {
  sendJson(res, 502, {
    error: `Failed to fetch ${fetchType}`,
    errorCode:
      fetchType === 'comments'
        ? 'ASSIST_FETCH_COMMENTS_FAILED'
        : 'ASSIST_FETCH_MESSAGES_FAILED',
    details: error instanceof Error ? error.message : String(error)
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
async function createSession(
  cookie: string,
  targetUrl: string,
  headed?: boolean
) {
  const hostname = extractDomain(targetUrl);
  const domain = rootDomain(hostname);
  return createStealthSession(cookie, domain, headed);
}

/**
 * Resolve the iframe that hosts douyin's private-message UI.
 *
 * Douyin renders its DM inbox inside a `summon.bytedance.com` iframe rather
 * than in the top-level page, so selectors like `page.locator('textarea')`
 * find nothing. This waits for that frame to mount and returns it; if no
 * matching frame appears (older layout / different platform), it falls back to
 * `null` so callers can keep using the top-level page.
 */
async function resolveImFrame(
  page: import('playwright').Page
): Promise<import('playwright').Frame | null> {
  try {
    // Wait for the IM iframe to mount on the page.
    await page
      .locator('iframe[src*="summon.bytedance.com"], iframe[src*="im"]')
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 })
      .catch(() => {});
    // Resolve it from the page's frame tree (reliable across reloads).
    const frame = page
      .frames()
      .find((f) =>
        /summon\.bytedance\.com|\/im[/?#]/i.test(f.url())
      );
    if (frame) {
      await frame
        .locator('body')
        .waitFor({ state: 'attached', timeout: 8_000 })
        .catch(() => {});
    }
    return frame ?? null;
  } catch {
    return null;
  }
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
  return new Date(
    timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
  ).toISOString();
}

function douyinUserHomepage(
  user: Record<string, unknown> | undefined
): string {
  const sec = user?.sec_uid ?? user?.sec_uid_str;
  return typeof sec === 'string' && sec
    ? `https://www.douyin.com/user/${sec}`
    : '';
}

function mapDouyinCommentItem(
  raw: Record<string, unknown>,
  sourceContentId?: string
): Record<string, unknown> | null {
  const nested = raw.comment;
  const item = (
    nested && typeof nested === 'object'
      ? { ...raw, ...(nested as Record<string, unknown>) }
      : raw
  ) as Record<string, unknown>;
  const user = (item.user ?? item.author ?? raw.user) as
    | Record<string, unknown>
    | undefined;
  const itemId =
    item.item_id != null
      ? String(item.item_id)
      : raw.aweme_id != null
        ? String(raw.aweme_id)
        : undefined;
  const externalCommentId = String(
    item.id ?? item.cid ?? item.comment_id ?? raw.cid ?? ''
  );
  if (!externalCommentId) return null;
  return {
    externalCommentId,
    externalUserId: String(
      user?.uid ?? user?.open_id ?? item.user_id ?? item.uid ?? ''
    ),
    userNickname: String(
      user?.nickname ?? item.nick_name ?? item.nickname ?? ''
    ),
    userHomepage: douyinUserHomepage(user),
    content: String(item.text ?? item.content ?? ''),
    likeCount: Number(item.digg_count ?? item.like_count ?? 0),
    replyCount: Number(item.reply_comment_total ?? item.all_comment_num ?? 0),
    publishedAt: douyinCommentPublishedAt(item),
    sourceContentId: itemId ?? sourceContentId,
    rawPayload: item
  };
}

function douyinReplyArrays(
  raw: Record<string, unknown>
): Array<Record<string, unknown>> {
  const nested =
    raw.comment && typeof raw.comment === 'object'
      ? (raw.comment as Record<string, unknown>)
      : undefined;
  const candidates = [
    raw.reply_comment,
    raw.reply_list,
    raw.reply_comment_list,
    nested?.reply_comment,
    nested?.reply_list
  ];
  const replies: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const row of candidate) {
        if (row && typeof row === 'object') {
          replies.push(row as Record<string, unknown>);
        }
      }
      continue;
    }
    if (candidate && typeof candidate === 'object') {
      const block = candidate as Record<string, unknown>;
      const inner = block.reply_list ?? block.comments ?? block.reply_comment;
      if (Array.isArray(inner)) {
        for (const row of inner) {
          if (row && typeof row === 'object') {
            replies.push(row as Record<string, unknown>);
          }
        }
      }
    }
  }
  return replies;
}

function flattenDouyinComments(
  list: unknown[],
  sourceContentId?: string
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  const walk = (rows: unknown[]) => {
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const mapped = mapDouyinCommentItem(item, sourceContentId);
      if (mapped) {
        const id = String(mapped.externalCommentId);
        if (!seen.has(id)) {
          seen.add(id);
          out.push(mapped);
        }
      }
      walk(douyinReplyArrays(item));
    }
  };

  walk(list);
  return out;
}

/** Extract a normalised comment list from a raw XHR JSON payload. */
export function extractCommentList(
  platform: string,
  json: Record<string, unknown>,
  sourceContentId?: string
): Array<Record<string, unknown>> {
  const data = json?.data as Record<string, unknown> | undefined;

  switch (platform) {
    case 'douyin': {
      const list =
        (Array.isArray(data) ? data : null) ??
        data?.list ??
        data?.comments ??
        data?.comment_info_list ??
        data?.comment_list ??
        data?.comment_notice_list ??
        data?.notice_list ??
        json?.comments ??
        json?.comment_info_list ??
        json?.comment_list ??
        json?.comment_notice_list ??
        json?.notice_list ??
        json?.list;
      if (!Array.isArray(list)) return [];
      return flattenDouyinComments(list, sourceContentId);
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
          const userInfo = (item.user_info ?? item.author ?? item.user) as
            | Record<string, unknown>
            | undefined;
          const itemNoteId =
            item.note_id != null ? String(item.note_id) : undefined;
          const externalCommentId = String(item.id ?? item.comment_id ?? '');
          return {
            externalCommentId,
            externalUserId: String(
              userInfo?.user_id ??
                userInfo?.userid ??
                userInfo?.id ??
                item.user_id ??
                ''
            ),
            userNickname: String(userInfo?.nickname ?? userInfo?.name ?? ''),
            content: String(item.content ?? item.note_content ?? ''),
            likeCount: Number(item.like_count ?? item.liked_count ?? 0),
            replyCount: Number(
              item.sub_comment_count ??
                item.reply_count ??
                item.sub_comment_num ??
                0
            ),
            publishedAt: xhsCommentPublishedAt(item),
            sourceContentId: sourceContentId ?? itemNoteId,
            rawPayload: item
          };
        })
        .filter((item) => item.externalCommentId.length > 0);
    }
    case 'wechat_official': {
      const list = (json?.commentlist ?? data?.commentlist) as
        | Array<Record<string, unknown>>
        | undefined;
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
        rawPayload: item
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
        rawPayload: item
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
        rawPayload: item
      }));
    }
    case 'zhihu': {
      const list = data ?? json?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const author = (item.author ?? item.member) as
          | Record<string, unknown>
          | undefined;
        return {
          externalCommentId: String(item.id ?? item.comment_id ?? ''),
          externalUserId: String(author?.id ?? author?.url_token ?? ''),
          userNickname: String(author?.name ?? ''),
          content: String(
            (item.content ??
              (item.body as Record<string, unknown>)?.content ??
              '') as string
          ),
          likeCount: Number(item.vote_count ?? item.like_count ?? 0),
          replyCount: Number(item.child_comment_count ?? 0),
          publishedAt: item.created_time
            ? new Date(Number(item.created_time) * 1000).toISOString()
            : '',
          sourceContentId,
          rawPayload: item
        };
      });
    }
    default:
      return [];
  }
}

async function scrollForLazyLoad(
  page: import('playwright').Page
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800 + Math.floor(Math.random() * 400));
  }
  await page.waitForTimeout(1500);
}

/**
 * Human-like scroll: varies speed, distance, direction, and pauses.
 * @param rounds How many scroll cycles (default 8)
 */
async function humanLikeScroll(
  page: import('playwright').Page,
  rounds = 8
): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    // Main scroll: 300-1200px downward
    const distance = 300 + Math.floor(Math.random() * 900);
    await page.mouse.wheel(0, distance);

    // Random pause: 600-2000ms (mimics reading)
    const pause = 600 + Math.floor(Math.random() * 1400);
    await page.waitForTimeout(pause);

    // 20% chance to scroll UP a bit (human re-reads)
    if (Math.random() < 0.2) {
      const upDist = 100 + Math.floor(Math.random() * 300);
      await page.mouse.wheel(0, -upDist);
      await page.waitForTimeout(400 + Math.floor(Math.random() * 600));
    }
  }
  // Final settle: wait for any lazy-loaded content
  await page.waitForTimeout(2000);
}

/** XHS note management page — used to discover the latest note ID when none is supplied. */
const XHS_NOTE_MANAGE_URL =
  'https://creator.xiaohongshu.com/creator/notemanage';

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
  '/api/galaxy/creator/home/notemanage'
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

export function pickXhsNoteRef(
  json: Record<string, unknown>
): XhsNoteRef | undefined {
  const data = json.data as Record<string, unknown> | undefined;

  // latest_note_data format: { data: { noteInfo: { id: '...' } } }
  const noteInfo = data?.noteInfo as Record<string, unknown> | undefined;
  if (noteInfo?.id) {
    const xsecToken = noteInfo.xsec_token ?? noteInfo.xsecToken;
    return {
      id: String(noteInfo.id),
      xsecToken: xsecToken != null ? String(xsecToken) : undefined
    };
  }

  // note_detail_new / note list formats: { data: { notes: [{id, note_id}] } }
  const notes = (data?.notes ??
    data?.list ??
    data?.items ??
    json.notes ??
    json.list) as unknown[] | undefined;
  if (Array.isArray(notes) && notes.length > 0) {
    const first = notes[0] as Record<string, unknown>;
    const id = first.note_id ?? first.id ?? first.noteId;
    const xsecToken = first.xsec_token ?? first.xsecToken;
    if (id != null) {
      return {
        id: String(id),
        xsecToken: xsecToken != null ? String(xsecToken) : undefined
      };
    }
  }

  return undefined;
}

function _pickXhsNoteId(json: Record<string, unknown>): string | undefined {
  return pickXhsNoteRef(json)?.id;
}

async function waitForXhsNoteRef(
  page: import('playwright').Page
): Promise<XhsNoteRef | undefined> {
  try {
    const response = await page.waitForResponse(
      (item) =>
        XHS_NOTE_LIST_PATTERNS.some((pattern) => item.url().includes(pattern)),
      { timeout: 10000 }
    );
    return pickXhsNoteRef(
      parseJsonBigInt(await response.text()) as Record<string, unknown>
    );
  } catch {
    return undefined;
  }
}

export function isDouyinEncodedItemId(value: string): boolean {
  return value.startsWith('@') || (value.length > 18 && !/^\d+$/.test(value));
}

function pickDouyinItemIdFromItem(
  item: Record<string, unknown>
): string | undefined {
  return pickSafeDouyinItemId(item);
}

/** Prefer string aweme_id. Numeric item_id/group_id lose the last digits in JSON. */
export function pickSafeDouyinItemId(
  item: Record<string, unknown>
): string | undefined {
  const encodedInJson = JSON.stringify(item).match(
    /"(?:item_id|open_item_id|aweme_id)"\s*:\s*"(@[^"]+)"/
  );
  if (encodedInJson?.[1]) return encodedInJson[1];

  const nested = item.aweme as Record<string, unknown> | undefined;
  const candidates = [
    item.aweme_id,
    nested?.aweme_id,
    item.open_item_id,
    item.item_id,
    item.id,
    item.video_id,
    item.group_id
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    if (isDouyinEncodedItemId(candidate) || /^\d{15,}$/.test(candidate)) {
      return candidate;
    }
  }
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const value = String(candidate);
    if (value && !/0{3,}$/.test(value)) return value;
  }
  for (const candidate of candidates) {
    if (candidate != null) return String(candidate);
  }
  return undefined;
}

function firstRecordArray(
  ...candidates: unknown[]
): Array<Record<string, unknown>> | undefined {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate as Array<Record<string, unknown>>;
    }
  }
  return undefined;
}

export function pickDouyinItemId(
  json: Record<string, unknown>
): string | undefined {
  return pickDouyinWorkItem(json)?.id;
}

export function pickDouyinWorkItem(
  json: Record<string, unknown>
): { id: string; awemeType?: number } | undefined {
  const noticeComments = json.comments;
  const data = json.data as Record<string, unknown> | undefined;
  const items = firstRecordArray(
    noticeComments,
    json.aweme_list,
    data?.aweme_list,
    json.items,
    data?.items,
    data?.item_list,
    json.item_list
  );
  if (!items) return undefined;
  const first = items[0];
  const id = pickDouyinItemIdFromItem(first);
  if (!id) return undefined;
  const awemeType =
    typeof first.aweme_type === 'number' ? first.aweme_type : undefined;
  return { id, awemeType };
}

export function extractDouyinWorkItems(
  json: Record<string, unknown>
): Array<Record<string, unknown>> {
  const noticeComments = json.comments;
  const data = json.data as Record<string, unknown> | undefined;
  return (
    firstRecordArray(
      noticeComments,
      json.aweme_list,
      data?.aweme_list,
      json.items,
      data?.items,
      data?.item_list,
      json.item_list
    ) ?? []
  );
}

function douyinNumericIdsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return false;
  const minLen = Math.min(a.length, b.length, 15);
  return a.slice(0, minLen) === b.slice(0, minLen);
}

function douyinItemMatchesSourceId(
  item: Record<string, unknown>,
  sourceContentId: string
): boolean {
  const needle = sourceContentId.trim();
  if (!needle) return false;
  const id = pickSafeDouyinItemId(item);
  if (id && (id === needle || douyinNumericIdsMatch(id, needle))) return true;
  const candidates = [
    item.aweme_id,
    item.item_id,
    item.open_item_id,
    item.group_id,
    (item.aweme as Record<string, unknown> | undefined)?.aweme_id
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const value = String(candidate);
    if (value === needle || douyinNumericIdsMatch(value, needle)) return true;
  }
  return false;
}

/** Resolve a creator work_list row for inbox sync (prefer comment_count > 0). */
export function findDouyinWorkItemBySourceId(
  json: Record<string, unknown>,
  sourceContentId?: string
): { id: string; awemeType?: number } | undefined {
  const items = extractDouyinWorkItems(json);
  if (items.length === 0) return undefined;

  const pick = (item: Record<string, unknown>) => {
    const id = pickSafeDouyinItemId(item);
    if (!id) return undefined;
    const awemeType =
      typeof item.aweme_type === 'number' ? item.aweme_type : undefined;
    return { id, awemeType };
  };

  if (sourceContentId?.trim()) {
    const matched = items.find((item) =>
      douyinItemMatchesSourceId(item, sourceContentId)
    );
    if (matched) return pick(matched);
  }

  const withComments = items.find((item) => {
    const stat = item.statistics as Record<string, unknown> | undefined;
    const count = Number(
      stat?.comment_count ?? item.comment_count ?? item.commentCount ?? 0
    );
    return count > 0;
  });
  if (withComments) return pick(withComments);

  return pick(items[0]!);
}

export function pickDouyinEncodedItemId(
  json: Record<string, unknown>
): string | undefined {
  const id = pickDouyinItemId(json);
  return id && isDouyinEncodedItemId(id) ? id : undefined;
}

async function openDouyinTargetComments(
  page: import('playwright').Page,
  itemId: string,
  awemeType?: number
): Promise<void> {
  await page.goto(douyinPostCommentUrl(itemId, awemeType), {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(4000);
  await dismissDouyinPopups(page);
  await openDouyinPublicCommentPanel(page);
  await expandDouyinCommentReplies(page);
  await scrollForLazyLoad(page);
  await page.waitForTimeout(2000);
  await humanLikeScroll(page, 2);
}

async function loadDouyinCreatorWorkList(
  page: import('playwright').Page
): Promise<Record<string, unknown> | null> {
  let workList: Record<string, unknown> | null = null;
  const responseTasks: Array<Promise<void>> = [];
  const onResponse = (response: import('playwright').Response) => {
    const task = (async () => {
      const url = response.url();
      if (!DOUYIN_ITEM_LIST_PATTERNS.some((pattern) => url.includes(pattern)))
        return;
      workList = parseJsonBigInt(await response.text()) as Record<
        string,
        unknown
      >;
    })();
    responseTasks.push(task);
  };
  page.on('response', onResponse);
  await page.goto(DOUYIN_CONTENT_MANAGE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(4000);
  await dismissDouyinPopups(page);
  await scrollForLazyLoad(page);
  await page.waitForTimeout(1500);
  page.off('response', onResponse);
  await Promise.allSettled(responseTasks);
  return workList;
}

function dedupeAndFilterTodayComments(
  items: Array<Record<string, unknown>>,
  limit: number
): Array<Record<string, unknown>> {
  return selectTodayOrRecent(
    items,
    (item) => String(item.externalCommentId ?? ''),
    (item) => item.publishedAt,
    { limit, fallbackLimit: RECENT_INTERACTION_FALLBACK_LIMIT }
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
    sendJson(res, 400, {
      error: `Unsupported platform for comment fetching: ${body.platform}`
    });
    return;
  }

  const targetUrl = urlFn(body.sourceContentId);
  const xhrPatterns = COMMENT_API_PATTERNS[body.platform] ?? [];
  const itemIdRef: { encoded?: string; numeric?: string; awemeType?: number } =
    {};
  if (body.sourceContentId) {
    if (isDouyinEncodedItemId(body.sourceContentId))
      itemIdRef.encoded = body.sourceContentId;
    else itemIdRef.numeric = body.sourceContentId;
  }
  const resolveDouyinItemId = () =>
    itemIdRef.encoded ?? itemIdRef.numeric ?? body.sourceContentId;

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl, body.headed);
    const { page } = session;

    const captured: Array<Record<string, unknown>> = [];
    const responseTasks: Array<Promise<void>> = [];

    const rememberDouyinItemId = (json: Record<string, unknown>) => {
      const work = pickDouyinWorkItem(json);
      if (work?.awemeType != null) itemIdRef.awemeType = work.awemeType;
      const encoded = pickDouyinEncodedItemId(json);
      if (encoded) {
        itemIdRef.encoded = encoded;
        return;
      }
      const id = work?.id ?? pickDouyinItemId(json);
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
        // Determine whether this URL carries metadata we need to parse
        const isDouyinItemList =
          body.platform === 'douyin' &&
          DOUYIN_ITEM_LIST_PATTERNS.some((pattern) => url.includes(pattern));
        const isDouyinNoticeComment =
          body.platform === 'douyin' &&
          url.includes('/aweme/v1/creator/notice/comment');
        const isXhsNoteList =
          body.platform === 'xiaohongshu' &&
          !xhsNoteRef.value?.xsecToken &&
          XHS_NOTE_LIST_PATTERNS.some((p) => url.includes(p));
        const isCommentApi = xhrPatterns.some((p) => url.includes(p));

        // Skip URLs that carry no useful data
        if (
          !isDouyinItemList &&
          !isDouyinNoticeComment &&
          !isXhsNoteList &&
          !isCommentApi
        )
          return;

        // Read the response body ONCE — Response.json() can only be called once.
        // Use parseJsonBigInt so comment_id / user uid (18–19 digit integers)
        // survive as strings instead of being truncated by Number coercion.
        let json: Record<string, unknown>;
        try {
          json = parseJsonBigInt(await response.text()) as Record<
            string,
            unknown
          >;
        } catch {
          return; /* non-JSON, skip */
        }

        // Extract Douyin item ID from item-list or notice-comment APIs
        if (isDouyinItemList || isDouyinNoticeComment) {
          try {
            rememberDouyinItemId(json);
          } catch {
            /* skip */
          }
        }

        // Extract XHS note ref for xsec_token
        if (isXhsNoteList) {
          try {
            const note = pickXhsNoteRef(json);
            if (note && (!xhsNoteRef.value || note.id === xhsNoteRef.value.id))
              xhsNoteRef.value = note;
          } catch {
            /* skip */
          }
        }

        // Extract comment data from comment API responses
        if (isCommentApi) {
          try {
            const items = extractCommentList(
              body.platform,
              json,
              body.platform === 'xiaohongshu'
                ? xhsNoteRef.value?.id
                : resolveDouyinItemId()
            );
            captured.push(...items);
          } catch {
            /* skip */
          }
        }
      })();
      responseTasks.push(task);
    };
    page.on('response', responseListener);

    if (body.platform === 'douyin') {
      const workList = await loadDouyinCreatorWorkList(page);
      const target =
        (workList
          ? findDouyinWorkItemBySourceId(workList, body.sourceContentId)
          : undefined) ?? (workList ? pickDouyinWorkItem(workList) : undefined);
      if (target) {
        if (isDouyinEncodedItemId(target.id)) itemIdRef.encoded = target.id;
        else itemIdRef.numeric = target.id;
        if (target.awemeType != null) itemIdRef.awemeType = target.awemeType;
      }
      await Promise.allSettled(responseTasks.splice(0));

      const resolvedId = resolveDouyinItemId();
      if (resolvedId) {
        await openDouyinTargetComments(page, resolvedId, itemIdRef.awemeType);
        await Promise.allSettled(responseTasks.splice(0));
        if (captured.length === 0) {
          captured.push(...(await scrapeDouyinVisibleComments(page)));
        }
      }

      if (captured.length === 0) {
        await openDouyinCommentNoticeInbox(page);
        await Promise.allSettled(responseTasks.splice(0));
        if (captured.length === 0) {
          captured.push(...(await scrapeDouyinVisibleComments(page)));
        }
      }
    } else if (body.platform === 'xiaohongshu' && !body.sourceContentId) {
      // Step 1: note management page → triggers note list API → captures note ID
      await page.goto(XHS_NOTE_MANAGE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      xhsNoteRef.value ??= await waitForXhsNoteRef(page);
      await Promise.allSettled(responseTasks.splice(0));
      // Step 2: if we got a note ref, navigate to its public page where comments load
      if (xhsNoteRef.value) {
        await page.goto(
          xhsNotePublicUrl(xhsNoteRef.value.id, xhsNoteRef.value.xsecToken),
          { waitUntil: 'domcontentloaded', timeout: 30000 }
        );
        await page.waitForTimeout(3000);
        await scrollForLazyLoad(page);
        await page.waitForTimeout(2000);
      }
    } else {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      if (body.platform === 'douyin') {
        await page.waitForTimeout(5000);
        if (body.sourceContentId) {
          await openDouyinPublicCommentPanel(page);
          await scrollForLazyLoad(page);
          await Promise.allSettled(responseTasks.splice(0));
          if (captured.length === 0) {
            await page.goto(douyinPostCommentUrl(body.sourceContentId, 2), {
              waitUntil: 'domcontentloaded',
              timeout: 30000
            });
            await page.waitForTimeout(4000);
            await openDouyinPublicCommentPanel(page);
            await scrollForLazyLoad(page);
          }
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
    sendJson(
      res,
      200,
      dedupeAndFilterTodayComments(captured, body.limit ?? 50)
    );
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

function dedupeAndFilterTodayMessages(
  items: Array<Record<string, unknown>>,
  limit: number
): Array<Record<string, unknown>> {
  return selectTodayOrRecent(
    items,
    (item) => String(item.externalMessageId ?? ''),
    (item) => item.publishedAt,
    { limit, fallbackLimit: RECENT_INTERACTION_FALLBACK_LIMIT }
  );
}

export { isOfficialDouyinInboxNoise };

/** Extract a normalised message list from a raw XHR JSON payload. */
export function extractMessageList(
  platform: string,
  json: Record<string, unknown>
): Array<Record<string, unknown>> {
  const data = json?.data as Record<string, unknown> | undefined;

  switch (platform) {
    case 'douyin': {
      const notice = json.message_notice as Record<string, unknown> | undefined;
      const dataNotice = data?.message_notice as
        | Record<string, unknown>
        | undefined;
      const noticeArrays = [
        ...Object.values(notice ?? {}),
        ...Object.values(dataNotice ?? {})
      ];
      const list =
        firstRecordArray(
          json.user_message_list,
          data?.user_message_list,
          json.message_notice,
          data?.message_notice,
          notice?.list,
          notice?.notice_list,
          notice?.messages,
          dataNotice?.list,
          dataNotice?.notice_list,
          ...noticeArrays,
          data?.list,
          data?.messages,
          data?.message_list,
          data?.notice_list,
          data?.notices,
          data?.conversation_list,
          data?.conversations,
          json.message_list,
          json.notice_list,
          json.list
        ) ?? [];
      return list
        .map((item: Record<string, unknown>) => {
          const lastMessage = (item.last_message ??
            item.lastMessage ??
            item.message) as Record<string, unknown> | undefined;
          const sender = (item.sender ??
            item.from_user ??
            item.user ??
            lastMessage?.sender ??
            item.notice_user) as Record<string, unknown> | undefined;
          const contentRaw =
            item.content ??
            item.text ??
            item.desc ??
            item.title ??
            lastMessage?.content ??
            lastMessage?.text;
          let content = '';
          if (typeof contentRaw === 'string') {
            try {
              content =
                (JSON.parse(contentRaw) as { text?: string }).text ??
                contentRaw;
            } catch {
              content = contentRaw;
            }
          } else if (contentRaw && typeof contentRaw === 'object') {
            const nested = contentRaw as Record<string, unknown>;
            content = String(nested.text ?? nested.content ?? nested.desc ?? '');
          }
          const rawTime =
            item.create_time ??
            item.createTime ??
            item.time_stamp ??
            item.send_time ??
            lastMessage?.create_time ??
            lastMessage?.createTime;
          const timeNum = Number(rawTime);
          return {
            externalMessageId: String(
              item.user_message_id ??
                item.message_id ??
                item.msg_id ??
                lastMessage?.message_id ??
                lastMessage?.msg_id ??
                item.notice_id ??
                item.conversation_id ??
                item.task_id ??
                item.id ??
                ''
            ),
            externalUserId: String(
              sender?.uid ?? sender?.open_id ?? item.user_id ?? item.uid ?? ''
            ),
            userNickname: String(
              sender?.nickname ?? item.nick_name ?? item.nickname ?? ''
            ),
            content,
            type: item.content_type === 'image' ? 'image' : 'text',
            publishedAt:
              rawTime != null && rawTime !== '' && Number.isFinite(timeNum)
                ? timeNum > 1e12
                  ? new Date(timeNum).toISOString()
                  : new Date(timeNum * 1000).toISOString()
                : '',
            rawPayload: item
          };
        })
        .filter(
          (item) =>
            item.externalMessageId.length > 0 &&
            !isOfficialDouyinInboxNoise(item)
        );
    }
    case 'xiaohongshu': {
      const list = data?.chats ?? data?.list ?? data?.messages ?? json?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const userInfo = (item.user_info ?? item.contact ?? item.sender) as
          | Record<string, unknown>
          | undefined;
        return {
          externalMessageId: String(item.id ?? item.message_id ?? ''),
          externalUserId: String(userInfo?.user_id ?? userInfo?.userid ?? ''),
          userNickname: String(userInfo?.nickname ?? ''),
          content: String(item.content ?? item.last_message ?? ''),
          type: item.msg_type === 'image' ? 'image' : 'text',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : '',
          rawPayload: item
        };
      });
    }
    case 'wechat_channels': {
      const list = data?.messages ?? data?.contacts ?? json?.messages;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const sender = (item.sender ?? item.contact) as
          | Record<string, unknown>
          | undefined;
        return {
          externalMessageId: String(item.message_id ?? item.id ?? ''),
          externalUserId: String(sender?.openid ?? item.openid ?? ''),
          userNickname: String(sender?.nickname ?? item.nickname ?? ''),
          content: String(item.content ?? ''),
          type: item.msg_type === 'text' ? 'text' : 'other',
          publishedAt: item.create_time
            ? new Date(Number(item.create_time) * 1000).toISOString()
            : '',
          rawPayload: item
        };
      });
    }
    case 'zhihu': {
      const list = data ?? json?.data;
      if (!Array.isArray(list)) return [];
      return list.map((item: Record<string, unknown>) => {
        const sender = (item.sender ?? item.from_member) as
          | Record<string, unknown>
          | undefined;
        return {
          externalMessageId: String(item.id ?? ''),
          externalUserId: String(sender?.id ?? sender?.url_token ?? ''),
          userNickname: String(sender?.name ?? ''),
          content: String(item.content ?? ''),
          type: item.type === 'image' ? 'image' : 'text',
          publishedAt: item.created_time
            ? new Date(Number(item.created_time) * 1000).toISOString()
            : '',
          rawPayload: item
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
    const messageTasks: Array<Promise<void>> = [];

    const messageListener = (response: import('playwright').Response) => {
      const task = (async () => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        const isSummonIm =
          contentType.includes('json') &&
          url.includes('summon.bytedance.com') &&
          /im|conversation|message|session|inbox|chat/i.test(url);
        if (!xhrPatterns.some((p) => url.includes(p)) && !isSummonIm) return;
        try {
          const json = parseJsonBigInt(await response.text()) as Record<
            string,
            unknown
          >;
          const items = extractMessageList(body.platform, json);
          captured.push(...items);
        } catch {
          /* non-JSON, skip */
        }
      })();
      messageTasks.push(task);
    };
    page.on('response', messageListener);

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await scrollForLazyLoad(page);
    if (body.platform === 'douyin') {
      try {
        await page.getByText('私信', { exact: true }).first().click({
          timeout: 4000
        });
        await page.waitForTimeout(3000);
      } catch {
        /* tab may already be selected */
      }
      const frame = await resolveImFrame(page);
      const root = frame ?? page;
      try {
        await root
          .locator(
            '[class*="conversation"], [class*="session"], [class*="chat-item"], [class*="contact-item"], [class*="msg-item"]'
          )
          .first()
          .click({ timeout: 5000 });
        await page.waitForTimeout(2500);
      } catch {
        await page.waitForTimeout(2000);
      }
    }

    page.off('response', messageListener);
    await Promise.allSettled(messageTasks.splice(0));
    sendJson(
      res,
      200,
      dedupeAndFilterTodayMessages(captured, body.limit ?? 50)
    );
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
  /** Optional comment text — used to locate the comment row by content on
   * pages (douyin public video page) that don't expose data-comment-id. */
  commentText?: string;
}

const handleReplyComment: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as ReplyCommentBody | null;
  if (
    !body?.platform ||
    !body?.cookie ||
    !body?.externalCommentId ||
    !body?.replyText
  ) {
    sendJson(res, 400, {
      error: 'Missing platform, cookie, externalCommentId, or replyText'
    });
    return;
  }

  const replySels = REPLY_SELECTORS[body.platform];
  const urlFn = COMMENT_PAGE_URLS[body.platform];
  if (!replySels || !urlFn) {
    sendJson(res, 400, {
      error: `Unsupported platform for comment reply: ${body.platform}`
    });
    return;
  }

  const targetUrl = urlFn(body.sourceContentId);

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl);
    const { page } = session;

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // On the public video page the comment list is lazy-loaded: it only
    // renders after the comments panel is scrolled into view / clicked. Nudge
    // it so the target comment actually appears in the DOM before we look.
    try {
      await page.waitForSelector('[class*="comment"], [class*="Comment"]', {
        timeout: 8000
      });
      // Scroll the comment panel into view and give it time to fetch.
      await page
        .evaluate(() => {
          const panels = document.querySelectorAll(
            '[class*="comment"], [class*="Comment"]'
          );
          panels.forEach((p) => p.scrollIntoView({ block: 'center' }));
          // Also scroll within the page to trigger lazy-load observers.
          window.scrollBy(0, 400);
        })
        .catch(() => {});
      await page.waitForTimeout(2500);
    } catch {
      // Comments may not have loaded
    }

    // Find the target comment. The public video page does NOT expose
    // data-comment-id on comment nodes, so we locate by data attribute when
    // present, otherwise fall back to matching the comment text (passed by
    // callers as `commentText`), then a vision model as last resort.
    const commentLocator = page
      .locator(
        `[data-comment-id="${body.externalCommentId}"], [data-id="${body.externalCommentId}"]`
      )
      .first();
    const locatedByData = (await commentLocator.count()) > 0;

    // Text fallback: find the comment node whose text equals/contains the
    // passed commentText, then climb to the comment row container.
    let commentRow: import('playwright').Locator | null = locatedByData
      ? commentLocator
      : null;
    if (!commentRow && body.commentText) {
      const byText = page
        .locator(`text=${body.commentText}`)
        .first();
      if (await byText.isVisible({ timeout: 3000 }).catch(() => false)) {
        commentRow = byText;
      }
    }

    // If we located the comment row, hover it to reveal the "回复" button
    // (douyin video page shows reply buttons on hover), then click reply.
    if (commentRow) {
      try {
        await commentRow.hover({ timeout: 3000 });
        await page.waitForTimeout(500);
      } catch {
        /* hover optional */
      }
      // Try clicking the reply button near the located comment, then a
      // page-level "回复" via vision fallback.
      const replyBtn =
        commentRow.locator(replySels.replyButton).first();
      await clickWithVisionFallback(
        page,
        replyBtn,
        '评论旁边的"回复"按钮',
        { timeout: 4000 }
      );
    } else {
      // Couldn't locate the comment row at all — try opening a reply input
      // via vision (model looks for the reply affordance on the page).
      await clickWithVisionFallback(
        page,
        page.locator(replySels.replyButton).first(),
        '"回复"按钮或评论输入区',
        { timeout: 4000 }
      );
    }

    // Type reply text. Try the comment-scoped input, then a page-level
    // input, then — when both selectors miss (hashed classes rotated) —
    // let a vision model find the reply input from a screenshot.
    const replyInputScope = commentRow ?? page;
    const replyInput = replyInputScope.locator(replySels.replyInput).first();
    const pageInput = page.locator(replySels.replyInput).first();
    let replied = false;
    try {
      await replyInput.click({ timeout: 3000 });
      await replyInput.fill(body.replyText);
      replied = true;
    } catch {
      /* try next */
    }
    if (!replied) {
      replied = await fillWithVisionFallback(
        page,
        pageInput,
        '回复评论的输入框',
        body.replyText,
        { timeout: 5000 }
      );
    }
    if (!replied) {
      sendJson(res, 200, {
        success: false,
        errorMessage: '未找到回复输入框(选择器与视觉兜底均失败)'
      });
      return;
    }

    // Submit — comment-scoped, then page-level, then vision fallback.
    const submitScope = commentRow ?? page;
    const submitBtn = submitScope.locator(replySels.submitButton).first();
    const submitted = await clickWithVisionFallback(
      page,
      submitBtn,
      '回复评论的发送/提交按钮',
      { timeout: 4000 }
    );
    if (!submitted) {
      // Enter often submits a reply inline.
      await page.keyboard.press('Enter').catch(() => {});
    }

    // Brief wait for submission confirmation
    await page.waitForTimeout(2000);

    sendJson(res, 200, {
      success: true,
      externalReplyId: `reply-${Date.now()}`
    });
  } catch (err) {
    sendJson(res, 200, {
      success: false,
      errorMessage:
        err instanceof Error ? err.message : 'Unknown error during reply'
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
  if (
    !body?.platform ||
    !body?.cookie ||
    !body?.externalUserId ||
    !body?.messageText
  ) {
    sendJson(res, 400, {
      error: 'Missing platform, cookie, externalUserId, or messageText'
    });
    return;
  }

  const urlFn = MESSAGE_PAGE_URLS[body.platform];
  if (!urlFn) {
    sendJson(res, 200, {
      success: false,
      errorMessage: `Messaging not supported for platform: ${body.platform}`
    });
    return;
  }

  const targetUrl = urlFn();

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl);
    const { page } = session;

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    // Douyin私信 UI is hosted inside an iframe (summon.bytedance.com).
    // Give it time to mount before we reach into its frame.
    await page.waitForTimeout(4000);

    // Resolve the IM frame — douyin renders DMs in a bytedance iframe.
    const frame = await resolveImFrame(page);
    const root = frame ?? page;

    // Try to find and click the conversation with the target user
    const userLink = root
      .locator(
        `[data-id="${body.externalUserId}"], [data-user-id="${body.externalUserId}"], a:has-text("${body.externalUserId}")`
      )
      .first();
    try {
      await userLink.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch {
      // Conversation not found; try typing in the default input
    }

    // Find message input and type. Covers native textarea, contenteditable,
    // and douyin/bytedance IM class variants. Falls back to a vision model
    // (screenshot → "私信输入框在哪") when the selectors miss — douyin's DM
    // UI lives in a bytedance iframe whose class names rotate frequently.
    const messageInput = root
      .locator(
        'textarea, [contenteditable="true"], [class*="message-input"], [class*="msg-input"], [class*="chat-input"], [class*="im-input"]'
      )
      .first();
    const frameArg =
      root !== page ? (root as import('playwright').Frame) : undefined;
    const filled = await fillWithVisionFallback(
      page,
      messageInput,
      '私信/消息输入框(用来输入要发送的文字)',
      body.messageText,
      { timeout: 8000, frame: frameArg }
    );
    if (!filled) {
      sendJson(res, 200, {
        success: false,
        errorMessage: '未找到私信输入框(选择器与视觉兜底均失败)'
      });
      return;
    }

    // Submit — selector first, vision fallback if the send button moved.
    const sendBtn = root
      .locator(
        '[class*="send"], button:has-text("发送"), button:has-text("Send"), button[type="submit"]'
      )
      .first();
    const sent = await clickWithVisionFallback(
      page,
      sendBtn,
      '发送按钮(发送私信)',
      { timeout: 5000, frame: frameArg }
    );
    if (!sent) {
      // Last resort: Enter key often submits in IM clients. Keyboard input
      // goes through the Page (Frame has no keyboard API); focus should
      // already be in the input after fillWithVisionFallback clicked it.
      await page.keyboard.press('Enter').catch(() => {});
    }

    // Brief wait for confirmation
    await page.waitForTimeout(2000);

    sendJson(res, 200, {
      success: true,
      externalReplyId: `msg-reply-${Date.now()}`
    });
  } catch (err) {
    sendJson(res, 200, {
      success: false,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'Unknown error during message reply'
    });
  } finally {
    await session?.close();
  }
};

// ── /assist/list-videos ───────────────────────────────────────────
// Creator content-manage work_list → normalized videos with REAL statistics.
// This is the reliable creator-side data path (public comment/DM pages are rotted).

interface ListVideosBody {
  platform: string;
  cookie: string;
  limit?: number;
  headed?: boolean;
}

const LIST_VIDEOS_PAGE_URLS: Record<string, string> = {
  douyin: 'https://creator.douyin.com/creator-micro/content/manage'
};

const WORK_LIST_API_PATTERNS = ['work_list', '/item/list', '/creator/item/list'];

function douyinVideoPublishedAt(item: Record<string, unknown>): string {
  const raw = (item.create_time ?? item.publish_time ?? item.createTime) as
    | number
    | string
    | null;
  if (raw == null || raw === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
}

function normalizeDouyinVideo(it: Record<string, unknown>) {
  const stat = (it.statistics ?? {}) as Record<string, unknown>;
  const video = (it.video ?? {}) as Record<string, unknown>;
  const cover =
    (it.item_cover as { url_list?: unknown })?.url_list ||
    (video.cover as { url_list?: unknown })?.url_list ||
    (it.cover as { url_list?: unknown })?.url_list;
  return {
    itemId: pickSafeDouyinItemId(it) ?? '',
    desc: String(it.desc ?? it.item_title ?? it.title ?? ''),
    publishedAt: douyinVideoPublishedAt(it),
    statistics: {
      playCount: Number(stat.play_count ?? stat.play ?? 0) || 0,
      diggCount: Number(stat.digg_count ?? 0) || 0,
      commentCount: Number(stat.comment_count ?? 0) || 0,
      shareCount: Number(stat.share_count ?? 0) || 0
    },
    coverUrl: Array.isArray(cover) ? String(cover[0] ?? '') : ''
  };
}

const handleListVideos: RouteHandler = async (_req, res, ctx) => {
  const body = ctx.body as ListVideosBody | null;
  if (!body?.platform || !body?.cookie) {
    sendJson(res, 400, { error: 'Missing platform or cookie' });
    return;
  }
  const targetUrl = LIST_VIDEOS_PAGE_URLS[body.platform];
  if (!targetUrl) {
    sendJson(res, 400, {
      error: `Unsupported platform for listing videos: ${body.platform}`
    });
    return;
  }
  const limit = Math.max(1, Math.min(body.limit ?? 50, 100));

  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  try {
    session = await createSession(body.cookie, targetUrl, body.headed);
    const { page } = session;

    let workList: Record<string, unknown> | null = null;
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (!WORK_LIST_API_PATTERNS.some((p) => url.includes(p))) return;
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        // Parse manually: Douyin item_id/aweme_id are 19-digit integers that
        // exceed Number.MAX_SAFE_INTEGER, so response.json() truncates them
        // (…536000 → …536000 with trailing digits zeroed). A reviver preserves
        // any integer beyond safe-integer range as a string so IDs survive.
        const raw = await response.text();
        workList = parseJsonBigInt(raw) as Record<string, unknown>;
      } catch {
        /* noop */
      }
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(1500);

    // workList is reassigned only inside an async response callback, so CFA
    // narrows it to `null` here — a cast widens it back to the union so the
    // Array.isArray branch doesn't collapse it to `never`.
    const wl = workList as Record<string, unknown> | null;
    const list: unknown[] = Array.isArray(wl?.aweme_list)
      ? wl.aweme_list
      : Array.isArray(wl?.items)
        ? wl.items
        : [];
    const videos = list
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
      .map((it) =>
        body.platform === 'douyin' ? normalizeDouyinVideo(it) : it
      )
      .slice(0, limit);

    sendJson(res, 200, videos);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Failed to list videos',
      errorCode: 'ASSIST_LIST_VIDEOS_FAILED',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await session?.close();
  }
};

// ── Exported route array ──────────────────────────────────────────

export const assistRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/assist/list-videos',
    handler: handleListVideos
  },
  {
    method: 'POST',
    pattern: '/assist/fetch-comments',
    handler: handleFetchComments
  },
  {
    method: 'POST',
    pattern: '/assist/fetch-messages',
    handler: handleFetchMessages
  },
  {
    method: 'POST',
    pattern: '/assist/reply-comment',
    handler: handleReplyComment
  },
  {
    method: 'POST',
    pattern: '/assist/reply-message',
    handler: handleReplyMessage
  },
  {
    method: 'POST',
    pattern: '/assist/search-videos',
    handler: handleSearchVideos
  },
  {
    method: 'POST',
    pattern: '/assist/fetch-search-video-comments',
    handler: handleFetchSearchVideoComments
  },
  {
    method: 'POST',
    pattern: '/assist/fetch-user-profile',
    handler: handleFetchUserProfile
  },
  {
    method: 'POST',
    pattern: '/assist/search-and-fetch-comments',
    handler: handleSearchAndFetchComments
  },
  {
    method: 'POST',
    pattern: '/assist/captcha-session/start',
    handler: async (_req, res, ctx) => {
      const body = ctx.body as { cookie?: string; platform?: string } | null;
      if (!body?.cookie) {
        sendJson(res, 400, { error: 'Missing required field: cookie' });
        return;
      }
      try {
        const started = await startCaptchaSession({
          cookie: body.cookie,
          platform: body.platform || 'douyin'
        });
        sendJson(res, 200, started);
      } catch (error) {
        sendJson(res, 502, {
          error: error instanceof Error ? error.message : '无法打开过码窗口'
        });
      }
    }
  },
  {
    method: 'GET',
    pattern: '/assist/captcha-session/:id/status',
    handler: async (_req, res, ctx) => {
      const status = await getCaptchaSessionStatus(ctx.params.id);
      sendJson(res, 200, status);
    }
  },
  {
    method: 'POST',
    pattern: '/assist/captcha-session/:id/cancel',
    handler: async (_req, res, ctx) => {
      await cancelCaptchaSession(ctx.params.id);
      sendJson(res, 200, { ok: true });
    }
  }
];
