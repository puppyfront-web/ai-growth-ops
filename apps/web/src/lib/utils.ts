import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDate(date: string | Date): Date {
  return typeof date === 'string' ? new Date(date) : date;
}

/** 全站时间格式化入口（docs/interaction-spec.md 第 7 节） */

/** YYYY-MM-DD */
export function formatDate(date: string | Date): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM-DD HH:mm */
export function formatDateTime(date: string | Date): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 24 小时内相对时间，超出回落到日期时间 */
export function formatRelativeTime(date: string | Date): string {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return '-';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return formatDateTime(d);
}

export function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

/** Convert a date/string to "YYYY-MM-DD" key for grouping */
export function toDateKey(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return 42 Date cells (6×7 grid) for a given month, padded with prev/next days */
export function getDaysGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  // Monday=0 .. Sunday=6 (shift from JS Sunday=0)
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  // Next month padding to fill 42 cells
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(
      new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
    );
  }
  return days;
}
