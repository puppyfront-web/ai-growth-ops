'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listPublishJobs } from '@/lib/api/publish';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  CalendarGrid,
  CalendarDayCell,
  DayDetailDialog
} from '@/components/calendar';
import type { ViewMode } from '@/components/calendar';
import type { CalendarItem } from '@/types/calendar';
import { toDateKey } from '@/lib/utils';

const LEGEND = [
  { label: '已发布', dotClass: 'bg-emerald-500' },
  { label: '已排期', dotClass: 'bg-amber-400' },
  { label: '发布中', dotClass: 'bg-blue-500' },
  { label: '失败', dotClass: 'bg-red-500' },
  { label: '草稿', dotClass: 'bg-gray-400' }
];

export default function PublishCalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const {
    data: publishJobs,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: queryKeys.publish.jobs,
    queryFn: () => listPublishJobs()
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error)
    return (
      <ErrorState message="加载发布日历数据失败" onRetry={() => refetch()} />
    );

  const dateMap = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const job of publishJobs?.items ?? []) {
      const dateStr = job.scheduledAt ?? job.createdAt;
      const key = toDateKey(dateStr);
      const arr = map.get(key) ?? [];
      arr.push({ kind: 'publish', job });
      map.set(key, arr);
    }
    return map;
  }, [publishJobs]);

  const selectedKey = selectedDate ? toDateKey(selectedDate) : null;
  const selectedJobs = selectedKey
    ? (dateMap.get(selectedKey) ?? [])
        .filter(
          (i): i is CalendarItem & { kind: 'publish' } => i.kind === 'publish'
        )
        .map((i) => i.job)
    : [];

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="发布日历" description="按时间查看发布任务安排与状态" />

      <CalendarGrid
        month={month}
        onMonthChange={setMonth}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        legendItems={LEGEND}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        renderDayContent={(date) => {
          const items = dateMap.get(toDateKey(date)) ?? [];
          return (
            <CalendarDayCell
              items={items}
              onClick={() => setSelectedDate(date)}
            />
          );
        }}
      />

      {selectedDate && (
        <DayDetailDialog
          open={!!selectedDate}
          onOpenChange={(open) => {
            if (!open) setSelectedDate(null);
          }}
          date={selectedDate}
          contentItems={[]}
          publishJobs={selectedJobs}
        />
      )}
    </div>
  );
}
