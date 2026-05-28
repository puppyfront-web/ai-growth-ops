'use client';

type ProgressMeta = {
  stage?: string;
  label?: string;
  percent?: number;
  message?: string;
  updatedAt?: string;
};

function parseProgress(metadata: unknown): ProgressMeta | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const progress = (metadata as Record<string, unknown>).progress;
  if (!progress || typeof progress !== 'object') return null;
  const p = progress as Record<string, unknown>;
  if (typeof p.label !== 'string') return null;
  return {
    stage: typeof p.stage === 'string' ? p.stage : undefined,
    label: p.label,
    percent: typeof p.percent === 'number' ? p.percent : 0,
    message: typeof p.message === 'string' ? p.message : undefined,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
  };
}

export function PublishProgressInline({
  status,
  metadata,
  compact = false,
}: {
  status: string;
  metadata: unknown;
  compact?: boolean;
}) {
  const progress = parseProgress(metadata);
  const showBar = status === 'RUNNING' && progress;

  if (!showBar && status !== 'RUNNING') return null;

  if (status === 'RUNNING' && !progress) {
    return (
      <p className={compact ? 'mt-1 text-xs text-muted-foreground' : 'text-sm text-muted-foreground'}>
        正在执行发布，请稍候…
      </p>
    );
  }

  if (!progress) return null;

  return (
    <div className={compact ? 'mt-2 space-y-1' : 'space-y-2'}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{progress.message ?? progress.label}</span>
        <span className="shrink-0 tabular-nums">{progress.percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, progress.percent ?? 0))}%` }}
        />
      </div>
    </div>
  );
}
