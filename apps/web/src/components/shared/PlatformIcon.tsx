import { Globe } from 'lucide-react';
import { platformIcons } from '@/lib/constants';
import type { Platform } from '@/types/enums';
import { cn } from '@/lib/utils';

type PlatformIconProps = {
  platform: Platform | string;
  className?: string;
};

export function PlatformIcon({ platform, className }: PlatformIconProps) {
  const Icon = platformIcons[platform as Platform] ?? Globe;
  return <Icon className={cn('h-4 w-4', className)} />;
}
