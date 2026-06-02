import { cn } from '@/lib/utils';
import type { LeadLevel } from '@/types/enums';

const levelStyles: Record<string, string> = {
  A: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  B: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  C: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  D: 'bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700',
};

type LeadLevelBadgeProps = {
  level: LeadLevel | string;
  className?: string;
};

export function LeadLevelBadge({ level, className }: LeadLevelBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold',
        levelStyles[level] ?? levelStyles.C,
        className,
      )}
    >
      {level}级
    </span>
  );
}
