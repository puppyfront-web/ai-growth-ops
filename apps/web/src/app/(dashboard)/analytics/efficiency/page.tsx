'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMarketingCost,
  deleteMarketingCost,
  getAttributionAnalytics,
  getEfficiencyAnalytics,
  getForecastAnalytics,
  listMarketingCosts,
  type CostCategory
} from '@/lib/api/efficiency';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';

const RANGE_DAYS = [7, 30, 90] as const;

const CHANNEL_LABELS: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '视频号',
  baijiahao: '百家号',
  zhihu: '知乎',
  manual: '手动',
  import: '导入',
  referral: '转介绍',
  exhibition: '展会',
  phone: '电话',
  website: '官网',
  partner: '合作伙伴',
  other: '其他'
};

const CATEGORY_LABELS: Record<CostCategory, string> = {
  ad: '广告投放',
  content: '内容制作',
  labor: '人力',
  tool: '工具',
  other: '其他'
};

const MODELS = [
  ['last_touch', '末触归因'],
  ['first_touch', '首触归因'],
  ['linear', '线性归因']
] as const;

export default function EfficiencyPage() {
  const qc = useQueryClient();
  const [days, setDays] = useState<(typeof RANGE_DAYS)[number]>(30);
  const [model, setModel] =
    useState<'first_touch' | 'last_touch' | 'linear'>('last_touch');
  const [channel, setChannel] = useState('douyin');
  const [category, setCategory] = useState<CostCategory>('ad');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const efficiency = useQuery({
    queryKey: ['efficiency', days],
    queryFn: () => getEfficiencyAnalytics(days)
  });
  const attribution = useQuery({
    queryKey: ['attribution', days, model],
    queryFn: () => getAttributionAnalytics(days, model)
  });
  const costs = useQuery({
    queryKey: ['costs', days],
    queryFn: () => listMarketingCosts(days)
  });
  const forecast = useQuery({
    queryKey: ['forecast', 6],
    queryFn: () => getForecastAnalytics(6)
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['efficiency'] });
    qc.invalidateQueries({ queryKey: ['attribution'] });
    qc.invalidateQueries({ queryKey: ['costs'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMarketingCost({
        channel,
        category,
        amount: Number(amount),
        note: note.trim() || undefined
      }),
    onSuccess: () => {
      toast.success('成本已记录');
      setAmount('');
      setNote('');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '记录失败')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMarketingCost(id),
    onSuccess: () => {
      toast.success('成本已删除');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '删除失败')
  });

  if (efficiency.isLoading) return <LoadingState />;
  if (efficiency.isError || !efficiency.data) {
    return <ErrorState onRetry={() => efficiency.refetch()} />;
  }

  const data = efficiency.data;
  const attributionData = attribution.data;
  const costItems = costs.data?.items ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="成本与 ROI"
        description="记录投放/内容/人力成本，按渠道看 CPL、CAC 与投入产出；归因口径可切换"
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
        <Kpi label="总投入" value={`¥${data.totals.spend.toLocaleString('zh-CN')}`} />
        <Kpi label="成交额" value={`¥${data.totals.revenue.toLocaleString('zh-CN')}`} />
        <Kpi label="CPL" value={`¥${data.totals.cpl.toLocaleString('zh-CN')}`} />
        <Kpi label="CAC" value={`¥${data.totals.cac.toLocaleString('zh-CN')}`} />
        <Kpi
          label="ROI"
          value={`${data.totals.roi >= 0 ? '' : '-'}${Math.abs(
            data.totals.roi
          ).toFixed(2)}`}
          hint={data.totals.spend === 0 ? '暂无成本' : '（收入-投入）/投入'}
        />
        <Kpi label="成交数" value={data.totals.won} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">记录成本</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              渠道
              <NativeSelect
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              >
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-sm">
              类型
              <NativeSelect
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as CostCategory)
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-sm">
              金额（元）
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                placeholder="500"
              />
            </label>
            <label className="text-sm">
              备注
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                placeholder="如：信息流投放"
              />
            </label>
          </div>
          <Button
            size="sm"
            className="mt-3"
            disabled={!amount || Number(amount) < 0 || createMutation.isPending}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            记录成本
          </Button>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">渠道效率</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2">渠道</th>
                  <th className="pb-2 text-right">投入</th>
                  <th className="pb-2 text-right">线索</th>
                  <th className="pb-2 text-right">成交</th>
                  <th className="pb-2 text-right">收入</th>
                  <th className="pb-2 text-right">CPL</th>
                  <th className="pb-2 text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {data.byChannel.map((row) => (
                  <tr key={row.channel} className="border-b last:border-0">
                    <td className="py-2">
                      {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{row.spend.toLocaleString('zh-CN')}
                    </td>
                    <td className="py-2 text-right tabular-nums">{row.leads}</td>
                    <td className="py-2 text-right tabular-nums">{row.won}</td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{row.revenue.toLocaleString('zh-CN')}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{row.cpl.toLocaleString('zh-CN')}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.roi.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {data.byChannel.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-sm text-muted-foreground">
                      暂无数据。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">收入归因</h3>
          <NativeSelect
            value={model}
            onChange={(event) =>
              setModel(
                event.target.value as 'first_touch' | 'last_touch' | 'linear'
              )
            }
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            {MODELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {attribution.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">归因计算中…</p>
        ) : attributionData ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">
                总收入 ¥{attributionData.totalRevenue.toLocaleString('zh-CN')} ·
                已归因 ¥{attributionData.attributedRevenue.toLocaleString('zh-CN')}{' '}
                · 未归因 ¥
                {attributionData.unattributedRevenue.toLocaleString('zh-CN')}
              </p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2">渠道</th>
                    <th className="pb-2 text-right">收入</th>
                    <th className="pb-2 text-right">成交</th>
                  </tr>
                </thead>
                <tbody>
                  {attributionData.byChannel.map((row) => (
                    <tr key={row.channel} className="border-b last:border-0">
                      <td className="py-2">
                        {CHANNEL_LABELS[row.channel] ?? row.channel}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        ¥{row.revenue.toLocaleString('zh-CN')}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.deals}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">内容归因</p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2">内容</th>
                    <th className="pb-2 text-right">收入</th>
                    <th className="pb-2 text-right">成交</th>
                  </tr>
                </thead>
                <tbody>
                  {attributionData.byContent.map((row) => (
                    <tr
                      key={row.contentItemId}
                      className="border-b last:border-0"
                    >
                      <td className="max-w-[220px] truncate py-2">
                        {row.contentItemId}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        ¥{row.revenue.toLocaleString('zh-CN')}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.deals}
                      </td>
                    </tr>
                  ))}
                  {attributionData.byContent.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-3 text-sm text-muted-foreground"
                      >
                        暂无内容归因数据。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {forecast.data ? (
        <section className="mt-4 rounded-xl border bg-card p-5">
          <h3 className="font-semibold">销售预测</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            按阶段概率加权：在手 {forecast.data.dealCount} 个商机，预计{' '}
            ¥{forecast.data.expectedAmount.toLocaleString('zh-CN')}，确定性收入{' '}
            ¥{forecast.data.committedAmount.toLocaleString('zh-CN')}。
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2">阶段</th>
                  <th className="pb-2 text-right">概率</th>
                  <th className="pb-2 text-right">金额</th>
                  <th className="pb-2 text-right">加权</th>
                </tr>
              </thead>
              <tbody>
                {forecast.data.byStage.map((row) => (
                  <tr key={row.stage} className="border-b last:border-0">
                    <td className="py-2">{row.stage}</td>
                    <td className="py-2 text-right tabular-nums">
                      {Math.round(row.probability * 100)}%
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{row.amount.toLocaleString('zh-CN')}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{row.expectedAmount.toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2">预计成交月</th>
                  <th className="pb-2 text-right">商机</th>
                  <th className="pb-2 text-right">加权金额</th>
                </tr>
              </thead>
              <tbody>
                {forecast.data.byMonth.map((row) => (
                  <tr key={row.month} className="border-b last:border-0">
                    <td className="py-2">
                      {row.month === 'unscheduled' ? '未排期' : row.month}
                    </td>
                    <td className="py-2 text-right tabular-nums">{row.count}</td>
                    <td className="py-2 text-right tabular-nums">
                      ¥{row.expectedAmount.toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border bg-card p-5">
        <h3 className="font-semibold">成本明细</h3>
        {costItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            还没有成本记录。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {costItems.map((cost) => (
              <li
                key={cost.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
              >
                <div>
                  <span className="font-medium tabular-nums">
                    ¥{Number(cost.amount).toLocaleString('zh-CN')}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {CHANNEL_LABELS[cost.channel ?? 'other'] ?? cost.channel} ·{' '}
                    {CATEGORY_LABELS[cost.category]} ·{' '}
                    {formatDateTime(cost.incurredAt)}
                  </span>
                  {cost.note ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {cost.note}
                    </span>
                  ) : null}
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(cost.id)}
                >
                  删除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

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
