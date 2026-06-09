'use client';

import { cn } from '@/lib/utils';
import { calendarItemColors } from '@/lib/constants';
import type { CalendarItem } from '@/types/calendar';

export type CalendarDayCellProps = {
  items: CalendarItem[];
  maxVisible?: number;
  onClick?: () => void;
};

function getItemColor(item: CalendarItem): string {
  if (item.kind === 'content') return calendarItemColors.content;
  return calendarItemColors[item.job.status] ?? 'bg-gray-400';
}

function getItemLabel(item: CalendarItem): string {
  if (item.kind === 'content') {
    const title = item.item.title;
    return title.length > 8 ? title.slice(0, 8) + '…' : title;
  }
  const v = item.job.contentVariant;
  const title = v?.title ?? '发布任务';
  return title.length > 8 ? title.slice(0, 8) + '…' : title;
}

export function CalendarDayCell({
  items,
  maxVisible = 3,
  onClick
}: CalendarDayCellProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const overflow = items.length - maxVisible;

  return (
    <div
      className="space-y-0.5"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {visible.map((item, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-1 rounded px-1 py-0.5',
            getItemColor(item) + '/15'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full flex-shrink-0',
              getItemColor(item)
            )}
          />
          <span className="text-[10px] leading-tight truncate">
            {getItemLabel(item)}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground pl-1">
          +{overflow} 更多
        </span>
      )}
    </div>
  );
}
