'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listContentItems, deleteContentItem, archiveContentItem } from '@/lib/api/content';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { contentTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { ContentItem } from '@/types/content';
import Link from 'next/link';

const statusLabels: Record<string, string> = { draft: '草稿', ready: '就绪', archived: '已归档' };

type DialogState =
  | { type: 'delete'; item: ContentItem }
  | { type: 'archive'; item: ContentItem };

export default function ContentPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const pendingItemRef = useRef<ContentItem | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['content-items'],
    queryFn: () => listContentItems(),
  });

  const closeDialog = () => setDialog(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContentItem(id),
    onSuccess: () => {
      pendingItemRef.current = null;
      closeDialog();
      qc.invalidateQueries({ queryKey: ['content-items'] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.code === 'HAS_PUBLISHED' && pendingItemRef.current) {
        setDialog({ type: 'archive', item: pendingItemRef.current });
      } else {
        setToastError(err instanceof Error ? err.message : '删除失败');
        closeDialog();
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveContentItem(id),
    onSuccess: () => {
      pendingItemRef.current = null;
      closeDialog();
      qc.invalidateQueries({ queryKey: ['content-items'] });
    },
    onError: (err: unknown) => {
      setToastError(err instanceof Error ? err.message : '归档失败');
      closeDialog();
    },
  });

  const columns = useMemo<ColumnDef<ContentItem>[]>(() => [
    {
      accessorKey: 'title',
      header: '标题',
      cell: ({ row }) => (
        <Link href={`/content/${row.original.id}`} className="font-medium text-sm hover:underline">
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'type',
      header: '类型',
      cell: ({ getValue }) => <span className="text-sm">{contentTypeLabels[getValue() as string]}</span>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ getValue }) => <StatusBadge status={getValue() as string} label={statusLabels[getValue() as string]} />,
    },
    {
      accessorKey: 'updatedAt',
      header: '更新时间',
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{formatDate(getValue() as string)}</span>,
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const item = row.original;
        const isArchived = item.status === 'archived';
        return (
          <div className="flex gap-3">
            <Link href={`/content/${item.id}`} className="text-sm text-blue-600 hover:underline">
              编辑
            </Link>
            <Link href={`/content/${item.id}?tab=variants`} className="text-sm text-green-600 hover:underline">
              发布
            </Link>
            {!isArchived && (
              <button
                onClick={() => { setToastError(null); pendingItemRef.current = item; setDialog({ type: 'delete', item }); }}
                className="text-sm text-red-500 hover:underline"
              >
                删除
              </button>
            )}
          </div>
        );
      },
    },
  ], []);

  const isPending = deleteMutation.isPending || archiveMutation.isPending;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="内容运营"
        description="管理内容创作和发布"
        actions={
          <Link href="/content/new" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            新建内容
          </Link>
        }
      />
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        error={error?.message}
        onRetry={() => refetch()}
        emptyTitle="还没有内容"
        emptyDescription="你可以从调研选题生成内容，也可以手动创建一条图文或视频脚本。"
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title="删除内容"
        description={
          dialog?.type === 'delete'
            ? `确认删除「${dialog.item.title}」？已发布的内容无法删除，此操作不可撤销。`
            : ''
        }
        confirmLabel={isPending ? '处理中...' : '确认删除'}
        variant="danger"
        onConfirm={() => dialog?.type === 'delete' && deleteMutation.mutate(dialog.item.id)}
      />

      {/* Archive fallback — shown automatically when delete is blocked by published variants */}
      <ConfirmDialog
        open={dialog?.type === 'archive'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title="无法直接删除"
        description={
          dialog?.type === 'archive'
            ? `「${dialog.item.title}」包含已发布的平台版本，不能直接删除。\n是否将其归档？归档后内容仍会保留，但不再出现在工作列表中。`
            : ''
        }
        confirmLabel={isPending ? '处理中...' : '改为归档'}
        cancelLabel="取消"
        variant="normal"
        onConfirm={() => dialog?.type === 'archive' && archiveMutation.mutate(dialog.item.id)}
      />

      {toastError && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-md">
          {toastError}
          <button onClick={() => setToastError(null)} className="ml-3 text-red-400 hover:text-red-600">×</button>
        </div>
      )}
    </div>
  );
}
