import { cn } from '@/lib/utils';
import { statusVariantMap, platformLabels, platformIcons, riskLevelLabels, leadLevelLabels } from '@/lib/constants';
import type { Platform, RiskLevel, LeadLevel } from '@/types/enums';

const variantStyles = {
  success: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  muted: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
};

type StatusBadgeProps = {
  status: string;
  label?: string;
  labelsMap?: Record<string, string>;
  className?: string;
};

export function StatusBadge({ status, label, labelsMap, className }: StatusBadgeProps) {
  const lowerStatus = status.toLowerCase();
  const variant = statusVariantMap[status] ?? statusVariantMap[lowerStatus] ?? 'muted';
  const displayLabel = label ?? labelsMap?.[status] ?? labelsMap?.[lowerStatus] ?? status;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
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

export function PlatformBadge({ platform, showIcon = true }: PlatformBadgeProps) {
  const p = platform as Platform;
  const name = platformLabels[p] ?? String(platform);
  const icon = platformIcons[p] ?? '';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {showIcon && icon && <span>{icon}</span>}
      {name}
    </span>
  );
}

/* ---------- LeadLevelBadge ---------- */

const leadLevelStyles: Record<LeadLevel, string> = {
  A: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  B: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  C: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  D: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
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
        leadLevelStyles[l] ?? leadLevelStyles.D,
      )}
    >
      {label}
    </span>
  );
}

/* ---------- RiskBadge ---------- */

const riskStyles: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
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
        riskStyles[r] ?? riskStyles.low,
      )}
    >
      {label}
    </span>
  );
}
