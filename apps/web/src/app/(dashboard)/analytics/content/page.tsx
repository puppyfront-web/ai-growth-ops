'use client';

import { useQuery } from '@tanstack/react-query';
import { getContentMetrics } from '@/lib/api/analytics';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ContentAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['content-metrics'], queryFn: getContentMetrics });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="内容分析" description="哪条内容带来最多线索？" />
      {data && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">内容线索排行</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="title" type="category" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="publishCount" fill="#0f766e" name="发布数" />
              <Bar dataKey="publishedCount" fill="#dc2626" name="已发布数" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
