'use client';

import { useQuery } from '@tanstack/react-query';
import { getAnalyticsOverview, getLeadTrend } from '@/lib/api/analytics';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function LeadAnalyticsPage() {
  const { data: overview, isLoading, isError: overviewError, refetch: refetchOverview } = useQuery({ queryKey: ['analytics-overview'], queryFn: getAnalyticsOverview });
  const { data: trend } = useQuery({ queryKey: ['lead-trend'], queryFn: getLeadTrend });

  if (isLoading) return <LoadingState />;
  if (overviewError) return <ErrorState onRetry={() => refetchOverview()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="线索分析" description="线索来源、等级和转化分析" />
      {overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">合格线索</div><div className="text-2xl font-bold">{overview.totalLeads}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">互动总数</div><div className="text-2xl font-bold">{overview.totalInteractions}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">内容项</div><div className="text-2xl font-bold">{overview.totalContentItems}</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-sm text-muted-foreground">选题机会</div><div className="text-2xl font-bold">{overview.contentOpportunities}</div></div>
        </div>
      )}
      {trend && trend.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">线索趋势</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
