'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import { cn, formatDateTime } from '@/lib/utils';
import type { Deal } from '@/types/deal';

export function isDealOverdue(deal: Deal): boolean {
  if (!deal.nextActionAt) return false;
  if (deal.stage === 'won' || deal.stage === 'lost') return false;
  return new Date(deal.nextActionAt).getTime() < Date.now();
}

export function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { stage: deal.stage }
  });
  const overdue = isDealOverdue(deal);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`deal-card-${deal.id}`}
      className={cn(
        'rounded-lg border bg-card p-3 cursor-grab hover:shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-40',
        overdue && 'border-destructive/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{deal.title}</p>
          <Link
            href={`/customers/${deal.customerId}`}
            className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {deal.customer.displayName}
          </Link>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          ¥{Number(deal.amount ?? 0).toLocaleString('zh-CN')}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{deal.nextAction || '未设置下一步'}</span>
        {deal.nextActionAt ? (
          <span
            className={cn(
              'shrink-0',
              overdue && 'font-medium text-destructive'
            )}
          >
            {overdue ? '已逾期' : formatDateTime(deal.nextActionAt)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DealCardPreview({ deal }: { deal: Deal }) {
  return (
    <div className="w-[220px] rounded-lg border bg-card p-3 shadow-lg">
      <p className="truncate text-sm font-medium">{deal.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {deal.customer.displayName}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">
        ¥{Number(deal.amount ?? 0).toLocaleString('zh-CN')}
      </p>
    </div>
  );
}
