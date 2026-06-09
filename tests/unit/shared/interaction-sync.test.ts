import { describe, expect, it } from 'vitest';
import {
  dedupeByKey,
  isPublishedTodayInShanghai,
  parsePublishedAt,
  selectTodayOrRecent
} from '../../../packages/shared/src/interaction-sync';

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
    expect(isPublishedTodayInShanghai('2026-05-28T00:30:00+08:00', now)).toBe(
      true
    );
    expect(isPublishedTodayInShanghai('2026-05-27T16:30:00.000Z', now)).toBe(
      true
    );
  });

  it('drops dates from a different shanghai day or invalid dates', () => {
    expect(isPublishedTodayInShanghai('2026-05-27T23:59:59+08:00', now)).toBe(
      false
    );
    expect(isPublishedTodayInShanghai('invalid-date', now)).toBe(false);
  });
});

describe('dedupeByKey', () => {
  it('keeps the first item for each key and skips blank keys', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'a', value: 2 },
      { id: 'b', value: 3 },
      { id: '', value: 4 }
    ];

    expect(dedupeByKey(items, (item) => item.id)).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 3 }
    ]);
  });
});

describe('selectTodayOrRecent', () => {
  const now = new Date('2026-05-28T12:00:00+08:00');

  it('returns today comments when present', () => {
    const selected = selectTodayOrRecent(
      [
        { id: '1', publishedAt: '2026-05-28T08:00:00+08:00' },
        { id: '2', publishedAt: '2026-05-27T10:00:00+08:00' }
      ],
      (item) => item.id,
      (item) => item.publishedAt,
      { now, limit: 50 }
    );

    expect(selected).toEqual([
      { id: '1', publishedAt: '2026-05-28T08:00:00+08:00' }
    ]);
  });

  it('returns 10 most recent comments when there are no today comments', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `c-${index}`,
      publishedAt: `2026-05-${String(20 - index).padStart(2, '0')}T10:00:00+08:00`
    }));

    const selected = selectTodayOrRecent(
      items,
      (item) => item.id,
      (item) => item.publishedAt,
      { now }
    );

    expect(selected).toHaveLength(10);
    expect(selected[0]?.id).toBe('c-0');
    expect(selected[9]?.id).toBe('c-9');
  });
});
