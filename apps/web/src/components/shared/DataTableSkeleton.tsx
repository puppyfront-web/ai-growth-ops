import { cn } from '@/lib/utils';

type DataTableSkeletonProps = {
  columns?: number;
  rows?: number;
  className?: string;
};

export function DataTableSkeleton({ columns = 4, rows = 5, className }: DataTableSkeletonProps) {
  return (
    <div className={cn('rounded-lg border', className)}>
      {/* Header */}
      <div className="border-b bg-muted/50 px-4 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-muted flex-1"
            style={{ maxWidth: `${100 / columns}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="border-b last:border-0 px-4 py-3 flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 animate-pulse rounded bg-muted flex-1"
              style={{ maxWidth: `${100 / columns}%`, width: `${60 + Math.random() * 30}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
