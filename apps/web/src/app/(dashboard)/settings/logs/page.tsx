'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ExportCSVButton } from '@/components/shared/ExportCSVButton';
import { formatDate } from '@/lib/utils';
import { ChevronDown, ChevronRight, User, FileText } from 'lucide-react';

type AuditLog = {
  id: string;
  action: string;
  userId: string | null;
  entity: string | null;
  entityId: string | null;
  changes: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  } | null;
  createdAt: string;
  // Joined
  user?: { name: string; email: string } | null;
};

const actionTypes = [
  { value: '', label: '全部' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'publish', label: '发布' },
  { value: 'sync', label: '同步' },
  { value: 'ai_generate', label: 'AI 生成' },
  { value: 'approve', label: '审批' },
  { value: 'reject', label: '驳回' }
];

const entityTypes = [
  { value: '', label: '全部类型' },
  { value: 'ContentItem', label: '内容' },
  { value: 'ContentVariant', label: '变体' },
  { value: 'PublishJob', label: '发布任务' },
  { value: 'Lead', label: '线索' },
  { value: 'Interaction', label: '互动' },
  { value: 'PlatformAccount', label: '平台账号' },
  { value: 'OrganizationMember', label: '成员' },
  { value: 'AppConfig', label: '配置' }
];

const actionColors: Record<string, string> = {
  create: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  update: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  delete: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  publish:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  sync: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ai_generate:
    'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  approve: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  reject: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
};

export default function LogsPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: logs,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [...queryKeys.audit.logs, actionFilter, entityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);
      const qs = params.toString();
      return apiGet<AuditLog[]>(`/api/audit-logs${qs ? `?${qs}` : ''}`);
    }
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (error)
    return <ErrorState message="加载日志失败" onRetry={() => refetch()} />;

  const entries = logs ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="操作日志" description="查看系统操作日志和变更记录" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {actionTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => setActionFilter(t.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                actionFilter === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-xs"
        >
          {entityTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ExportCSVButton
            url="/api/export/audit-logs.csv"
            filename="audit-logs.csv"
            label="导出日志"
          />
        </div>
      </div>

      {/* Log entries */}
      {entries.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          暂无操作日志
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((log) => {
            const isExpanded = expandedId === log.id;
            const hasChanges =
              log.changes && (log.changes.before || log.changes.after);

            return (
              <div
                key={log.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                <button
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  {hasChanges ? (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )
                  ) : (
                    <div className="w-4" />
                  )}
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${actionColors[log.action] ?? 'bg-muted text-muted-foreground'}`}
                  >
                    {log.action}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0 text-sm">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{log.entity ?? '-'}</span>
                    {log.entityId && (
                      <span className="text-muted-foreground truncate max-w-24">
                        #{log.entityId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  {log.user && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {log.user.name}
                    </div>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </span>
                </button>

                {isExpanded && hasChanges && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          变更前
                        </p>
                        <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
                          {log.changes!.before != null
                            ? JSON.stringify(log.changes!.before, null, 2)
                            : '(无)'}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          变更后
                        </p>
                        <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
                          {log.changes!.after != null
                            ? JSON.stringify(log.changes!.after, null, 2)
                            : '(无)'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
