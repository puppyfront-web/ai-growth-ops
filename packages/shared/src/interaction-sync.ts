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
