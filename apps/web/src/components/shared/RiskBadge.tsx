import { cn } from '@/lib/utils';
import { riskLevelLabels } from '@/lib/constants';
import type { RiskLevel } from '@/types/enums';

const riskStyles: Record<string, string> = {
  low: 'bg-success/10 text-success border-success/25',
  medium:
    'bg-warning/10 text-warning border-warning/25',
  high: 'bg-destructive/10 text-destructive border-destructive/25'
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
          'bg-gray-50 text-muted-foreground border-border',
        className
      )}
    >
      {riskLevelLabels[level as RiskLevel] ?? String(level)}
    </span>
  );
}
