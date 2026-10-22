import { describe, expect, it } from 'vitest';
import {
  buildContentRoi,
  type ContentRoiInputRow
} from '../../../packages/shared/src/content-roi';

function row(
  overrides: Partial<ContentRoiInputRow> = {}
): ContentRoiInputRow {
  return {
    contentItemId: 'content-1',
    title: '获客指南',
    type: 'text_image',
    publishCount: 2,
    publishedCount: 2,
    interactionCount: 80,
    leadCount: 12,
    customerCount: 6,
    wonCount: 1,
    wonRevenue: 12000,
    ...overrides
  };
}

describe('buildContentRoi', () => {
  it('computes an engagement score and formats revenue', () => {
    const [result] = buildContentRoi([row()]);
    expect(result?.engagementScore).toBe(80 + 12 * 5 + 6 * 10 + 1 * 20);
    expect(result?.wonRevenue).toBe('12000.00');
  });

  it('sorts by leads, then published count, then title', () => {
    const result = buildContentRoi([
      row({ contentItemId: 'a', title: 'A', leadCount: 5 }),
      row({ contentItemId: 'b', title: 'B', leadCount: 12 }),
      row({ contentItemId: 'c', title: 'C', leadCount: 5, publishedCount: 9 }),
      row({ contentItemId: 'd', title: 'D', leadCount: 5, publishedCount: 9 })
    ]);

    expect(result.map((item) => item.contentItemId)).toEqual([
      'b',
      'c',
      'd',
      'a'
    ]);
  });

  it('caps the result at 20 rows', () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      row({ contentItemId: `content-${index}`, title: `内容 ${index}` })
    );
    expect(buildContentRoi(rows)).toHaveLength(20);
  });

  it('handles empty input', () => {
    expect(buildContentRoi([])).toEqual([]);
  });
});
