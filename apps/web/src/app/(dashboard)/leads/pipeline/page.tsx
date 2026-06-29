'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { listLeads, updateLeadStatus } from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { LeadLevelBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import Link from 'next/link';
import type { Lead } from '@/types/lead';

const pipelineColumns = [
  {
    key: 'NEW',
    label: '新线索',
    color: 'bg-blue-50 dark:bg-blue-950 border-blue-200'
  },
  { key: 'ASSIGNED', label: '待联系', color: 'bg-yellow-50 border-yellow-200' },
  {
    key: 'CONTACTED',
    label: '已联系',
    color: 'bg-orange-50 border-orange-200'
  },
  {
    key: 'ADDED_WECOM',
    label: '已加企微',
    color: 'bg-green-50 dark:bg-green-950 border-green-200'
  },
  {
    key: 'WON',
    label: '已成交',
    color: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200'
  },
  { key: 'LOST', label: '已流失', color: 'bg-gray-50 border-gray-200' }
] as const;

/** A draggable lead card. */
function LeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status }
  });
  return (
    <Link href={`/leads/${lead.id}`}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`rounded-lg border bg-card p-3 cursor-grab hover:shadow-sm active:cursor-grabbing ${lead.level === 'A' ? 'border-red-200 dark:border-red-800 bg-red-50/30' : ''} ${isDragging ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-sm">{lead.externalUserName}</span>
          <LeadLevelBadge level={lead.level} />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {lead.intent ?? lead.summary ?? '-'}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <PlatformBadge platform={lead.sourcePlatform} />
          <span className="text-xs text-muted-foreground">
            {lead.assignedTo ?? '未分配'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Static preview shown under the cursor while dragging. */
function CardPreview({ lead }: { lead: Lead }) {
  return (
    <div
      className={`rounded-lg border bg-card p-3 shadow-lg w-[200px] ${lead.level === 'A' ? 'border-red-300' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm">{lead.externalUserName}</span>
        <LeadLevelBadge level={lead.level} />
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">
        {lead.intent ?? lead.summary ?? '-'}
      </p>
    </div>
  );
}

/** A kanban column that accepts drops. */
function DropColumn({
  colKey,
  label,
  color,
  count,
  children
}: {
  colKey: string;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colKey });
  return (
    <div className="min-w-[200px]">
      <div className={`rounded-t-lg border p-3 ${color}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{label}</span>
          <span className="text-xs text-muted-foreground">{count}</span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`rounded-b-lg border border-t-0 bg-muted/30 p-2 space-y-2 min-h-[300px] transition-colors ${isOver ? 'bg-primary/5 border-primary/40' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

export default function LeadPipelinePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['leads-pipeline'],
    queryFn: () => listLeads()
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateLeadStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  if (isLoading) return <LoadingState />;

  const leads = data?.items ?? [];
  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overStatus = e.over?.id as string | undefined;
    const lead = leads.find((l) => l.id === String(e.active.id));
    if (overStatus && lead && overStatus !== lead.status) {
      moveMutation.mutate({ id: lead.id, status: overStatus });
    }
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="跟进看板"
        description="拖拽线索卡片变更跟进状态 · 点击卡片查看详情"
      />
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-6 gap-3 overflow-x-auto">
          {pipelineColumns.map((col) => {
            const colLeads = leads.filter((l) => l.status === col.key);
            return (
              <DropColumn
                key={col.key}
                colKey={col.key}
                label={col.label}
                color={col.color}
                count={colLeads.length}
              >
                {colLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </DropColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeLead ? <CardPreview lead={activeLead} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
