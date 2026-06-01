import { cn } from '@/lib/utils';
import { riskLevelLabels } from '@/lib/constants';
import type { RiskLevel } from '@/types/enums';

const riskStyles: Record<string, string> = {
  low: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
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
        riskStyles[level] ?? 'bg-gray-50 text-gray-600 border-gray-200',
        className,
      )}
    >
      {riskLevelLabels[level as RiskLevel] ?? String(level)}
    </span>
  );
}
