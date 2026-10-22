'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getUnifiedFunnel } from '@/lib/api/analytics';
import { listOverdueFollowUps } from '@/lib/api/deals';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDateTime } from '@/lib/utils';

const RANGE_DAYS = [7, 30, 90] as const;

const CHANNEL_LABELS: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '视频号',
  baijiahao: '百家号',
  zhihu: '知乎',
  manual: '手动录入',
  import: '批量导入',
  referral: '转介绍',
  exhibition: '展会',
  phone: '电话',
  website: '官网',
  partner: '合作伙伴',
  other: '其他'
};

function Kpi({
  label,
  value,
  hint
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function FunnelPage() {
  const [days, setDays] = useState<(typeof RANGE_DAYS)[number]>(30);
  const funnelQuery = useQuery({
    queryKey: ['analytics', 'funnel', days],
    queryFn: () => getUnifiedFunnel(days)
  });
  const overdueQuery = useQuery({
    queryKey: ['follow-ups', 'overdue'],
    queryFn: () => listOverdueFollowUps()
  });

  if (funnelQuery.isLoading) return <LoadingState />;
  if (funnelQuery.isError || !funnelQuery.data) {
    return <ErrorState onRetry={() => funnelQuery.refetch()} />;
  }

  const data = funnelQuery.data;
  const maxCount = Math.max(...data.stages.map((stage) => stage.count), 1);
  const overdue = overdueQuery.data?.items ?? [];
  const hasActivity = data.stages.some((stage) => stage.count > 0);

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="经营漏斗"
        description="从内容到成交的统一口径 · 同一时间窗口内的发生量"
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

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {data.stages.map((stage) => (
          <Kpi
            key={stage.key}
            label={stage.label}
            value={stage.count}
            hint={
              stage.key === 'interactions'
                ? `每条内容 ${stage.ratioFromPrev} 次互动`
                : stage.key === 'published'
                  ? '窗口内发布'
                  : `较上一阶段 ${stage.rateFromPrev}%`
            }
          />
        ))}
      </div>

      {!hasActivity ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          这 {days} 天还没有经营数据。
          <Link href="/content/new" className="ml-1 text-primary hover:underline">
            去创建内容
          </Link>
          <span className="mx-1">或</span>
          <Link href="/prospecting" className="text-primary hover:underline">
            发起获客任务
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold">转化漏斗</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                发布 → 互动 → 线索 → 客户 → 商机 → 成交
              </p>
              <div className="mt-4 space-y-2">
                {data.stages.map((stage) => {
                  const width = Math.max(
                    4,
                    Math.round((stage.count / maxCount) * 100)
                  );
                  return (
                    <div key={stage.key} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-muted-foreground">
                        {stage.label}
                      </span>
                      <div className="relative h-8 flex-1 overflow-hidden rounded bg-muted/40">
                        <div
                          className="flex h-full items-center bg-primary/80 px-2 text-xs font-medium text-primary-foreground"
                          style={{ width: `${width}%` }}
                        >
                          {stage.count}
                        </div>
                      </div>
                      <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {stage.key === 'published'
                          ? '基准'
                          : stage.key === 'interactions'
                            ? `${stage.ratioFromPrev}×`
                            : `${stage.rateFromPrev}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold">收入</h3>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Kpi
                  label="在手 pipeline"
                  value={`¥${Number(data.revenue.pipelineValue).toLocaleString('zh-CN')}`}
                />
                <Kpi
                  label="窗口内成交额"
                  value={`¥${Number(data.revenue.wonRevenue).toLocaleString('zh-CN')}`}
                />
                <Kpi
                  label="客单价"
                  value={`¥${Number(data.revenue.avgDealSize).toLocaleString('zh-CN')}`}
                  hint="仅统计有金额的赢单"
                />
              </div>

              <h4 className="mt-5 text-sm font-medium">逾期跟进</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                线索 {data.overdue.leads} · 客户 {data.overdue.customers} · 商机{' '}
                {data.overdue.deals}
              </p>
              {overdue.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {overdue.slice(0, 5).map((item) => (
                    <li
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                    >
                      <Link
                        href={item.href}
                        className="min-w-0 truncate text-primary hover:underline"
                      >
                        {item.name}
                      </Link>
                      <span className="shrink-0 text-xs text-destructive">
                        逾期 {item.overdueHours} 小时
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(item.nextActionAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  没有逾期记录。
                </p>
              )}
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold">渠道质量</h3>
              {data.byChannel.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  暂无渠道数据。
                </p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2">渠道</th>
                      <th className="pb-2 text-right">线索</th>
                      <th className="pb-2 text-right">客户</th>
                      <th className="pb-2 text-right">成交</th>
                      <th className="pb-2 text-right">成交额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byChannel.map((row) => (
                      <tr key={row.channel} className="border-b last:border-0">
                        <td className="py-2">
                          {CHANNEL_LABELS[row.channel] ?? row.channel}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.leads}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.customers}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.won}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          ¥{Number(row.revenue).toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold">内容贡献</h3>
              {data.byContent.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  暂无内容归因数据。
                </p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2">内容</th>
                      <th className="pb-2 text-right">互动</th>
                      <th className="pb-2 text-right">线索</th>
                      <th className="pb-2 text-right">成交</th>
                      <th className="pb-2 text-right">成交额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byContent.map((row) => (
                      <tr
                        key={row.contentItemId}
                        className="border-b last:border-0"
                      >
                        <td className="max-w-[180px] truncate py-2">
                          <Link
                            href={`/content/${row.contentItemId}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.title}
                          </Link>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.interactions}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.leads}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.won}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          ¥{Number(row.revenue).toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
