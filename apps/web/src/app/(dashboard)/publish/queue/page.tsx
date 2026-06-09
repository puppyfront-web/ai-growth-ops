'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import {
  listPublishJobs,
  executePublishJob,
  deletePublishJob
} from '@/lib/api/publish';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  publishStatusLabels,
  publishModeLabels,
  platformLabels
} from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { PublishProgressInline } from '@/components/publish/PublishProgressInline';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

export default function PublishQueuePage() {
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

  const {
    data: jobsData,
    isLoading,
    error
  } = useQuery({
    queryKey: ['publish-jobs', statusFilter, platformFilter],
    queryFn: () =>
      listPublishJobs({
        status: statusFilter || undefined,
        platform: platformFilter || undefined
      }),
    refetchInterval: (query) => {
      const result = query.state.data;
      return result?.items?.some((j) => j.status === 'RUNNING') ? 2000 : false;
    }
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/publish-jobs/${id}/retry`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publish-jobs'] })
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/publish-jobs/${id}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publish-jobs'] })
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => executePublishJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publish-jobs'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePublishJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publish-jobs'] })
  });

  const jobs = jobsData?.items ?? [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="发布队列" description="管理和监控内容发布任务" />

      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部状态</option>
          {Object.entries(publishStatusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="">全部平台</option>
          {Object.entries(platformLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-muted-foreground">
          {jobs.length} 个任务
        </span>
      </div>

      {isLoading && <LoadingState />}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {!isLoading && jobs.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-muted-foreground">还没有发布任务</p>
          <p className="mt-1 text-sm text-muted-foreground">
            从{' '}
            <Link href="/content" className="text-blue-600 hover:underline">
              内容运营
            </Link>{' '}
            选择内容，在平台版本中勾选平台发布
          </p>
        </div>
      )}

      {!isLoading && jobs.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">平台</th>
                <th className="px-4 py-3 text-left font-medium">内容</th>
                <th className="px-4 py-3 text-left font-medium">模式</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">创建时间</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <PlatformBadge platform={job.platform} />
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate">
                    {job.contentVariant?.title ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {publishModeLabels[job.mode] ?? job.mode}
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <StatusBadge
                      status={job.status}
                      label={
                        publishStatusLabels[
                          job.status as keyof typeof publishStatusLabels
                        ] ?? job.status
                      }
                    />
                    <PublishProgressInline
                      status={job.status}
                      metadata={job.metadata}
                      compact
                    />
                    {job.lastError && job.status !== 'RUNNING' && (
                      <p className="mt-1 text-xs text-red-500 truncate max-w-[220px]">
                        {job.lastError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(job.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/publish/jobs/${job.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        详情
                      </Link>
                      {['DRAFT', 'READY', 'SCHEDULED'].includes(job.status) && (
                        <button
                          onClick={() => executeMutation.mutate(job.id)}
                          disabled={executeMutation.isPending}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        >
                          执行发布
                        </button>
                      )}
                      {job.status === 'FAILED' && (
                        <button
                          onClick={() => retryMutation.mutate(job.id)}
                          disabled={retryMutation.isPending}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        >
                          重试
                        </button>
                      )}
                      {['DRAFT', 'RUNNING', 'SCHEDULED'].includes(
                        job.status
                      ) && (
                        <button
                          onClick={() => cancelMutation.mutate(job.id)}
                          disabled={cancelMutation.isPending}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          取消
                        </button>
                      )}
                      {job.status !== 'RUNNING' && (
                        <button
                          onClick={() => {
                            confirm({
                              title: '删除发布任务',
                              description:
                                '确认删除该发布任务？此操作不可撤销。'
                            }).then((ok) => {
                              if (ok) deleteMutation.mutate(job.id);
                            });
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}
