'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DateRange } from '@/types/dashboard';

export type ChartContainerProps = {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  className?: string;
};

const rangeOptions: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' },
  { value: '90d', label: '90天' },
];

export function ChartContainer({ title, icon, children, dateRange, onDateRangeChange, className }: ChartContainerProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        {dateRange && onDateRangeChange && (
          <div className="flex items-center gap-1">
            {rangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onDateRangeChange(opt.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  dateRange === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
