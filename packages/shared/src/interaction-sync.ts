const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

function formatShanghaiDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function parsePublishedAt(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const normalized = value > 1e12 ? value : value * 1000;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string' || !value.trim()) return null;

  if (/^\d+$/.test(value.trim())) {
    return parsePublishedAt(Number(value.trim()));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPublishedTodayInShanghai(
  value: unknown,
  now: Date = new Date()
): boolean {
  const parsed = parsePublishedAt(value);
  if (!parsed) return false;
  return formatShanghaiDay(parsed) === formatShanghaiDay(now);
}

export function dedupeByKey<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = getKey(item)?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

export const RECENT_INTERACTION_FALLBACK_LIMIT = 10;

export const DOUYIN_INBOX_NOISE_NICKNAMES = [
  '官方',
  '小助手',
  '系统通知',
  '安全中心'
] as const;

export const DOUYIN_INBOX_NOISE_CONTENTS = [
  '认证清退',
  '逐步清退',
  '账号规范',
  '平台通知',
  '违规提醒',
  '黄V标识'
] as const;

export const DOUYIN_INBOX_NOISE_NOTICE_MARKERS = [
  'official',
  'system',
  'announce',
  'platform_notice'
] as const;

const DOUYIN_INBOX_NOISE_NOTICE_KEYS = [
  'notice_type',
  'scene',
  'message_type',
  'notice_type_name'
] as const;

/**
 * Nickname/content noise — plain text `contains`, safe to negate on any row.
 */
export function officialDouyinInboxNoiseWhere(): Record<string, unknown> {
  return {
    OR: [
      ...DOUYIN_INBOX_NOISE_NICKNAMES.map((marker) => ({
        externalUserName: { contains: marker }
      })),
      ...DOUYIN_INBOX_NOISE_CONTENTS.map((marker) => ({
        content: { contains: marker }
      }))
    ]
  };
}

/**
 * rawPayload path-based notice noise, split from the text noise above.
 * On rows where rawPayload is NULL every JSON-path condition evaluates to
 * SQL NULL, and `NOT (NULL)` is NULL — folding them into one negated OR
 * silently dropped every NULL-payload interaction from list queries. The
 * query site must guard with an explicit `rawPayload IS NULL` arm (see
 * routes.ts) before negating these.
 */
export function officialDouyinInboxNoticeNoiseConditions(): Array<
  Record<string, unknown>
> {
  return DOUYIN_INBOX_NOISE_NOTICE_KEYS.flatMap((key) =>
    DOUYIN_INBOX_NOISE_NOTICE_MARKERS.map((marker) => ({
      rawPayload: { path: [key], string_contains: marker }
    }))
  );
}

export function isOfficialDouyinInboxNoise(item: {
  userNickname?: string | null;
  content?: string | null;
  rawPayload?: unknown;
}): boolean {
  const nick = item.userNickname ?? '';
  const content = item.content ?? '';
  if (DOUYIN_INBOX_NOISE_NICKNAMES.some((marker) => nick.includes(marker))) {
    return true;
  }
  if (DOUYIN_INBOX_NOISE_CONTENTS.some((marker) => content.includes(marker))) {
    return true;
  }
  const raw =
    item.rawPayload && typeof item.rawPayload === 'object'
      ? (item.rawPayload as Record<string, unknown>)
      : {};
  const noticeType = String(
    raw.notice_type ?? raw.scene ?? raw.message_type ?? raw.notice_type_name ?? ''
  );
  return DOUYIN_INBOX_NOISE_NOTICE_MARKERS.some((marker) =>
    noticeType.includes(marker)
  );
}

export interface SelectTodayOrRecentOptions {
  limit?: number;
  fallbackLimit?: number;
  now?: Date;
}

function sortByPublishedAtDesc<T>(
  items: T[],
  getPublishedAt: (item: T) => unknown
): T[] {
  return [...items].sort((a, b) => {
    const ta = parsePublishedAt(getPublishedAt(a))?.getTime() ?? 0;
    const tb = parsePublishedAt(getPublishedAt(b))?.getTime() ?? 0;
    return tb - ta;
  });
}

/** Prefer today's items; if none, return the most recent fallbackLimit items. */
export function selectTodayOrRecent<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
  getPublishedAt: (item: T) => unknown,
  options: SelectTodayOrRecentOptions = {}
): T[] {
  const limit = options.limit ?? 50;
  const fallbackLimit =
    options.fallbackLimit ?? RECENT_INTERACTION_FALLBACK_LIMIT;
  const now = options.now ?? new Date();

  const unique = dedupeByKey(items, getKey);
  const today = unique.filter((item) =>
    isPublishedTodayInShanghai(getPublishedAt(item), now)
  );
  if (today.length > 0) {
    return sortByPublishedAtDesc(today, getPublishedAt).slice(0, limit);
  }

  return sortByPublishedAtDesc(unique, getPublishedAt).slice(0, fallbackLimit);
}
