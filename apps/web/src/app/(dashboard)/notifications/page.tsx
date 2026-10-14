'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellOff, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification
} from '@/lib/api/notifications';

function levelColor(level: string): string {
  switch (level) {
    case 'success':
      return 'bg-success';
    case 'warning':
      return 'bg-warning';
    case 'error':
    case 'critical':
      return 'bg-destructive';
    default:
      return 'bg-info';
  }
}

type Filter = 'all' | 'unread';

function NotificationRow({
  item,
  onMarkRead
}: {
  item: Notification;
  onMarkRead: (id: string) => void;
}) {
  const clickable = Boolean(item.actionUrl);
  return (
    <div
      onClick={() => {
        if (!item.readAt) onMarkRead(item.id);
      }}
      className={cn(
        'flex gap-3 border-b px-4 py-3 last:border-b-0 transition-colors',
        clickable && 'cursor-pointer hover:bg-muted/50',
        !item.readAt && 'bg-muted/30'
      )}
    >
      <div className="mt-1.5">
        <span
          className={cn('inline-block h-2 w-2 rounded-full', levelColor(item.level))}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm', !item.readAt && 'font-medium')}>
            {item.title}
          </p>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.content}</p>
      </div>
      {!item.readAt && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(item.id);
          }}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          已读
        </Button>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const {
    data: notifications = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: listNotifications
  });

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000
  });
  const unreadCount = unreadData?.count ?? 0;

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const filtered =
    filter === 'unread' ? notifications.filter((n) => !n.readAt) : notifications;

  return (
    <div>
      <Breadcrumb />
      <PageHeader
        title="通知中心"
        actions={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              onClick={() => markAllReadMutation.mutate(undefined as never)}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? '处理中…' : '全部已读'}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-1">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'unread', label: `未读${unreadCount > 0 ? ` (${unreadCount})` : ''}` }
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            aria-pressed={filter === tab.key}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              filter === tab.key
                ? 'bg-secondary font-medium text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BellOff className="h-12 w-12" />}
          title={filter === 'unread' ? '没有未读通知' : '暂无通知'}
          description="任务完成、发布结果与系统提醒都会出现在这里。"
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {filtered.map((n) => (
            <NotificationRow
              key={n.id}
              item={n}
              onMarkRead={(id) => markReadMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
