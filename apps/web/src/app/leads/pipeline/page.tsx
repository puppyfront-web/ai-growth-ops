'use client';

import { useQuery } from '@tanstack/react-query';
import { listLeads } from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { LeadLevelBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import type { Lead } from '@/types/lead';

const pipelineColumns = [
  { key: 'NEW', label: '新线索', color: 'bg-blue-50 border-blue-200' },
  { key: 'ASSIGNED', label: '待联系', color: 'bg-yellow-50 border-yellow-200' },
  { key: 'CONTACTED', label: '已联系', color: 'bg-orange-50 border-orange-200' },
  { key: 'ADDED_WECOM', label: '已加企微', color: 'bg-green-50 border-green-200' },
  { key: 'WON', label: '已成交', color: 'bg-emerald-50 border-emerald-200' },
  { key: 'LOST', label: '已流失', color: 'bg-gray-50 border-gray-200' },
];

export default function LeadPipelinePage() {
  const { data: leads, isLoading } = useQuery({ queryKey: ['leads-pipeline'], queryFn: () => listLeads() });

  if (isLoading) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="跟进看板" description="拖拽线索卡片变更跟进状态" />
      <div className="grid grid-cols-6 gap-3 overflow-x-auto">
        {pipelineColumns.map((col) => {
          const colLeads = (leads ?? []).filter((l) => l.status === col.key);
          return (
            <div key={col.key} className="min-w-[200px]">
              <div className={`rounded-t-lg border p-3 ${col.color}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{colLeads.length}</span>
                </div>
              </div>
              <div className="rounded-b-lg border border-t-0 bg-muted/30 p-2 space-y-2 min-h-[300px]">
                {colLeads.map((lead) => (
                  <div key={lead.id} className={`rounded-lg border bg-card p-3 cursor-grab hover:shadow-sm ${lead.level === 'A' ? 'border-red-200 bg-red-50/30' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{lead.externalUserName}</span>
                      <LeadLevelBadge level={lead.level} />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{lead.intent ?? lead.summary ?? '-'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <PlatformBadge platform={lead.sourcePlatform} />
                      <span className="text-xs text-muted-foreground">{lead.assignedTo ?? '未分配'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
