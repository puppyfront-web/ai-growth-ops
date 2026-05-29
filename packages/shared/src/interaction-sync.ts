const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

function formatShanghaiDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

export function isPublishedTodayInShanghai(value: unknown, now: Date = new Date()): boolean {
  const parsed = parsePublishedAt(value);
  if (!parsed) return false;
  return formatShanghaiDay(parsed) === formatShanghaiDay(now);
}

export function dedupeByKey<T>(items: T[], getKey: (item: T) => string | null | undefined): T[] {
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

export interface SelectTodayOrRecentOptions {
  limit?: number;
  fallbackLimit?: number;
  now?: Date;
}

function sortByPublishedAtDesc<T>(
  items: T[],
  getPublishedAt: (item: T) => unknown,
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
  options: SelectTodayOrRecentOptions = {},
): T[] {
  const limit = options.limit ?? 50;
  const fallbackLimit = options.fallbackLimit ?? RECENT_INTERACTION_FALLBACK_LIMIT;
  const now = options.now ?? new Date();

  const unique = dedupeByKey(items, getKey);
  const today = unique.filter((item) => isPublishedTodayInShanghai(getPublishedAt(item), now));
  if (today.length > 0) {
    return sortByPublishedAtDesc(today, getPublishedAt).slice(0, limit);
  }

  return sortByPublishedAtDesc(unique, getPublishedAt).slice(0, fallbackLimit);
}
