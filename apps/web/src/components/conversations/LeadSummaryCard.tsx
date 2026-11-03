import Link from 'next/link';
import type { LeadSummary } from '@/types/interaction';
import {
  LeadLevelBadge,
  PlatformBadge,
  StatusBadge
} from '@/components/shared/StatusBadge';
import { leadStatusLabels } from '@/lib/constants';

/**
 * 会话/互动关联线索摘要卡片（spec/53 T4）。
 * 后端按 Lead.sourceInteractionId 反查；无线索时后端不返回 leadSummary，
 * 此时组件不渲染任何内容。
 */
export function LeadSummaryCard({
  leadSummary,
  compact = false
}: {
  leadSummary: LeadSummary | null | undefined;
  compact?: boolean;
}) {
  if (!leadSummary) return null;

  return (
    <div
      data-testid="lead-summary-card"
      className={
        compact
          ? 'rounded-md border border-info/25 bg-info/5 p-2.5 text-xs'
          : 'rounded-xl border bg-card p-5'
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={compact ? 'font-medium' : 'font-semibold'}>关联线索</h3>
        <Link
          href={`/leads/${leadSummary.id}`}
          data-testid="lead-summary-link"
          className="text-info hover:underline"
        >
          查看线索
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {leadSummary.name && (
          <span className={compact ? 'font-medium' : 'text-sm font-medium'}>
            {leadSummary.name}
          </span>
        )}
        <StatusBadge
          status={leadSummary.status}
          label={leadStatusLabels[leadSummary.status] ?? leadSummary.status}
        />
        <LeadLevelBadge level={leadSummary.level} />
        <PlatformBadge platform={leadSummary.source} />
      </div>
      {typeof leadSummary.score === 'number' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-muted-foreground">评分</span>
          <span
            data-testid="lead-summary-score"
            className="tabular-nums font-medium"
          >
            {leadSummary.score}
          </span>
        </div>
      )}
    </div>
  );
}
