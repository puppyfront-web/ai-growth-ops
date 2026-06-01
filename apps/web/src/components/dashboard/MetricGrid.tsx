'use client';

import { Send, Eye, Users, Lightbulb, FileText } from 'lucide-react';
import { MetricCard } from './MetricCard';
import type { DashboardMetrics } from '@/types/dashboard';
import type { TrendDataPoint } from '@/types/analytics';

export type MetricGridProps = {
  metrics: DashboardMetrics;
  leadTrend?: TrendDataPoint[];
};

function computeTrend(data: TrendDataPoint[] | undefined): number | undefined {
  if (!data || data.length < 2) return undefined;
  const half = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, half);
  const secondHalf = data.slice(half);
  const avgFirst = firstHalf.reduce((s, d) => s + (Number(d.total) || 0), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, d) => s + (Number(d.total) || 0), 0) / secondHalf.length;
  if (avgFirst === 0) return avgSecond > 0 ? 100 : 0;
  return Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
}

export function MetricGrid({ metrics, leadTrend }: MetricGridProps) {
  const leadTrendPercent = computeTrend(leadTrend);

  const cards: Array<{
    icon: typeof Send;
    label: string;
    value: number;
    trend?: number;
  }> = [
    { icon: Send, label: '发布任务', value: metrics.publishJobs },
    { icon: Send, label: '已发布', value: metrics.publishedJobs },
    { icon: Eye, label: '互动数', value: metrics.interactions },
    { icon: Users, label: '合格线索', value: metrics.qualifiedLeads, trend: leadTrendPercent },
    { icon: Lightbulb, label: '调研洞察', value: metrics.researchInsights },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <MetricCard key={card.label} icon={card.icon} label={card.label} value={card.value} trendPercent={card.trend} />
      ))}
    </div>
  );
}
