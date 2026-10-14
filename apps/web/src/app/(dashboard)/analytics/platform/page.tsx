'use client';

import { useQuery } from '@tanstack/react-query';
import { getPlatformMetrics } from '@/lib/api/analytics';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
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

export default function PlatformAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: getPlatformMetrics
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="平台分析" />
      {data && (
        <div className="rounded-xl border bg-card p-5">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="platform" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }} />
              <Legend />
              <Bar dataKey="publishCount" fill="hsl(var(--chart-1))" name="发布数" />
              <Bar dataKey="leadCount" fill="hsl(var(--chart-2))" name="线索数" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
