import { cn } from '@/lib/utils';
import { statusVariantMap } from '@/lib/constants';

const variantStyles = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  muted: 'bg-gray-50 text-gray-600 border-gray-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
};

type StatusBadgeProps = {
  status: string;
  label?: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const variant = statusVariantMap[status] ?? 'muted';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {label ?? status}
    </span>
  );
}

type RiskBadgeProps = {
  level: string;
  className?: string;
};

export function RiskBadge({ level, className }: RiskBadgeProps) {
  const variant = statusVariantMap[level] ?? 'muted';
  const labels: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {labels[level] ?? level}
    </span>
  );
}

type LeadLevelBadgeProps = {
  level: string;
  className?: string;
};

export function LeadLevelBadge({ level, className }: LeadLevelBadgeProps) {
  const styles: Record<string, string> = {
    A: 'bg-red-50 text-red-700 border-red-200',
    B: 'bg-orange-50 text-orange-700 border-orange-200',
    C: 'bg-gray-50 text-gray-600 border-gray-200',
    D: 'bg-gray-50 text-gray-400 border-gray-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold',
        styles[level] ?? styles.C,
        className,
      )}
    >
      {level}级
    </span>
  );
}

type PlatformBadgeProps = {
  platform: string;
  className?: string;
};

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const labels: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    wechat_official: '公众号',
    wechat_channels: '视频号',
    baijiahao: '百家号',
    zhihu: '知乎',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {labels[platform] ?? platform}
    </span>
  );
}
