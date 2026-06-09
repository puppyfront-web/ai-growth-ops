'use client';

import { useQuery } from '@tanstack/react-query';
import { listInsights } from '@/lib/api/research';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { ColumnDef } from '@tanstack/react-table';
import type { ResearchInsight } from '@/types/research';

const typeLabels: Record<string, string> = {
  user_pain_point: '用户痛点',
  content_pattern: '内容规律',
  user_question: '用户问题',
  competitor: '竞品动态',
  platform_diff: '平台差异'
};

const columns: ColumnDef<ResearchInsight>[] = [
  {
    accessorKey: 'type',
    header: '类型',
    cell: ({ getValue }) => (
      <StatusBadge
        status="info"
        label={typeLabels[getValue() as string] ?? (getValue() as string)}
      />
    )
  },
  { accessorKey: 'title', header: '洞察标题' },
  {
    accessorKey: 'summary',
    header: '摘要',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground line-clamp-1">
        {getValue() as string}
      </span>
    )
  }
];

export default function InsightsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['research-insights'],
    queryFn: listInsights
  });

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="调研洞察" description="从调研数据中提取的 AI 洞察" />
      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        error={error?.message}
        onRetry={() => refetch()}
        emptyTitle="暂无洞察"
        emptyDescription="完成调研任务后将自动生成洞察"
      />
    </div>
  );
}
