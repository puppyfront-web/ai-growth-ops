'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import Link from 'next/link';
import { listDeals, updateDeal } from '@/lib/api/deals';
import { useOrgMembers } from '@/hooks/use-org-members';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { DealCard, DealCardPreview } from '@/components/deals/DealCard';
import { cn } from '@/lib/utils';
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGE_ORDER,
  type Deal,
  type DealStage
} from '@/types/deal';

function DropColumn({
  stage,
  deals
}: {
  stage: DealStage;
  deals: Deal[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce(
    (sum, deal) => sum + Number(deal.amount ?? 0),
    0
  );
  return (
    <section className="min-w-[210px] flex-1">
      <header className="rounded-t-lg border border-b-0 bg-muted/40 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{DEAL_STAGE_LABELS[stage]}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {deals.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          ¥{total.toLocaleString('zh-CN')}
        </p>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[320px] space-y-2 rounded-b-lg border border-t-0 bg-muted/20 p-2 transition-colors',
          isOver && 'border-primary/40 bg-primary/5'
        )}
      >
        {deals.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            拖拽商机到这里
          </p>
        ) : (
          deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
        )}
      </div>
    </section>
  );
}

export default function DealPipelinePage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['deals-pipeline'],
    queryFn: () => listDeals({ pageSize: 100 })
  });
  const { data: members = [] } = useOrgMembers();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const moveMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
      updateDeal(id, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals-pipeline'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'funnel'] });
    },
    onError: (error: Error) => toast.error(error.message || '阶段更新失败')
  });

  if (isLoading) return <LoadingState />;
  const deals = data?.items ?? [];
  const activeDeal = activeId
    ? deals.find((deal) => deal.id === activeId)
    : null;

  const onDragStart = (event: DragStartEvent) =>
    setActiveId(String(event.active.id));
  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const nextStage = event.over?.id as DealStage | undefined;
    const deal = deals.find((item) => item.id === String(event.active.id));
    if (nextStage && deal && nextStage !== deal.stage) {
      moveMutation.mutate({ id: deal.id, stage: nextStage });
    }
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="商机管道"
        description="按销售阶段查看金额与下次动作 · 拖拽推进阶段"
      />

      {isError ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-destructive">
          商机加载失败
          <Button variant="link" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      ) : deals.length === 0 ? (
        <EmptyState
          title="还没有商机"
          description="在客户详情里创建第一个商机，填写金额和预计成交日。"
          action={
            <Button asChild>
              <Link href="/customers">去客户列表</Link>
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-2">
            {DEAL_STAGE_ORDER.map((stage) => (
              <DropColumn
                key={stage}
                stage={stage}
                deals={deals.filter((deal) => deal.stage === stage)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDeal ? <DealCardPreview deal={activeDeal} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {members.length > 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          负责人可在客户详情中分配；逾期商机会出现在经营漏斗的逾期卡片中。
        </p>
      ) : null}
    </div>
  );
}
