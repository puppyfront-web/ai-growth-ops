'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInteractions, triggerSync } from '@/lib/api/conversations';
import { getPlatformAccounts } from '@/lib/api/integrations';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { interactionStatusLabels, platformLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { Interaction } from '@/types/interaction';

const columns: ColumnDef<Interaction>[] = [
  { accessorKey: 'externalUserName', header: '用户' },
  { accessorKey: 'platform', header: '平台', cell: ({ getValue }) => <PlatformBadge platform={getValue() as string} /> },
  { accessorKey: 'content', header: '消息内容', cell: ({ getValue }) => <span className="text-sm line-clamp-1">{getValue() as string}</span> },
  { accessorKey: 'status', header: '状态', cell: ({ getValue }) => <StatusBadge status={getValue() as string} label={interactionStatusLabels[getValue() as keyof typeof interactionStatusLabels]} /> },
  { accessorKey: 'receivedAt', header: '时间', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{formatDate(getValue() as string)}</span> },
];

export default function MessagesPage() {
  const qc = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['messages'],
    queryFn: () => listInteractions({ type: 'message' }),
  });

  const { data: accounts } = useQuery({
    queryKey: ['platform-accounts'],
    queryFn: getPlatformAccounts,
  });

  const syncMutation = useMutation({
    mutationFn: () => {
      const account = accounts?.find((a) => a.id === selectedAccountId);
      if (!account) return Promise.reject(new Error('请先选择账号'));
      return triggerSync({
        platformAccountId: account.id,
        platform: account.platform,
        mode: account.mode,
        syncType: 'messages',
      });
    },
    onSuccess: (result) => {
      setSyncMsg({ type: 'success', text: `私信同步已触发（任务 ${result.syncJobId.slice(0, 8)}…），后台处理中` });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['messages'] });
        setSyncMsg(null);
      }, 6000);
    },
    onError: (err: Error) => setSyncMsg({ type: 'error', text: `同步失败：${err.message}` }),
  });

  const activeAccounts = (accounts ?? []).filter((a) => a.status === 'active');
  const hasAccounts = activeAccounts.length > 0;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="私信管理"
        description="管理所有平台的私信"
        actions={
          hasAccounts ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedAccountId}
                onChange={(e) => { setSelectedAccountId(e.target.value); setSyncMsg(null); }}
                className="rounded-md border p-1.5 text-xs min-w-[160px]"
              >
                <option value="">选择账号…</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {platformLabels[a.platform as keyof typeof platformLabels] ?? a.platform} · {a.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending || !selectedAccountId}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              >
                {syncMutation.isPending ? '同步中…' : '拉取私信'}
              </button>
            </div>
          ) : (
            <Link href="/integrations/platforms" className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
              去配置平台账号
            </Link>
          )
        }
      />

      {syncMsg && (
        <div className={`mb-4 rounded-md px-4 py-2 text-sm flex items-center justify-between ${
          syncMsg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
        }`}>
          <span>{syncMsg.text}</span>
          <button onClick={() => setSyncMsg(null)} className="opacity-60 hover:opacity-100 ml-4">✕</button>
        </div>
      )}

      {!hasAccounts && (accounts !== undefined) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          尚未配置平台账号。请先前往
          <Link href="/integrations/platforms" className="mx-1 underline font-medium">集成 → 平台账号</Link>
          添加抖音等账号，选择「浏览器辅助」或「官方 API」模式后即可拉取私信。
        </div>
      )}

      <DataTable columns={columns} data={data ?? []} loading={isLoading} emptyTitle="暂无私信" />
    </div>
  );
}
