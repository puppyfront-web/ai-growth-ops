'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { ChartContainer } from './ChartContainer';
import type { TrendDataPoint } from '@/types/analytics';
import type { DateRange } from '@/types/dashboard';

export type LeadTrendChartProps = {
  data: TrendDataPoint[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  className?: string;
};

function filterByRange(data: TrendDataPoint[], range: DateRange): TrendDataPoint[] {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

export function LeadTrendChart({ data, dateRange, onDateRangeChange, className }: LeadTrendChartProps) {
  const filtered = useMemo(() => filterByRange(data, dateRange), [data, dateRange]);

  if (filtered.length === 0) {
    return (
      <ChartContainer title="线索趋势" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} dateRange={dateRange} onDateRangeChange={onDateRangeChange} className={className}>
        <p className="py-8 text-center text-sm text-muted-foreground">暂无线索数据</p>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title="线索趋势" icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} dateRange={dateRange} onDateRangeChange={onDateRangeChange} className={className}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={filtered} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
            labelFormatter={(label) => `日期: ${label}`}
          />
          <Area type="monotone" dataKey="total" stroke="#10b981" fill="url(#leadGradient)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
