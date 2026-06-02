'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '@/lib/api/notifications';
import { queryKeys } from '@/lib/query-keys';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  level: string;
  readAt: string | null;
  actionUrl: string | null;
  createdAt: string;
}

function cn(...inputs: (string | undefined | false | null)[]) {
  return inputs.filter(Boolean).join(' ');
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN');
}

function levelColor(level: string): string {
  switch (level) {
    case 'success': return 'bg-green-500 dark:bg-green-400';
    case 'warning': return 'bg-amber-500 dark:bg-amber-400';
    case 'error': return 'bg-red-500 dark:bg-red-400';
    case 'critical': return 'bg-red-600 dark:bg-red-400';
    default: return 'bg-blue-500 dark:bg-blue-400';
  }
}

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Poll unread count every 30s
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Fetch notification list when dropdown opens
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => listNotifications(),
    enabled: open,
    staleTime: 10_000,
  });

  const unreadCount = unreadData?.count ?? 0;

  // Mark single as read
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleMarkRead = useCallback((id: string) => {
    markReadMutation.mutate(id);
  }, [markReadMutation]);

  const handleMarkAllRead = useCallback(() => {
    markAllReadMutation.mutate(undefined as never);
  }, [markAllReadMutation]);

  const handleNotificationClick = useCallback((n: NotificationItem) => {
    if (!n.readAt) handleMarkRead(n.id);
    if (n.actionUrl) {
      setOpen(false);
      window.location.href = n.actionUrl;
    }
  }, [handleMarkRead]);

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative"
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount} 条未读)` : ''}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-background shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">通知</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3 w-3" />
                全部已读
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                暂无通知
              </div>
            ) : (
              (notifications as NotificationItem[]).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    'flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50',
                    !n.readAt && 'bg-muted/30',
                  )}
                >
                  <div className="mt-1">
                    <span className={cn('inline-block h-2 w-2 rounded-full', levelColor(n.level))} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm', !n.readAt && 'font-medium')}>{n.title}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.content}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {!n.readAt && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                          className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <Check className="h-3 w-3" /> 已读
                        </button>
                      )}
                      {n.actionUrl && (
                        <span className="flex items-center gap-0.5 text-[11px] text-primary">
                          <ExternalLink className="h-3 w-3" /> 查看详情
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
