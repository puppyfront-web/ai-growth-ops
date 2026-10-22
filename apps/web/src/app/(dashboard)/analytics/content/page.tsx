'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getContentMetrics } from '@/lib/api/analytics';
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

const RANGE_DAYS = [7, 30, 90] as const;

export default function ContentAnalyticsPage() {
  const [days, setDays] = useState<(typeof RANGE_DAYS)[number]>(30);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['content-metrics', days],
    queryFn: () => getContentMetrics(days)
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const rows = data ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="内容分析"
        description="每条内容带来的互动、线索与成交"
        actions={
          <div className="flex overflow-hidden rounded-md border">
            {RANGE_DAYS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={`px-3 py-1.5 text-sm ${
                  days === value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                }`}
              >
                {value} 天
              </button>
            ))}
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          这 {days} 天还没有内容数据。
          <Link href="/content/new" className="ml-1 text-primary hover:underline">
            去创建内容
          </Link>
        </div>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">内容获取漏斗</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              发布、互动、线索、成交按内容归因；无来源线索不计入。
            </p>
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={rows} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey="title"
                  type="category"
                  width={160}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))'
                  }}
                />
                <Legend />
                <Bar dataKey="publishedCount" fill="hsl(var(--chart-1))" name="发布" />
                <Bar dataKey="interactionCount" fill="hsl(var(--chart-2))" name="互动" />
                <Bar dataKey="leadCount" fill="hsl(var(--chart-3))" name="线索" />
                <Bar dataKey="wonCount" fill="hsl(var(--chart-4))" name="成交" />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="mt-4 rounded-xl border bg-card p-5">
            <h3 className="font-semibold">内容明细</h3>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2">内容</th>
                  <th className="pb-2 text-right">发布</th>
                  <th className="pb-2 text-right">互动</th>
                  <th className="pb-2 text-right">线索</th>
                  <th className="pb-2 text-right">客户</th>
                  <th className="pb-2 text-right">成交</th>
                  <th className="pb-2 text-right">成交额</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.contentItemId} className="border-b last:border-0">
                    <td className="max-w-[280px] truncate py-2">
                      <Link
                        href={`/content/${row.contentItemId}`}
                        className="hover:text-primary hover:underline"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.publishedCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.interactionCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.leadCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.customerCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.wonCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{Number(row.wonRevenue).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
