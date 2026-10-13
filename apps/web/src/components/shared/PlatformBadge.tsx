import { cn } from '@/lib/utils';
import { platformLabels } from '@/lib/constants';
import type { Platform } from '@/types/enums';
import { PlatformIcon } from './PlatformIcon';

type PlatformBadgeProps = {
  platform: Platform | string;
  className?: string;
};

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const label = platformLabels[platform as Platform] ?? String(platform);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      <PlatformIcon platform={platform} className="h-3 w-3" />
      {label}
    </span>
  );
}
