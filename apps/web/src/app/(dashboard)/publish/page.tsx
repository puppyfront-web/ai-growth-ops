'use client';

import { useQuery } from '@tanstack/react-query';
import { listPublishJobs } from '@/lib/api/publish';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { publishStatusLabels, contentTypeLabels, publishModeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { PublishJob } from '@/types/publish';
import Link from 'next/link';
import { useState } from 'react';

const columns: ColumnDef<PublishJob>[] = [
  { accessorKey: 'platform', header: '平台', cell: ({ getValue }) => <PlatformBadge platform={getValue() as string} /> },
  { accessorKey: 'contentType', header: '类型', cell: ({ getValue }) => <span className="text-sm">{contentTypeLabels[getValue() as string]}</span> },
  { accessorKey: 'mode', header: '模式', cell: ({ getValue }) => <span className="text-xs rounded bg-muted px-1.5 py-0.5">{publishModeLabels[getValue() as string]}</span> },
  { accessorKey: 'status', header: '状态', cell: ({ getValue }) => <StatusBadge status={getValue() as string} label={publishStatusLabels[getValue() as keyof typeof publishStatusLabels]} /> },
  { accessorKey: 'scheduledAt', header: '计划时间', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue() ? formatDate(getValue() as string) : '-'}</span> },
  { accessorKey: 'lastError', header: '最近错误', cell: ({ getValue }) => <span className="text-sm text-destructive line-clamp-1">{getValue() as string ?? '-'}</span> },
  { id: 'actions', header: '操作', cell: ({ row }) => (
    <div className="flex gap-2">
      <Link href={`/publish/jobs/${row.original.id}`} className="text-sm text-blue-600 hover:underline">详情</Link>
      {row.original.status === 'FAILED' && <button className="text-sm text-orange-600 hover:underline">重试</button>}
    </div>
  )},
];

export default function PublishPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['publish-jobs', statusFilter], queryFn: () => listPublishJobs(statusFilter ? { status: statusFilter } : undefined) });

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="发布运营" description="管理多平台发布任务" actions={
        <div className="flex gap-2">
          <Link href="/publish/manual" className="rounded-md border px-4 py-2 text-sm hover:bg-accent">人工发布</Link>
          <Link href="/publish/queue" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">创建发布</Link>
        </div>
      } />
      <div className="mb-4">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border p-2 text-sm">
          <option value="">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="SCHEDULED">已排期</option>
          <option value="RUNNING">发布中</option>
          <option value="WAITING_HUMAN_CONFIRM">等待确认</option>
          <option value="PUBLISHED">已发布</option>
          <option value="FAILED">失败</option>
        </select>
      </div>
      <DataTable columns={columns} data={data?.items ?? []} loading={isLoading} error={error?.message} onRetry={() => refetch()} emptyTitle="暂无发布任务" />
    </div>
  );
}
