'use client';

import type { ElementType } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type MetricCardProps = {
  icon: ElementType;
  label: string;
  value: number;
  trendPercent?: number;
  className?: string;
};

export function MetricCard({ icon: Icon, label, value, trendPercent, className }: MetricCardProps) {
  const isUp = trendPercent !== undefined && trendPercent > 0;
  const isDown = trendPercent !== undefined && trendPercent < 0;
  const isNeutral = trendPercent === 0;

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-2xl font-bold">{formatNumber(value)}</div>
        {trendPercent !== undefined && (
          <div
            className={cn('flex items-center gap-0.5 text-xs font-medium', {
              'text-emerald-600': isUp,
              'text-red-500': isDown,
              'text-muted-foreground': isNeutral,
            })}
          >
            {isUp && <ArrowUpRight className="h-3 w-3" />}
            {isDown && <ArrowDownRight className="h-3 w-3" />}
            {isNeutral && <Minus className="h-3 w-3" />}
            {trendPercent !== 0 && `${Math.abs(trendPercent).toFixed(0)}%`}
          </div>
        )}
      </div>
    </Card>
  );
}
