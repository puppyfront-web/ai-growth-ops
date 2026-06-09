'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { ChartContainer } from './ChartContainer';
import type { TrendDataPoint } from '@/types/analytics';
import type { DateRange } from '@/types/dashboard';
import { platformColorMap, platformLabels } from '@/lib/constants';

export type PlatformTrendChartProps = {
  data: TrendDataPoint[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  className?: string;
};

function filterByRange(
  data: TrendDataPoint[],
  range: DateRange
): TrendDataPoint[] {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function getPlatformKeys(data: TrendDataPoint[]): string[] {
  const keys = new Set<string>();
  data.forEach((d) => {
    Object.keys(d).forEach((k) => {
      if (k !== 'date' && k !== 'total') keys.add(k);
    });
  });
  return Array.from(keys);
}

export function PlatformTrendChart({
  data,
  dateRange,
  onDateRangeChange,
  className
}: PlatformTrendChartProps) {
  const filtered = useMemo(
    () => filterByRange(data, dateRange),
    [data, dateRange]
  );
  const platformKeys = useMemo(() => getPlatformKeys(filtered), [filtered]);

  if (filtered.length === 0) {
    return (
      <ChartContainer
        title="平台发布趋势"
        icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        className={className}
      >
        <p className="py-8 text-center text-sm text-muted-foreground">
          暂无发布数据
        </p>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title="平台发布趋势"
      icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
      dateRange={dateRange}
      onDateRangeChange={onDateRangeChange}
      className={className}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={filtered}
          margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid hsl(var(--border))'
            }}
            labelFormatter={(label) => `日期: ${label}`}
          />
          <Legend
            formatter={(value: string) =>
              platformLabels[value as keyof typeof platformLabels] ?? value
            }
          />
          {platformKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={platformColorMap[key] ?? '#6b7280'}
              radius={
                platformKeys.indexOf(key) === platformKeys.length - 1
                  ? [4, 4, 0, 0]
                  : undefined
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
