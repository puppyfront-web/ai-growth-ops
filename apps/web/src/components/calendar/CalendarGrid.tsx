'use client';

import type { ReactNode } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type ViewMode = 'month' | 'week';

export type LegendItem = {
  label: string;
  dotClass: string;
};

export type CalendarGridProps = {
  month: Date;
  onMonthChange: (date: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  legendItems: LegendItem[];
  renderDayContent: (date: Date) => ReactNode;
  selectedDate?: Date | null;
  onDateSelect?: (date: Date) => void;
  className?: string;
};

export function CalendarGrid({
  month,
  onMonthChange,
  viewMode,
  onViewModeChange,
  legendItems,
  renderDayContent,
  selectedDate,
  onDateSelect,
  className
}: CalendarGridProps) {
  return (
    <div className={className}>
      {/* View toggle */}
      <div className="flex items-center justify-between mb-4">
        <Tabs
          value={viewMode}
          onValueChange={(v) => onViewModeChange(v as ViewMode)}
        >
          <TabsList>
            <TabsTrigger value="month">月视图</TabsTrigger>
            <TabsTrigger value="week">周视图</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Legend */}
        <div className="flex items-center gap-3">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${item.dotClass}`}
              />
              <span className="text-xs text-muted-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <Calendar
        month={month}
        onMonthChange={onMonthChange}
        selectedDate={selectedDate}
        onSelectDate={onDateSelect}
        renderDay={(date) => renderDayContent(date)}
      />
    </div>
  );
}
