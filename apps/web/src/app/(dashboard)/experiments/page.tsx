'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExperiment,
  getExperimentResults,
  listExperiments,
  startExperiment,
  stopExperiment
} from '@/lib/api/experiments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  running: '运行中',
  completed: '已结束',
  cancelled: '已取消'
};

export default function ExperimentsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('内容标题 A/B');
  const [metric, setMetric] = useState('lead');
  const [weightB, setWeightB] = useState('50');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const experiments = useQuery({
    queryKey: ['experiments'],
    queryFn: listExperiments
  });
  const results = useQuery({
    queryKey: ['experiments', selectedId, 'results'],
    queryFn: () => getExperimentResults(selectedId!),
    enabled: Boolean(selectedId)
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['experiments'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createExperiment({
        name: name.trim(),
        metric: metric.trim() || 'conversion',
        variants: [
          { key: 'a', name: 'A 对照', weight: 100 - Number(weightB) },
          { key: 'b', name: 'B 实验', weight: Number(weightB) }
        ]
      }),
    onSuccess: () => {
      toast.success('实验已创建');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '创建失败')
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' }) =>
      action === 'start' ? startExperiment(id) : stopExperiment(id),
    onSuccess: () => {
      toast.success('实验状态已更新');
      invalidate();
      qc.invalidateQueries({ queryKey: ['experiments', selectedId, 'results'] });
    },
    onError: (error: Error) => toast.error(error.message || '更新失败')
  });

  if (experiments.isLoading) return <LoadingState />;
  if (experiments.isError) return <ErrorState onRetry={() => experiments.refetch()} />;

  const items = experiments.data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const resultData = results.data;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="实验与 A/B"
        description="按实体稳定分流，记录转化事件；样本不足时不宣称胜出"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">新建实验</h3>
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              转化指标（如 lead / won / reply）
              <input
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              B 组流量占比（%）
              <input
                type="number"
                min={1}
                max={99}
                value={weightB}
                onChange={(event) => setWeightB(event.target.value)}
                className="mt-1 w-32 rounded border bg-background px-2 py-1.5"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              分配由 experimentId + 实体 ID 哈希决定，重复调用结果稳定。
            </p>
            <Button
              size="sm"
              disabled={!name.trim() || createMutation.isPending}
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              创建实验
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">实验列表</h3>
          {items.length === 0 ? (
            <EmptyState
              title="还没有实验"
              description="创建第一个 A/B 实验，给内容或触达做分流。"
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((experiment) => (
                <li
                  key={experiment.id}
                  className="rounded border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{experiment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {STATUS_LABELS[experiment.status]} · 指标{' '}
                        {experiment.metric} · {experiment.variants.length} 组
                        {experiment.startedAt
                          ? ` · 启动 ${formatDateTime(experiment.startedAt)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {experiment.status === 'draft' && (
                        <Button
                          size="xs"
                          onClick={() =>
                            statusMutation.mutate({
                              id: experiment.id,
                              action: 'start'
                            })
                          }
                        >
                          启动
                        </Button>
                      )}
                      {experiment.status === 'running' && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            statusMutation.mutate({
                              id: experiment.id,
                              action: 'stop'
                            })
                          }
                        >
                          结束
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setSelectedId(experiment.id)}
                      >
                        结果
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selected ? (
        <section className="mt-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">实验结果 · {selected.name}</h3>
            {results.isLoading ? (
              <span className="text-xs text-muted-foreground">计算中…</span>
            ) : null}
          </div>
          {resultData ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                总数 {resultData.rows.reduce((sum, row) => sum + row.assignments, 0)}{' '}
                ·{' '}
                {resultData.significant
                  ? `胜出：${
                      resultData.rows.find(
                        (row) => row.key === resultData.winnerKey
                      )?.name ?? resultData.winnerKey
                    }`
                  : '样本不足或差异不显著，暂不宣布胜出'}
              </p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2">变体</th>
                    <th className="pb-2 text-right">分配</th>
                    <th className="pb-2 text-right">转化</th>
                    <th className="pb-2 text-right">转化率</th>
                    <th className="pb-2 text-right">相对提升</th>
                    <th className="pb-2 text-right">p 值</th>
                  </tr>
                </thead>
                <tbody>
                  {resultData.rows.map((row) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {row.assignments}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.conversions}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {(row.rate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {(row.lift * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.key === resultData.variants[0]?.key
                          ? '对照'
                          : row.pValue.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              暂无结果数据。
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
