'use client';

import { useQuery } from '@tanstack/react-query';
import { listLeads } from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge, PlatformBadge, LeadLevelBadge } from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { Lead } from '@/types/lead';
import Link from 'next/link';
import { useState } from 'react';

const leadStatusLabels: Record<string, string> = {
  NEW: '新线索', QUALIFIED: '已验证', SYNCING: '同步中', SYNCED: '已同步飞书', ASSIGNED: '已分配', CONTACTED: '已联系', ADDED_WECOM: '已加企微', WON: '已成交', LOST: '已流失', INVALID: '无效',
};

const columns: ColumnDef<Lead>[] = [
  { accessorKey: 'externalUserName', header: '线索名称', cell: ({ row }) => (
    <div className="flex items-center gap-2">
      <Link href={`/leads/${row.original.id}`} className="font-medium text-sm hover:underline">{row.original.externalUserName}</Link>
      <LeadLevelBadge level={row.original.level} />
    </div>
  )},
  { accessorKey: 'sourcePlatform', header: '来源平台', cell: ({ getValue }) => <PlatformBadge platform={getValue() as string} /> },
  { accessorKey: 'intent', header: '需求摘要', cell: ({ getValue }) => <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs">{getValue() as string ?? '-'}</span> },
  { accessorKey: 'assignedTo', header: '负责人', cell: ({ getValue }) => <span className="text-sm">{getValue() as string ?? '未分配'}</span> },
  { accessorKey: 'status', header: '跟进状态', cell: ({ getValue }) => <StatusBadge status={getValue() as string} label={leadStatusLabels[getValue() as string] ?? getValue() as string} /> },
  { accessorKey: 'createdAt', header: '创建时间', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{formatDate(getValue() as string)}</span> },
  { id: 'actions', header: '操作', cell: ({ row }) => (
    <div className="flex gap-2">
      <Link href={`/leads/${row.original.id}`} className="text-sm text-blue-600 hover:underline">查看</Link>
      <button className="text-sm text-muted-foreground hover:text-foreground">同步飞书</button>
    </div>
  )},
];

export default function LeadsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['leads', filters], queryFn: () => listLeads(filters) });

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="线索管理" description="管理客户线索和跟进状态" actions={
        <Link href="/leads/pipeline" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">跟进看板</Link>
      } />
      <div className="flex gap-2 mb-4">
        <select value={filters.level ?? ''} onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value }))} className="rounded-md border p-2 text-sm">
          <option value="">全部等级</option>
          <option value="A">A级</option>
          <option value="B">B级</option>
          <option value="C">C级</option>
          <option value="D">D级</option>
        </select>
        <select value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded-md border p-2 text-sm">
          <option value="">全部状态</option>
          <option value="NEW">新线索</option>
          <option value="ASSIGNED">已分配</option>
          <option value="CONTACTED">已联系</option>
          <option value="ADDED_WECOM">已加企微</option>
          <option value="WON">已成交</option>
        </select>
      </div>
      <DataTable columns={columns} data={data ?? []} loading={isLoading} error={error?.message} onRetry={() => refetch()} emptyTitle="暂无线索" emptyDescription="新线索将在这里显示" />
    </div>
  );
}
