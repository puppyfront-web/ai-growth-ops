import { cn } from '@/lib/utils';
import { riskLevelLabels } from '@/lib/constants';
import type { RiskLevel } from '@/types/enums';

const riskStyles: Record<string, string> = {
  low: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  medium:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
};

type RiskBadgeProps = {
  level: RiskLevel | string;
  className?: string;
};

export function RiskBadge({ level, className }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        riskStyles[level] ??
          'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
        className
      )}
    >
      {riskLevelLabels[level as RiskLevel] ?? String(level)}
    </span>
  );
}
