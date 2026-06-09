'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInteractions, triggerSync } from '@/lib/api/conversations';
import { getPlatformAccounts } from '@/lib/api/integrations';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { interactionStatusLabels, platformLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { ExportCSVButton } from '@/components/shared/ExportCSVButton';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { Interaction } from '@/types/interaction';

const columns: ColumnDef<Interaction>[] = [
  { accessorKey: 'externalUserName', header: '用户' },
  {
    accessorKey: 'platform',
    header: '平台',
    cell: ({ getValue }) => <PlatformBadge platform={getValue() as string} />
  },
  {
    accessorKey: 'content',
    header: '评论内容',
    cell: ({ getValue }) => (
      <span className="text-sm line-clamp-1">{getValue() as string}</span>
    )
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ getValue }) => (
      <StatusBadge
        status={getValue() as string}
        label={
          interactionStatusLabels[
            getValue() as keyof typeof interactionStatusLabels
          ]
        }
      />
    )
  },
  {
    accessorKey: 'receivedAt',
    header: '时间',
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(getValue() as string)}
      </span>
    )
  }
];

export default function CommentsPage() {
  const qc = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [useHeadedBrowser, setUseHeadedBrowser] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['comments'],
    queryFn: () => listInteractions({ type: 'comment' })
  });

  const { data: accounts } = useQuery({
    queryKey: ['platform-accounts'],
    queryFn: getPlatformAccounts
  });

  const syncMutation = useMutation({
    mutationFn: () => {
      const account = accounts?.find((a) => a.id === selectedAccountId);
      if (!account) return Promise.reject(new Error('请先选择账号'));
      return triggerSync({
        platformAccountId: account.id,
        platform: account.platform,
        mode: account.mode,
        syncType: 'comments',
        headed: useHeadedBrowser
      });
    },
    onSuccess: (result) => {
      setSyncMsg({
        type: 'success',
        text: `评论同步已触发（任务 ${result.syncJobId.slice(0, 8)}…），后台处理中`
      });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['comments'] });
        setSyncMsg(null);
      }, 6000);
    },
    onError: (err: Error) =>
      setSyncMsg({ type: 'error', text: `同步失败：${err.message}` })
  });

  const activeAccounts = (accounts ?? []).filter((a) => a.status === 'active');
  const hasAccounts = activeAccounts.length > 0;

  return (
    <div>
      <PageHeader
        title="评论管理"
        description="管理所有平台的评论"
        actions={
          hasAccounts ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setSyncMsg(null);
                }}
                className="rounded-md border p-1.5 text-xs min-w-[160px]"
              >
                <option value="">选择账号…</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {platformLabels[
                      a.platform as keyof typeof platformLabels
                    ] ?? a.platform}{' '}
                    · {a.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || !selectedAccountId}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {syncMutation.isPending ? '同步中…' : '拉取评论'}
              </button>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useHeadedBrowser}
                  onChange={(e) => setUseHeadedBrowser(e.target.checked)}
                  className="rounded"
                />
                使用有头浏览器
              </label>
            </div>
          ) : (
            <Link
              href="/integrations/platforms"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
            >
              去配置平台账号
            </Link>
          )
        }
      />

      {syncMsg && (
        <div
          className={`mb-4 rounded-md px-4 py-2 text-sm flex items-center justify-between ${
            syncMsg.type === 'error'
              ? 'bg-red-50 dark:bg-red-950 text-red-700'
              : 'bg-blue-50 dark:bg-blue-950 text-blue-700'
          }`}
        >
          <span>{syncMsg.text}</span>
          <button
            onClick={() => setSyncMsg(null)}
            className="opacity-60 hover:opacity-100 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {!hasAccounts && accounts !== undefined && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-800">
          尚未配置平台账号。请先前往
          <Link
            href="/integrations/platforms"
            className="mx-1 underline font-medium"
          >
            集成 → 平台账号
          </Link>
          添加抖音等账号，选择「浏览器辅助」或「官方 API」模式后即可拉取评论。
        </div>
      )}

      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        emptyTitle="暂无评论"
        toolbar={
          <div className="mb-3 flex justify-end">
            <ExportCSVButton
              url="/api/export/interactions.csv"
              filename="interactions.csv"
              label="导出互动"
            />
          </div>
        }
      />
    </div>
  );
}
