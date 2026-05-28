import { describe, expect, it } from 'vitest';
import { dedupeByKey, isPublishedTodayInShanghai, parsePublishedAt } from '../../../packages/shared/src/interaction-sync';

describe('parsePublishedAt', () => {
  it('parses seconds timestamps', () => {
    const date = parsePublishedAt(1748448000);
    expect(date?.toISOString()).toBe('2025-05-28T16:00:00.000Z');
  });

  it('returns null for invalid values', () => {
    expect(parsePublishedAt('not-a-date')).toBeNull();
    expect(parsePublishedAt(undefined)).toBeNull();
  });
});

describe('isPublishedTodayInShanghai', () => {
  const now = new Date('2026-05-28T12:00:00+08:00');

  it('keeps dates from the same shanghai day', () => {
    expect(isPublishedTodayInShanghai('2026-05-28T00:30:00+08:00', now)).toBe(true);
    expect(isPublishedTodayInShanghai('2026-05-27T16:30:00.000Z', now)).toBe(true);
  });

  it('drops dates from a different shanghai day or invalid dates', () => {
    expect(isPublishedTodayInShanghai('2026-05-27T23:59:59+08:00', now)).toBe(false);
    expect(isPublishedTodayInShanghai('invalid-date', now)).toBe(false);
  });
});

describe('dedupeByKey', () => {
  it('keeps the first item for each key and skips blank keys', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'a', value: 2 },
      { id: 'b', value: 3 },
      { id: '', value: 4 },
    ];

    expect(dedupeByKey(items, (item) => item.id)).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 3 },
    ]);
  });
});
