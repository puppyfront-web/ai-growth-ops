import { cn } from '@/lib/utils';
import { platformLabels, platformIcons } from '@/lib/constants';
import type { Platform } from '@/types/enums';

type PlatformBadgeProps = {
  platform: Platform | string;
  className?: string;
};

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const label = platformLabels[platform as Platform] ?? String(platform);
  const icon = platformIcons[platform as Platform] ?? '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
}
