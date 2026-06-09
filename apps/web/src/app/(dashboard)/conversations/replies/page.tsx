'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { listInteractions } from '@/lib/api/conversations';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { platformLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { Platform } from '@/types/enums';

const platforms = [
  'all',
  'douyin',
  'xiaohongshu',
  'wechat_official',
  'wechat_channels',
  'baijiahao',
  'zhihu'
] as const;

export default function RepliesPage() {
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const {
    data: interactions,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [...queryKeys.conversations.replies, platformFilter],
    queryFn: () =>
      listInteractions({
        status: 'REPLIED',
        ...(platformFilter !== 'all' ? { platform: platformFilter } : {})
      })
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (error)
    return <ErrorState message="加载回复记录失败" onRetry={() => refetch()} />;

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="回复记录" description="查看所有已发送的回复" />

      {/* Platform filter */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {platforms.map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              platformFilter === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {p === 'all' ? '全部' : platformLabels[p as Platform]}
          </button>
        ))}
      </div>

      {/* Replies list */}
      {(interactions ?? []).length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          暂无回复记录
        </div>
      ) : (
        <div className="space-y-2">
          {interactions!.map((interaction) => (
            <Link
              key={interaction.id}
              href={`/conversations/${interaction.conversationId ?? interaction.id}`}
              className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <PlatformBadge platform={interaction.platform} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {interaction.externalUserName ?? '未知用户'}
                    </span>
                    <StatusBadge status="REPLIED" label="已回复" />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {interaction.content ?? '-'}
                  </p>
                </div>
              </div>
              <span className="ml-3 flex-shrink-0 text-xs text-muted-foreground">
                {formatDate(interaction.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
