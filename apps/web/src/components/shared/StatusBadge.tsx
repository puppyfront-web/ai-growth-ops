import { cn } from '@/lib/utils';
import {
  statusVariantMap,
  platformLabels,
  riskLevelLabels,
  leadLevelLabels
} from '@/lib/constants';
import { PlatformIcon } from './PlatformIcon';
import type { Platform, RiskLevel, LeadLevel } from '@/types/enums';

// 语义状态色：只允许通过 token 使用（方向 A 约束，见 docs/ui-redesign-plan.md）
const variantStyles = {
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-destructive/10 text-destructive border-destructive/25',
  muted: 'bg-muted text-muted-foreground border-border',
  info: 'bg-info/10 text-info border-info/25'
};

type StatusBadgeProps = {
  status: string;
  label?: string;
  labelsMap?: Record<string, string>;
  className?: string;
};

export function StatusBadge({
  status,
  label,
  labelsMap,
  className
}: StatusBadgeProps) {
  const lowerStatus = status.toLowerCase();
  const variant =
    statusVariantMap[status] ?? statusVariantMap[lowerStatus] ?? 'muted';
  const displayLabel =
    label ?? labelsMap?.[status] ?? labelsMap?.[lowerStatus] ?? status;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {displayLabel}
    </span>
  );
}

/* ---------- PlatformBadge ---------- */

type PlatformBadgeProps = {
  platform: Platform | string;
  showIcon?: boolean;
};

export function PlatformBadge({
  platform,
  showIcon = true
}: PlatformBadgeProps) {
  const p = platform as Platform;
  const name = platformLabels[p] ?? String(platform);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-gray-50 px-2 py-0.5 text-xs font-medium text-foreground">
      {showIcon && <PlatformIcon platform={p} className="h-3 w-3" />}
      {name}
    </span>
  );
}

/* ---------- LeadLevelBadge ---------- */

const leadLevelStyles: Record<LeadLevel, string> = {
  A: 'bg-destructive/10 text-destructive border-destructive/25',
  B: 'bg-warning/10 text-warning border-warning/25',
  C: 'bg-info/10 text-info border-info/25',
  D: 'bg-muted text-muted-foreground border-border'
};

type LeadLevelBadgeProps = {
  level: LeadLevel | string;
};

export function LeadLevelBadge({ level }: LeadLevelBadgeProps) {
  const l = level as LeadLevel;
  const label = leadLevelLabels[l] ?? String(level);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        leadLevelStyles[l] ?? leadLevelStyles.D
      )}
    >
      {label}
    </span>
  );
}

/* ---------- RiskBadge ---------- */

const riskStyles: Record<RiskLevel, string> = {
  low: 'bg-success/10 text-success border-success/25',
  medium: 'bg-warning/10 text-warning border-warning/25',
  high: 'bg-destructive/10 text-destructive border-destructive/25'
};

type RiskBadgeProps = {
  risk?: RiskLevel | string;
  /** @deprecated Use risk instead */
  level?: RiskLevel | string;
};

export function RiskBadge({ risk, level }: RiskBadgeProps) {
  const r = (risk ?? level ?? 'low') as RiskLevel;
  const label = riskLevelLabels[r] ?? String(risk);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        riskStyles[r] ?? riskStyles.low
      )}
    >
      {label}
    </span>
  );
}
