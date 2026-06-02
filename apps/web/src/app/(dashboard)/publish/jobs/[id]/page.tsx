'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import { getPublishJob, getPublishAttempts, retryPublishJob, cancelPublishJob, deletePublishJob } from '@/lib/api/publish';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { publishStatusLabels, publishModeLabels, contentTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { PublishProgressInline } from '@/components/publish/PublishProgressInline';

const timelineStatuses = ['DRAFT', 'READY', 'SCHEDULED', 'RUNNING', 'WAITING_HUMAN_CONFIRM', 'PUBLISHED'] as const;

function getTimelineStepState(
  jobStatus: string,
  step: (typeof timelineStatuses)[number]
): 'done' | 'current' | 'pending' | 'failed' {
  const stepIndex = timelineStatuses.indexOf(step);
  if (jobStatus === 'FAILED') {
    const failedProgressIndex = timelineStatuses.indexOf('RUNNING');
    if (stepIndex <= failedProgressIndex) return 'done';
    return 'pending';
  }
  if (jobStatus === 'CANCELLED') return stepIndex === 0 ? 'done' : 'pending';
  const jobIndex = timelineStatuses.indexOf(jobStatus as (typeof timelineStatuses)[number]);
  if (jobIndex < 0) {
    if (jobStatus === 'NEED_MANUAL_REPAIR') {
      return stepIndex <= timelineStatuses.indexOf('RUNNING') ? 'done' : 'pending';
    }
    return 'pending';
  }
  if (stepIndex < jobIndex) return 'done';
  if (stepIndex === jobIndex) return 'current';
  return 'pending';
}

export default function PublishJobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const { data: job, isLoading, isError, error } = useQuery({
    queryKey: ['publish-job', id],
    queryFn: () => getPublishJob(id),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? 2000 : false),
  });
  const { data: attempts } = useQuery({ queryKey: ['publish-attempts', id], queryFn: () => getPublishAttempts(id) });

  const retryMutation = useMutation({
    mutationFn: () => retryPublishJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publish-job', id] })
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelPublishJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publish-job', id] })
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePublishJob(id),
    onSuccess: () => router.push('/publish/queue'),
  });

  if (isLoading) return <LoadingState />;

  if (isError) {
    const message = error instanceof ApiError ? error.message : '加载发布任务失败';
    const isNotFound = error instanceof ApiError && error.status === 404;
    return (
      <div>
        <Breadcrumb />
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-lg font-medium">{isNotFound ? '发布任务不存在' : '无法加载任务'}</p>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <Link href="/publish/queue" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
            返回发布队列
          </Link>
        </div>
      </div>
    );
  }

  if (!job) return <LoadingState />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="发布任务详情" actions={
        <div className="flex gap-2">
          {job.status === 'FAILED' && (
            <button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending} className="rounded-md bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {retryMutation.isPending ? '重试中...' : '重试'}
            </button>
          )}
          {job.status === 'WAITING_HUMAN_CONFIRM' && (
            <button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
              确认发布
            </button>
          )}
          {(job.status === 'DRAFT' || job.status === 'SCHEDULED') && (
            <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">
              {cancelMutation.isPending ? '取消中...' : '取消'}
            </button>
          )}
          {job.status !== 'RUNNING' && (
            <button
              onClick={() => {
                confirm({ title: '删除发布任务', description: '确认删除该发布任务？此操作不可撤销。' }).then(ok => {
                  if (ok) deleteMutation.mutate();
                });
              }}
              disabled={deleteMutation.isPending}
              className="rounded-md border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:bg-red-950 disabled:opacity-50"
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </button>
          )}
        </div>
      } />

      {job.status === 'RUNNING' && (
        <div className="mb-6 rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-3">发布进度</h3>
          <PublishProgressInline status={job.status} metadata={job.metadata} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold">任务信息</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">平台</span><div><PlatformBadge platform={job.platform} /></div></div>
            <div><span className="text-muted-foreground">模式</span><div>{publishModeLabels[job.mode]}</div></div>
            <div><span className="text-muted-foreground">类型</span><div>{contentTypeLabels[job.contentType]}</div></div>
            <div><span className="text-muted-foreground">状态</span><div><StatusBadge status={job.status} label={publishStatusLabels[job.status]} /></div></div>
            <div><span className="text-muted-foreground">计划时间</span><div>{job.scheduledAt ? formatDate(job.scheduledAt) : '-'}</div></div>
            <div><span className="text-muted-foreground">重试次数</span><div>{job.retryCount}</div></div>
          </div>
          {job.externalUrl && <div><span className="text-sm text-muted-foreground">发布链接</span><div><a href={job.externalUrl} target="_blank" className="text-sm text-blue-600 hover:underline">{job.externalUrl}</a></div></div>}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">发布状态时间线</h3>
          <div className="space-y-3">
            {timelineStatuses.map((status) => {
              const stepState = getTimelineStepState(job.status, status);
              const dotClass =
                stepState === 'done' ? 'bg-green-500'
                : stepState === 'current' ? 'bg-blue-500'
                : 'bg-muted';
              return (
                <div
                  key={status}
                  className={`flex items-center gap-3 ${stepState === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}
                >
                  <div className={`h-3 w-3 rounded-full ${dotClass}`} />
                  <span className="text-sm">{publishStatusLabels[status]}</span>
                </div>
              );
            })}
            {job.status === 'FAILED' && (
              <div className="flex items-center gap-3 text-foreground">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm font-medium text-red-600">发布失败（未到达平台已发布）</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {job.lastError && (
        <div className="mt-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-5">
          <h3 className="font-semibold text-red-700">错误信息</h3>
          <p className="mt-1 text-sm text-red-600">{job.lastError}</p>
        </div>
      )}

      {attempts && attempts.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-3">发布尝试记录</h3>
          <table className="w-full"><thead><tr className="border-b"><th className="py-2 text-left text-sm text-muted-foreground">序号</th><th className="py-2 text-left text-sm text-muted-foreground">状态</th><th className="py-2 text-left text-sm text-muted-foreground">错误</th><th className="py-2 text-left text-sm text-muted-foreground">时间</th></tr></thead>
          <tbody>{attempts.map((a) => (
            <tr key={a.id} className="border-b last:border-0"><td className="py-2 text-sm">#{a.attemptNo}</td><td className="py-2"><StatusBadge status={a.status} /></td><td className="py-2 text-sm text-destructive">{a.error ?? '-'}</td><td className="py-2 text-sm text-muted-foreground">{formatDate(a.startedAt)}</td></tr>
          ))}</tbody></table>
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}
