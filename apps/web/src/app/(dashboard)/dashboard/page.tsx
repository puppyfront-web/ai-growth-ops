'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight,
  ClipboardCheck,
  Inbox,
  Radar,
  Bell,
  AlertTriangle
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { OnboardingGuide } from '@/components/shared/OnboardingGuide';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { getUnreadCount } from '@/lib/api/notifications';
import { listInteractions } from '@/lib/api/conversations';
import { listProspectingTasks } from '@/lib/api/prospecting';
import { listLeads } from '@/lib/api/leads';
import { cn } from '@/lib/utils';

/**
 * 今日待办（docs/ui-ux-upgrade-plan.md B4/B5）：
 * 聚合跨模块的待处理事项，作为每日工作的入口；同时承载新手引导主线。
 */

type TodoCard = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Inbox;
  count: number | undefined;
  urgent?: boolean;
};

function TodoTile({ card }: { card: TodoCard }) {
  const count = card.count;
  const hasWork = count !== undefined && count > 0;
  return (
    <Link
      href={card.href}
      className="group flex items-start justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <card.icon
            className={cn(
              'h-4 w-4',
              hasWork && card.urgent ? 'text-warning' : 'text-muted-foreground'
            )}
            aria-hidden
          />
          <span className="text-sm font-medium">{card.label}</span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {card.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={cn(
            'text-2xl font-bold tabular-nums',
            hasWork ? 'text-foreground' : 'text-muted-foreground/50'
          )}
        >
          {count ?? '–'}
        </span>
        <ArrowRight
          className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { data: reviewData } = useQuery({
    queryKey: ['interactions-review', ''],
    queryFn: () => listInteractions({ status: 'WAITING_HUMAN_REVIEW' }),
    staleTime: 30_000
  });

  const { data: tasksData } = useQuery({
    queryKey: ['prospecting', 'tasks', 1, 50],
    queryFn: () => listProspectingTasks(1, 50),
    staleTime: 30_000
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads', 'level-A', 'new'],
    queryFn: () => listLeads({ level: 'A', status: 'NEW', pageSize: 1 }),
    staleTime: 60_000
  });

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000
  });

  const reviewCount = reviewData?.length;
  const runningTasks = tasksData?.items.filter((t) => t.status === 'running');
  const failedTasks = tasksData?.items.filter((t) => t.status === 'failed');

  const cards: TodoCard[] = [
    {
      key: 'review',
      label: '待审回复',
      description: 'AI 生成的回复等待人工确认',
      href: '/conversations/review',
      icon: ClipboardCheck,
      count: reviewCount,
      urgent: (reviewCount ?? 0) > 0
    },
    {
      key: 'running',
      label: '进行中获客任务',
      description: failedTasks && failedTasks.length > 0
        ? `${runningTasks?.length ?? 0} 个执行中，${failedTasks.length} 个失败`
        : '自动挖掘潜在客户',
      href: '/prospecting',
      icon: Radar,
      count: runningTasks?.length
    },
    {
      key: 'leads',
      label: 'A级新线索',
      description: '高意向线索等待跟进',
      href: '/leads',
      icon: Inbox,
      count: leadsData?.total
    },
    {
      key: 'notifications',
      label: '未读通知',
      description: '任务完成与系统提醒',
      href: '/notifications',
      icon: Bell,
      count: unreadData?.count
    }
  ];

  const hasError =
    reviewData === undefined &&
    tasksData === undefined &&
    leadsData === undefined;

  return (
    <div className="space-y-6">
      <Breadcrumb />
      <PageHeader
        title="工作台"
        description="今日待办与新手进度，从这里进入各个模块"
      />

      {hasError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          待办数据加载失败，请刷新重试
        </div>
      )}

      <OnboardingGuide />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <TodoTile key={card.key} card={card} />
        ))}
      </div>

      <QuickActions />
    </div>
  );
}
