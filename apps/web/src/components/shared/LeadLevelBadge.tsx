import { cn } from '@/lib/utils';
import type { LeadLevel } from '@/types/enums';

const levelStyles: Record<string, string> = {
  A: 'bg-destructive/10 text-destructive border-destructive/25',
  B: 'bg-warning/10 text-warning border-warning/25',
  C: 'bg-info/10 text-info border-info/25',
  D: 'bg-gray-50 text-muted-foreground border-border'
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
        className
      )}
    >
      {level}级
    </span>
  );
}
