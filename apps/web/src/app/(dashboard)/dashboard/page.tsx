'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '@/lib/api/dashboard';
import { getLeadTrend, getPlatformTrend, getPlatformMetrics } from '@/lib/api/analytics';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PlatformBadge } from '@/components/shared/StatusBadge';
import { LeadLevelBadge } from '@/components/shared/StatusBadge';
import { publishStatusLabels, contentTypeLabels } from '@/lib/constants';
import { MetricGrid } from '@/components/dashboard/MetricGrid';
import { LeadFunnelCard } from '@/components/dashboard/LeadFunnelCard';
import { PlatformBreakdownCard } from '@/components/dashboard/PlatformBreakdownCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { LeadTrendChart } from '@/components/charts/LeadTrendChart';
import { PlatformTrendChart } from '@/components/charts/PlatformTrendChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Send, Users } from 'lucide-react';
import Link from 'next/link';
import type { DateRange } from '@/types/dashboard';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const { data, isLoading, error, refetch } = useQuery({ queryKey: queryKeys.dashboard.all, queryFn: getDashboard });
  const { data: leadTrend } = useQuery({ queryKey: [...queryKeys.dashboard.trends(dateRange), 'leads'], queryFn: getLeadTrend });
  const { data: platformTrend } = useQuery({ queryKey: [...queryKeys.dashboard.trends(dateRange), 'platforms'], queryFn: getPlatformTrend });
  const { data: platformMetrics } = useQuery({ queryKey: queryKeys.analytics.platforms, queryFn: getPlatformMetrics });

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message="加载工作台数据失败" onRetry={() => refetch()} />;
  if (!data) return null;

  const m = data.metrics;

  return (
    <div className="space-y-6">
      <Breadcrumb />
      <PageHeader title="运营工作台" description="运营数据总览" />

      {/* Metric Cards with Trends */}
      <MetricGrid metrics={m} leadTrend={leadTrend} />

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeadTrendChart data={leadTrend ?? []} dateRange={dateRange} onDateRangeChange={setDateRange} />
        <PlatformTrendChart data={platformTrend ?? []} dateRange={dateRange} onDateRangeChange={setDateRange} />
      </div>

      {/* Middle Row: Funnel + Platforms + Quick Actions */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <LeadFunnelCard qualifiedLeads={m.qualifiedLeads} totalLeads={m.interactions} />
        <PlatformBreakdownCard data={platformMetrics ?? []} />
        <QuickActions />
      </div>

      {/* Bottom Row: Recent Activity Lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Publish Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base font-semibold">最近发布任务</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentPublishJobs.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无发布任务</p>
              )}
              {data.recentPublishJobs.map((job) => (
                <Link key={job.id} href={`/publish/jobs/${job.id}`} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={job.platform} />
                    <span className="text-xs text-muted-foreground">{contentTypeLabels[job.contentType] ?? job.contentType}</span>
                  </div>
                  <StatusBadge status={job.status} label={publishStatusLabels[job.status as keyof typeof publishStatusLabels]} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Lead Summaries */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-base font-semibold">线索概览</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.leadSummaries.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无线索</p>
              )}
              {data.leadSummaries.map((lead) => (
                <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{lead.name}</span>
                    <LeadLevelBadge level={lead.level} />
                  </div>
                  <StatusBadge status={lead.status} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {data.insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-semibold">调研洞察</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {data.insights.map((insight) => (
                <Link key={insight.id} href="/research/insights" className="block rounded-lg border p-3 transition-colors hover:bg-accent/50">
                  <div className="text-sm font-medium">{insight.title}</div>
                  {insight.summary && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{insight.summary}</div>}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
