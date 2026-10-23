'use client';

import type { ProspectCandidate } from '@/lib/api/prospecting';
import { candidateComments, prospectLevelLabels } from './prospect-shared';

type ProspectListRowProps = {
  candidate: ProspectCandidate;
  selected: boolean;
  onSelect: (candidate: ProspectCandidate) => void;
};

/** 双栏布局左侧的高密度潜客行：点击选中，详情在右栏展示。 */
export function ProspectListRow({
  candidate: c,
  selected,
  onSelect
}: ProspectListRowProps) {
  const excerpt = candidateComments(c)[0]?.content ?? '';
  return (
    <button
      type="button"
      id={`candidate-${c.id}`}
      aria-pressed={selected}
      onClick={() => onSelect(c)}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors scroll-mt-24 ${
        selected
          ? 'border-primary bg-muted/50'
          : 'border-transparent hover:bg-muted/40'
      }`}
    >
      {c.avatarUrl ? (
        <img
          src={c.avatarUrl}
          alt=""
          className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs">
          {(c.userNickname ?? '?').slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {c.userNickname ?? '未知用户'}
          </span>
          <span
            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${
              c.leadLevel === 'A'
                ? 'bg-success/10 text-success'
                : c.leadLevel === 'B'
                  ? 'bg-info/10 text-info'
                  : c.leadLevel === 'C'
                    ? 'bg-warning/10 text-warning'
                    : 'bg-muted text-muted-foreground'
            }`}
          >
            {prospectLevelLabels[c.leadLevel] ?? c.leadLevel}
          </span>
          {c.customerId && (
            <span className="flex-shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              已转客户
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {excerpt}
        </span>
      </span>
      <span className="flex-shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
        {c.relevanceScore}
      </span>
    </button>
  );
}
