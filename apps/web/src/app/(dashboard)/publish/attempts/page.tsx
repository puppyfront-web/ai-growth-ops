'use client';

import { useQuery } from '@tanstack/react-query';
import { listPublishJobs } from '@/lib/api/publish';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { publishStatusLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

export default function PublishAttemptsPage() {
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['publish-jobs-failed'],
    queryFn: () => listPublishJobs({ status: 'FAILED' })
  });

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="发布尝试记录" description="查看所有失败的发布尝试" />
      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="space-y-3">
          {jobs?.items?.map((job) => (
            <div key={job.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <PlatformBadge platform={job.platform} />
                <StatusBadge
                  status={job.status}
                  label={publishStatusLabels[job.status]}
                />
                <span className="text-sm text-muted-foreground">
                  重试 {job.retryCount} 次
                </span>
              </div>
              {job.lastError && (
                <p className="text-sm text-destructive">{job.lastError}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {job.finishedAt ? formatDate(job.finishedAt) : ''}
              </p>
            </div>
          ))}
          {(!jobs?.items || jobs.items.length === 0) && (
            <div className="text-center py-16 text-muted-foreground">
              没有失败的发布尝试
            </div>
          )}
        </div>
      )}
    </div>
  );
}
