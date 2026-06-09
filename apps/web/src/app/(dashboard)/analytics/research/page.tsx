'use client';

import { useQuery } from '@tanstack/react-query';
import { getLeadTrend, getPlatformMetrics } from '@/lib/api/analytics';
import { listResearchTasks } from '@/lib/api/research';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { formatNumber } from '@/lib/utils';
import { Search, Lightbulb, FileText, TrendingUp } from 'lucide-react';

export default function ResearchAnalyticsPage() {
  const { data: trend, isLoading: loadingTrend } = useQuery({
    queryKey: queryKeys.analytics.leadTrend,
    queryFn: getLeadTrend
  });
  const { data: platforms, isLoading: loadingPlatforms } = useQuery({
    queryKey: queryKeys.analytics.platforms,
    queryFn: getPlatformMetrics
  });
  const { data: tasks, isLoading: loadingTasks } = useQuery({
    queryKey: queryKeys.research.tasks,
    queryFn: listResearchTasks
  });

  if (loadingTrend || loadingPlatforms || loadingTasks)
    return <LoadingState rows={4} />;

  const taskCount = (tasks?.items ?? []).length;
  const completedTasks = (tasks?.items ?? []).filter(
    (t: Record<string, unknown>) => t.status === 'INSIGHT_GENERATED'
  ).length;
  const totalInsights = (tasks?.items ?? []).reduce(
    (sum: number, t: Record<string, unknown>) =>
      sum +
      (Array.isArray((t as Record<string, unknown>).insights)
        ? ((t as Record<string, unknown>).insights as unknown[]).length
        : 0),
    0
  );

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="调研分析" description="调研任务效果和选题转化分析" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              调研任务
            </div>
            <div className="mt-1 text-2xl font-bold">
              {formatNumber(taskCount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              已完成
            </div>
            <div className="mt-1 text-2xl font-bold">
              {formatNumber(completedTasks)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              洞察数
            </div>
            <div className="mt-1 text-2xl font-bold">
              {formatNumber(totalInsights)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              覆盖平台
            </div>
            <div className="mt-1 text-2xl font-bold">
              {platforms?.length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform discovery chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              平台线索趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trend && trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={trend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无趋势数据
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              平台发布分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {platforms && platforms.length > 0 ? (
              <div className="space-y-3">
                {platforms.map((p) => (
                  <div
                    key={p.platform}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">{p.platformLabel}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">
                        发布 {formatNumber(p.publishCount)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        线索 {formatNumber(p.leadCount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无平台数据
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
