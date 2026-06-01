'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDate } from '@/lib/utils';

type AuditLog = {
  id: string;
  action: string;
  operator: string | null;
  entityType: string | null;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
};

const actionTypes = ['全部', 'create', 'update', 'delete', 'publish', 'sync', 'classify'] as const;

export default function LogsPage() {
  const [actionFilter, setActionFilter] = useState<string>('全部');

  const { data: logs, isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.audit.logs, actionFilter],
    queryFn: () => apiGet<AuditLog[]>('/api/audit/logs'),
  });

  const filtered = actionFilter === '全部' ? (logs ?? []) : (logs ?? []).filter((l) => l.action?.includes(actionFilter));

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message="加载日志失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="操作日志" description="查看系统操作日志" />

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {actionTypes.map((t) => (
          <button
            key={t}
            onClick={() => setActionFilter(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${actionFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
          >
            {t === '全部' ? '全部' : t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">暂无操作日志</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => (
            <div key={log.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex-shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-medium">{log.action ?? '-'}</span>
                <div className="min-w-0">
                  <div className="text-sm">{log.detail ?? log.entityType ?? '-'}</div>
                  {log.operator && <div className="text-xs text-muted-foreground">操作人: {log.operator}</div>}
                </div>
              </div>
              <span className="flex-shrink-0 text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
