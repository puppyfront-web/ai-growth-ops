export type ContentRoiInputRow = {
  contentItemId: string;
  title: string;
  type: string;
  publishCount: number;
  publishedCount: number;
  interactionCount: number;
  leadCount: number;
  customerCount: number;
  wonCount: number;
  wonRevenue: number;
};

export type ContentRoiRow = Omit<ContentRoiInputRow, 'wonRevenue'> & {
  wonRevenue: string;
  engagementScore: number;
};

function money(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function compareTitle(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Adds a stable engagement score and sorts content by its acquisition value.
 * The result is capped so the analytics screen never renders an unbounded list.
 */
export function buildContentRoi(
  rows: ContentRoiInputRow[],
  limit = 20
): ContentRoiRow[] {
  return rows
    .map((row) => ({
      ...row,
      wonRevenue: money(row.wonRevenue),
      engagementScore:
        row.interactionCount +
        row.leadCount * 5 +
        row.customerCount * 10 +
        row.wonCount * 20
    }))
    .sort(
      (a, b) =>
        b.leadCount - a.leadCount ||
        b.publishedCount - a.publishedCount ||
        compareTitle(a.title, b.title)
    )
    .slice(0, Math.max(0, limit));
}
