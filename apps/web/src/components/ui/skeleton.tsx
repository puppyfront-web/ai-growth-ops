'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

function Skeleton({ className, lines, ...props }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 animate-pulse rounded-md bg-muted',
              i === lines - 1 && 'w-3/4',
              className
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
