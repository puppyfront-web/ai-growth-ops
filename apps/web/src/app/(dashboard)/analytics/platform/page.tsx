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
      <PageHeader title="平台分析" description="按平台对比运营效果" />
      {data && (
        <div className="rounded-xl border bg-card p-5">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="platform" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="publishCount" fill="#94a3b8" name="发布数" />
              <Bar dataKey="leadCount" fill="#dc2626" name="线索数" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
