'use client';

import * as React from 'react';
import { cn, getDaysGrid, toDateKey } from '@/lib/utils';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月'
];

export type CalendarProps = {
  month: Date;
  onMonthChange?: (date: Date) => void;
  renderDay?: (date: Date, isCurrentMonth: boolean) => React.ReactNode;
  selectedDate?: Date | null;
  onSelectDate?: (date: Date) => void;
  className?: string;
};

export function Calendar({
  month,
  onMonthChange,
  renderDay,
  selectedDate,
  onSelectDate,
  className
}: CalendarProps) {
  const year = month.getFullYear();
  const mo = month.getMonth();
  const days = React.useMemo(() => getDaysGrid(year, mo), [year, mo]);
  const todayKey = toDateKey(new Date());
  const selectedKey = selectedDate ? toDateKey(selectedDate) : null;

  const prevMonth = () => onMonthChange?.(new Date(year, mo - 1, 1));
  const nextMonth = () => onMonthChange?.(new Date(year, mo + 1, 1));
  const goToday = () => onMonthChange?.(new Date());

  return (
    <div className={cn('select-none', className)}>
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="rounded-md p-1.5 hover:bg-muted text-sm"
            aria-label="上个月"
          >
            ‹
          </button>
          <span className="px-2 text-sm font-semibold">
            {year}年 {MONTH_NAMES[mo]}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-md p-1.5 hover:bg-muted text-sm"
            aria-label="下个月"
          >
            ›
          </button>
        </div>
        <button
          onClick={goToday}
          className="rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
        >
          今天
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {days.map((date, i) => {
          const key = toDateKey(date);
          const isCurrentMonth = date.getMonth() === mo;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;

          return (
            <div
              key={i}
              onClick={() => onSelectDate?.(date)}
              className={cn(
                'min-h-[80px] bg-card p-1.5 cursor-pointer transition-colors hover:bg-accent/50',
                !isCurrentMonth && 'bg-muted/30 opacity-50'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                    isToday && 'bg-primary text-primary-foreground',
                    isSelected && !isToday && 'bg-muted ring-2 ring-primary',
                    !isToday && !isSelected && 'text-foreground'
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
              {renderDay?.(date, isCurrentMonth)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
