'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDeal, listDeals, updateDeal } from '@/lib/api/deals';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { cn, formatDateTime } from '@/lib/utils';
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_ORDER,
  type Deal,
  type DealStage
} from '@/types/deal';

function emptyForm() {
  return {
    title: '',
    amount: '',
    stage: 'new' as DealStage,
    expectedCloseDate: '',
    ownerId: '',
    nextAction: '首次跟进',
    nextActionAt: ''
  };
}

function isOverdue(deal: Deal): boolean {
  if (!deal.nextActionAt) return false;
  if (deal.stage === 'won' || deal.stage === 'lost') return false;
  return new Date(deal.nextActionAt).getTime() < Date.now();
}

export function CustomerDeals({
  customerId,
  assigneeOptions = []
}: {
  customerId: string;
  assigneeOptions?: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const dealsQuery = useQuery({
    queryKey: ['deals', 'customer', customerId],
    queryFn: () => listDeals({ customerId, pageSize: 50 })
  });
  const deals = dealsQuery.data?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['deals-pipeline'] });
    qc.invalidateQueries({ queryKey: ['customers', customerId] });
    qc.invalidateQueries({ queryKey: ['analytics', 'funnel'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createDeal({
        customerId,
        title: form.title.trim(),
        stage: form.stage,
        amount: form.amount.trim() ? Number(form.amount) : null,
        expectedCloseDate: form.expectedCloseDate
          ? new Date(form.expectedCloseDate).toISOString()
          : null,
        ownerId: form.ownerId || null,
        nextAction: form.nextAction.trim() || null,
        nextActionAt: form.nextActionAt
          ? new Date(form.nextActionAt).toISOString()
          : null
      }),
    onSuccess: () => {
      toast.success('商机已创建');
      setForm(emptyForm());
      setShowForm(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '创建失败')
  });

  const stageMutation = useMutation({
    mutationFn: ({
      id,
      stage,
      lostReason,
      reopenReason
    }: {
      id: string;
      stage: DealStage;
      lostReason?: string;
      reopenReason?: string;
    }) => updateDeal(id, { stage, lostReason, reopenReason }),
    onSuccess: () => {
      toast.success('阶段已更新');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || '阶段更新失败')
  });

  const onStageChange = (deal: Deal, next: DealStage) => {
    if (next === deal.stage) return;
    const isReopen =
      (deal.stage === 'won' || deal.stage === 'lost') &&
      next !== 'won' &&
      next !== 'lost';
    if (next === 'lost') {
      const lostReason = window.prompt('请填写流失原因');
      if (!lostReason?.trim()) return;
      stageMutation.mutate({ id: deal.id, stage: next, lostReason });
      return;
    }
    if (isReopen) {
      const reopenReason = window.prompt('请填写重开原因');
      if (!reopenReason?.trim()) return;
      stageMutation.mutate({ id: deal.id, stage: next, reopenReason });
      return;
    }
    stageMutation.mutate({ id: deal.id, stage: next });
  };

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-medium">商机</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            金额、阶段与预计成交日；赢单后客户与漏斗会同步更新。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? '取消' : '新建商机'}
        </Button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded border bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              商机名称 *
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                placeholder="如：年度私域工具采购"
              />
            </label>
            <label className="text-sm">
              金额（元）
              <input
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                inputMode="decimal"
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
                placeholder="12000"
              />
            </label>
            <label className="text-sm">
              阶段
              <NativeSelect
                value={form.stage}
                onChange={(event) =>
                  setForm({ ...form, stage: event.target.value as DealStage })
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              >
                {DEAL_STAGE_ORDER.filter(
                  (stage) => stage !== 'won' && stage !== 'lost'
                ).map((stage) => (
                  <option key={stage} value={stage}>
                    {DEAL_STAGE_LABELS[stage]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-sm">
              预计成交日
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={(event) =>
                  setForm({ ...form, expectedCloseDate: event.target.value })
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              负责人
              <NativeSelect
                value={form.ownerId}
                onChange={(event) =>
                  setForm({ ...form, ownerId: event.target.value })
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              >
                <option value="">未分配</option>
                {assigneeOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-sm">
              下次动作
              <input
                value={form.nextAction}
                onChange={(event) =>
                  setForm({ ...form, nextAction: event.target.value })
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              截止时间
              <input
                type="datetime-local"
                value={form.nextActionAt}
                onChange={(event) =>
                  setForm({ ...form, nextActionAt: event.target.value })
                }
                className="mt-1 w-full rounded border bg-background px-2 py-1.5"
              />
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!form.title.trim() || createMutation.isPending}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? '创建中…' : '创建商机'}
          </Button>
        </div>
      )}

      {dealsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">商机加载中…</p>
      ) : deals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有商机。创建一个商机来记录金额和销售阶段。
        </p>
      ) : (
        <ul className="space-y-2">
          {deals.map((deal) => {
            const overdue = isOverdue(deal);
            return (
              <li key={deal.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{deal.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      ¥{Number(deal.amount ?? 0).toLocaleString('zh-CN')}
                      {deal.expectedCloseDate
                        ? ` · 预计 ${formatDateTime(deal.expectedCloseDate)}`
                        : ''}
                    </p>
                  </div>
                  <NativeSelect
                    value={deal.stage}
                    onChange={(event) =>
                      onStageChange(deal, event.target.value as DealStage)
                    }
                    disabled={stageMutation.isPending}
                    className="w-36 rounded border bg-background px-2 py-1 text-sm"
                  >
                    {DEAL_STAGE_ORDER.map((stage) => (
                      <option key={stage} value={stage}>
                        {DEAL_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {deal.nextAction || '未设置下一步'}
                  </span>
                  {deal.nextActionAt ? (
                    <span
                      className={cn(
                        'shrink-0',
                        overdue && 'font-medium text-destructive'
                      )}
                    >
                      {overdue
                        ? '已逾期'
                        : formatDateTime(deal.nextActionAt)}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
