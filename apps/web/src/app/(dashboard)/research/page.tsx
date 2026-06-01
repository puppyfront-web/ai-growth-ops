'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listResearchTasks, runResearchTask } from '@/lib/api/research';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PlatformBadge } from '@/components/shared/StatusBadge';
import { researchStatusLabels } from '@/lib/constants';
import type { ColumnDef } from '@tanstack/react-table';
import type { ResearchTask } from '@/types/research';
import Link from 'next/link';

export default function ResearchPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['research-tasks'], queryFn: listResearchTasks });
  const runMutation = useMutation({
    mutationFn: (id: string) => runResearchTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['research-tasks'] });
    }
  });

  const columns: ColumnDef<ResearchTask>[] = [
    { accessorKey: 'type', header: '任务类型', cell: ({ getValue }) => {
      const labels: Record<string, string> = { keyword_search: '关键词搜索', competitor_analysis: '竞品分析', comment_sampling: '评论采样' };
      return <span>{labels[getValue() as string] ?? getValue() as string}</span>;
    }},
    { accessorKey: 'platforms', header: '平台', cell: ({ getValue }) => <div className="flex gap-1">{(getValue() as string[]).map((p) => <PlatformBadge key={p} platform={p} />)}</div> },
    { accessorKey: 'keywords', header: '关键词', cell: ({ getValue }) => <span className="text-sm">{(getValue() as string[]).join(', ') || '-'}</span> },
    { accessorKey: 'status', header: '状态', cell: ({ getValue }) => <StatusBadge status={getValue() as string} label={researchStatusLabels[getValue() as keyof typeof researchStatusLabels]} /> },
    { id: 'actions', header: '操作', cell: ({ row }) => {
      const canRun = ['DRAFT', 'FAILED', 'PAUSED'].includes(row.original.status);
      const isPending = runMutation.isPending && runMutation.variables === row.original.id;
      return (
        <div className="flex gap-2">
          <Link href={`/research/tasks/${row.original.id}`} className="text-sm text-blue-600 hover:underline">查看</Link>
          {canRun && (
            <button
              onClick={() => runMutation.mutate(row.original.id)}
              disabled={isPending}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {isPending ? '运行中...' : '运行'}
            </button>
          )}
        </div>
      );
    }},
  ];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="市场调研" description="管理调研任务，发现选题机会" actions={
        <Link href="/research/new" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">新建调研</Link>
      } />

      {/* Disclaimer */}
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
        仅用于单品牌自用的低频公开内容调研。仅采集公开内容和公开评论。不采集私信，不绕过平台风控，不做高频批量采集。
      </div>

      <DataTable columns={columns} data={data ?? []} loading={isLoading} error={error?.message} onRetry={() => refetch()} emptyTitle="暂无调研任务" emptyDescription="创建一个调研任务来开始发现选题机会" />
    </div>
  );
}
