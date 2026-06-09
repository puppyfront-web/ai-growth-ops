'use client';

import { useQuery } from '@tanstack/react-query';
import { getAnalyticsOverview, getLeadTrend } from '@/lib/api/analytics';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatNumber } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function AnalyticsPage() {
  const {
    data: overview,
    isLoading,
    isError: overviewError,
    refetch: refetchOverview
  } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: getAnalyticsOverview
  });
  const { data: trend } = useQuery({
    queryKey: ['lead-trend'],
    queryFn: getLeadTrend
  });

  if (isLoading) return <LoadingState />;
  if (overviewError) return <ErrorState onRetry={() => refetchOverview()} />;

  const metrics = overview
    ? [
        { label: '已发布', value: overview.totalPublished },
        { label: '互动总数', value: overview.totalInteractions },
        { label: '合格线索', value: overview.totalLeads },
        { label: '调研洞察', value: overview.totalResearchInsights },
        { label: '内容项', value: overview.totalContentItems },
        { label: '发布任务', value: overview.totalPublishJobs },
        { label: '平台账号', value: overview.platformAccounts },
        { label: '内容变体', value: overview.contentVariants }
      ]
    : [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="数据复盘" description="运营数据总览与分析" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">{m.label}</div>
            <div className="mt-1 text-2xl font-bold">
              {formatNumber(m.value)}
            </div>
          </div>
        ))}
      </div>

      {trend && trend.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">线索趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
