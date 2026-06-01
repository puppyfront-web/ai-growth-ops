'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listContentItems } from '@/lib/api/content';
import { listPublishJobs } from '@/lib/api/publish';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { CalendarGrid, CalendarDayCell, DayDetailDialog } from '@/components/calendar';
import type { ViewMode } from '@/components/calendar';
import type { CalendarItem } from '@/types/calendar';
import { toDateKey } from '@/lib/utils';
import type { ContentItem } from '@/types/content';
import type { PublishJob } from '@/types/publish';

const LEGEND = [
  { label: '内容创建', dotClass: 'bg-teal-400' },
  { label: '已发布', dotClass: 'bg-emerald-500' },
  { label: '已排期', dotClass: 'bg-amber-400' },
  { label: '失败', dotClass: 'bg-red-500' },
  { label: '草稿', dotClass: 'bg-gray-400' },
];

export default function ContentCalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: contentItems, isLoading: loadingContent, error: errContent, refetch: refetchContent } = useQuery({
    queryKey: queryKeys.content.items,
    queryFn: listContentItems,
  });
  const { data: publishJobs, isLoading: loadingPublish, error: errPublish, refetch: refetchPublish } = useQuery({
    queryKey: queryKeys.publish.jobs,
    queryFn: () => listPublishJobs(),
  });

  if (loadingContent || loadingPublish) return <LoadingState rows={6} />;
  if (errContent || errPublish) return <ErrorState message="加载日历数据失败" onRetry={() => { refetchContent(); refetchPublish(); }} />;

  // Build date → CalendarItem[] index
  const dateMap = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of contentItems ?? []) {
      const key = toDateKey(item.createdAt);
      const arr = map.get(key) ?? [];
      arr.push({ kind: 'content', item });
      map.set(key, arr);
    }
    for (const job of publishJobs ?? []) {
      const dateStr = job.scheduledAt ?? job.createdAt;
      const key = toDateKey(dateStr);
      const arr = map.get(key) ?? [];
      arr.push({ kind: 'publish', job });
      map.set(key, arr);
    }
    return map;
  }, [contentItems, publishJobs]);

  const selectedKey = selectedDate ? toDateKey(selectedDate) : null;
  const selectedItems = selectedKey ? dateMap.get(selectedKey) ?? [] : [];
  const selectedContent = selectedItems.filter((i): i is CalendarItem & { kind: 'content' } => i.kind === 'content').map((i) => i.item);
  const selectedPublish = selectedItems.filter((i): i is CalendarItem & { kind: 'publish' } => i.kind === 'publish').map((i) => i.job);

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="内容日历" description="按时间查看内容创作与发布计划" />

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
          return <CalendarDayCell items={items} onClick={() => setSelectedDate(date)} />;
        }}
      />

      {selectedDate && (
        <DayDetailDialog
          open={!!selectedDate}
          onOpenChange={(open) => { if (!open) setSelectedDate(null); }}
          date={selectedDate}
          contentItems={selectedContent}
          publishJobs={selectedPublish}
        />
      )}
    </div>
  );
}
