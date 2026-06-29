'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listLeads, createLead, importLeads } from '@/lib/api/leads';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import {
  StatusBadge,
  PlatformBadge,
  LeadLevelBadge
} from '@/components/shared/StatusBadge';
import { formatDate } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { Lead } from '@/types/lead';
import Link from 'next/link';
import { ExportCSVButton } from '@/components/shared/ExportCSVButton';

const leadStatusLabels: Record<string, string> = {
  NEW: '新线索',
  QUALIFIED: '已验证',
  SYNCING: '同步中',
  SYNCED: '已同步飞书',
  ASSIGNED: '已分配',
  CONTACTED: '已联系',
  ADDED_WECOM: '已加企微',
  WON: '已成交',
  LOST: '已流失',
  INVALID: '无效'
};

const columns: ColumnDef<Lead>[] = [
  {
    accessorKey: 'externalUserName',
    header: '线索名称',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Link
          href={`/leads/${row.original.id}`}
          className="font-medium text-sm hover:underline"
        >
          {row.original.externalUserName}
        </Link>
        <LeadLevelBadge level={row.original.level} />
      </div>
    )
  },
  {
    accessorKey: 'sourcePlatform',
    header: '来源平台',
    cell: ({ getValue }) => <PlatformBadge platform={getValue() as string} />
  },
  {
    accessorKey: 'intent',
    header: '需求摘要',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground line-clamp-1 max-w-xs">
        {(getValue() as string) ?? '-'}
      </span>
    )
  },
  {
    accessorKey: 'assignedTo',
    header: '负责人',
    cell: ({ getValue }) => (
      <span className="text-sm">{(getValue() as string) ?? '未分配'}</span>
    )
  },
  {
    accessorKey: 'status',
    header: '跟进状态',
    cell: ({ getValue }) => (
      <StatusBadge
        status={getValue() as string}
        label={leadStatusLabels[getValue() as string] ?? (getValue() as string)}
      />
    )
  },
  {
    accessorKey: 'createdAt',
    header: '创建时间',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(getValue() as string)}
      </span>
    )
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Link
          href={`/leads/${row.original.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          查看
        </Link>
        <Link
          href={`/leads/${row.original.id}?sync=feishu`}
          className="text-sm text-muted-foreground hover:text-foreground"
          title="在详情页同步到飞书/企微"
        >
          同步
        </Link>
      </div>
    )
  }
];

export default function LeadsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => listLeads(filters)
  });

  // ── Quick manual lead entry (MVP: inline form, default douyin/manual source) ──
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    intent: '',
    level: 'B' as 'A' | 'B' | 'C' | 'D'
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createLead({
        sourcePlatform: 'douyin',
        // Manual entries use a synthetic account/user id under the org's scope.
        sourceAccountId: 'manual',
        externalUserId: `manual-${Date.now()}`,
        externalUserName: form.name,
        level: form.level,
        intent: form.intent || undefined,
        summary: form.intent || undefined
      }),
    onSuccess: () => {
      setShowCreate(false);
      setForm({ name: '', intent: '', level: 'B' });
      qc.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  // ── CSV import ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState('');
  const importMutation = useMutation({
    mutationFn: (csv: string) => importLeads(csv),
    onSuccess: (r) => {
      setImportMsg(`导入完成: 新增 ${r.created} 条, 跳过 ${r.skipped} 条${r.errors.length ? `, 错误 ${r.errors.length} 条` : ''}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      setTimeout(() => setImportMsg(''), 6000);
    },
    onError: (e: Error) => setImportMsg(`导入失败: ${e.message}`)
  });
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => importMutation.mutate(String(reader.result));
    reader.readAsText(file);
  };

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="线索管理"
        description="管理客户线索和跟进状态"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
            >
              + 新建线索
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {importMutation.isPending ? '导入中…' : '导入 CSV'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <Link
              href="/leads/sources"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
            >
              线索来源
            </Link>
            <Link
              href="/leads/pipeline"
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              跟进看板
            </Link>
          </div>
        }
      />
      {importMsg && (
        <div className="mb-4 rounded-md bg-blue-50 dark:bg-blue-950 px-4 py-2 text-sm text-blue-700">
          {importMsg}
        </div>
      )}
      {showCreate && (
        <div className="mb-4 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-muted-foreground">客户名称</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如：张总 / 某某公司"
                className="mt-1 w-48 rounded border bg-background px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">需求</label>
              <input
                value={form.intent}
                onChange={(e) => setForm((f) => ({ ...f, intent: e.target.value }))}
                placeholder="如：咨询报价 / 合作"
                className="mt-1 w-56 rounded border bg-background px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">等级</label>
              <select
                value={form.level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, level: e.target.value as 'A' | 'B' | 'C' | 'D' }))
                }
                className="mt-1 rounded border bg-background px-2 py-1 text-sm"
              >
                {(['A', 'B', 'C', 'D'] as const).map((lv) => (
                  <option key={lv} value={lv}>{lv}级</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => form.name.trim() && createMutation.mutate()}
              disabled={!form.name.trim() || createMutation.isPending}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {createMutation.isPending ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-4">
        <select
          value={filters.level ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value }))}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部等级</option>
          <option value="A">A级</option>
          <option value="B">B级</option>
          <option value="C">C级</option>
          <option value="D">D级</option>
        </select>
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value }))
          }
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="NEW">新线索</option>
          <option value="ASSIGNED">已分配</option>
          <option value="CONTACTED">已联系</option>
          <option value="ADDED_WECOM">已加企微</option>
          <option value="WON">已成交</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        error={error?.message}
        onRetry={() => refetch()}
        emptyTitle="暂无线索"
        emptyDescription="新线索将在这里显示"
        toolbar={
          <div className="mb-3 flex justify-end">
            <ExportCSVButton url="/api/export/leads.csv" filename="leads.csv" />
          </div>
        }
      />
    </div>
  );
}
