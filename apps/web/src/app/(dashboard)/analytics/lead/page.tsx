'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getAcquisitionAnalytics } from '@/lib/api/analytics';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDate } from '@/lib/utils';
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

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '视频号',
  baijiahao: '百家号',
  zhihu: '知乎'
};

const TASK_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
};

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  active: '跟进中',
  inactive: '暂停',
  won: '已成交',
  lost: '已流失'
};

const FUNNEL_COLORS = ['#0f766e', '#0891b2', '#7c3aed', '#d97706'];

export default function LeadAnalyticsPage() {
  const [days, setDays] = useState<(typeof RANGE_DAYS)[number]>(30);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.analytics.acquisition(days),
    queryFn: () => getAcquisitionAnalytics(days)
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;

  const maxFunnel = Math.max(data.funnel[0]?.count ?? 1, 1);
  const hasActivity = data.kpis.tasks > 0 || data.kpis.candidates > 0;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="获客分析"
        description="查看智能获客策略的产出、潜客质量和转入客户转化"
        actions={
          <div className="flex rounded-md border overflow-hidden">
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 mb-6">
        <Kpi
          label="获客任务"
          value={data.kpis.tasks}
          hint={`${data.kpis.completedTasks} 已完成`}
        />
        <Kpi
          label="潜客"
          value={data.kpis.candidates}
          hint={`均分 ${data.kpis.avgScore}`}
        />
        <Kpi
          label="高意向"
          value={data.kpis.highIntent}
          hint="A 级，或 B 且分≥70"
        />
        <Kpi
          label="转入客户"
          value={data.kpis.convertedCustomers}
          hint={`转化率 ${data.kpis.conversionRate}%`}
        />
        <Kpi
          label="成交"
          value={data.kpis.wonCustomers}
          hint="获客转入后成交"
        />
        <Kpi
          label="采集规模"
          value={data.kpis.videos}
          hint={`${data.kpis.comments} 条评论`}
        />
      </div>

      {!hasActivity ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          这 {days} 天还没有获客任务或潜客。
          <Link
            href="/prospecting"
            className="ml-1 text-primary hover:underline"
          >
            去创建智能获客任务
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-1">转化漏斗</h3>
              <p className="text-xs text-muted-foreground mb-4">
                潜客 → 高意向 → 转入客户 → 成交 · 百分比为相对上一阶段
              </p>
              <div className="space-y-2">
                {data.funnel.map((stage, index) => {
                  const widthPct = Math.max(
                    4,
                    Math.round((stage.count / maxFunnel) * 100)
                  );
                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-muted-foreground">
                        {stage.label}
                      </span>
                      <div className="flex-1 bg-muted/40 rounded h-8 relative overflow-hidden">
                        <div
                          className="h-full flex items-center px-3 text-xs text-white font-medium"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor:
                              FUNNEL_COLORS[index % FUNNEL_COLORS.length]
                          }}
                        >
                          {stage.count}
                        </div>
                      </div>
                      <span className="w-12 text-xs text-muted-foreground text-right tabular-nums">
                        {stage.rateFromPrev}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-1">每日产出</h3>
              <p className="text-xs text-muted-foreground mb-4">
                新识别潜客与当日转入客户
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="candidates"
                    name="潜客"
                    fill="#0f766e"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="converted"
                    name="转入客户"
                    fill="#7c3aed"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-4">潜客等级</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.byLevel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    width={40}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="潜客"
                    fill="#0f766e"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="converted"
                    name="已转入"
                    fill="#7c3aed"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-4">相关度分布</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.byScoreBand}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="key" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="潜客"
                    fill="#0891b2"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="converted"
                    name="已转入"
                    fill="#7c3aed"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-1">策略产出</h3>
              <p className="text-xs text-muted-foreground mb-4">
                按转入客户数排序
              </p>
              {data.byKeyword.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无策略数据</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 font-medium">策略</th>
                      <th className="py-2 px-2 font-medium text-right">潜客</th>
                      <th className="py-2 px-2 font-medium text-right">均分</th>
                      <th className="py-2 px-2 font-medium text-right">转入</th>
                      <th className="py-2 font-medium text-right">转化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byKeyword.map((row) => (
                      <tr key={row.keyword} className="border-b last:border-0">
                        <td className="py-2">{row.keyword}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.candidates}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.avgScore}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.converted}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.conversionRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold mb-1">转入后跟进</h3>
              <p className="text-xs text-muted-foreground mb-4">
                获客转入客户的当前状态
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {data.byCustomerStatus.map((row) => (
                  <Link
                    key={row.status}
                    href={`/customers?status=${row.status}&source=prospecting`}
                    className="rounded-lg border px-3 py-2 hover:bg-accent"
                  >
                    <div className="text-xs text-muted-foreground">
                      {CUSTOMER_STATUS_LABELS[row.status] ?? row.status}
                    </div>
                    <div className="text-xl font-semibold tabular-nums">
                      {row.count}
                    </div>
                  </Link>
                ))}
              </div>
              {data.byPlatform.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {data.byPlatform.map((row) => (
                    <li key={row.key} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {PLATFORM_LABELS[row.key] ?? row.key}
                      </span>
                      <span className="tabular-nums">
                        {row.count} 潜客 · {row.converted} 转入
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-xl border bg-card p-5 mt-4">
            <h3 className="font-semibold mb-1">近期任务</h3>
            <p className="text-xs text-muted-foreground mb-4">
              本周期创建的获客任务及转入结果
            </p>
            {data.recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">本周期暂无任务</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">获客需求</th>
                    <th className="py-2 px-2 font-medium">平台</th>
                    <th className="py-2 px-2 font-medium">状态</th>
                    <th className="py-2 px-2 font-medium text-right">潜客</th>
                    <th className="py-2 px-2 font-medium text-right">转入</th>
                    <th className="py-2 font-medium text-right">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTasks.map((task) => (
                    <tr key={task.id} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/prospecting/${task.id}`}
                          className="text-primary hover:underline"
                        >
                          {task.keywords[0] || '历史获客任务'}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {PLATFORM_LABELS[task.platform] ?? task.platform}
                      </td>
                      <td className="py-2 px-2">
                        {TASK_STATUS_LABELS[task.status] ?? task.status}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {task.candidates}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {task.converted}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {formatDate(task.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
