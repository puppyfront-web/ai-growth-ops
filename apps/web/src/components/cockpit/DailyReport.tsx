'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/api/notifications';

export function DailyReport({
  report,
  className
}: {
  report: Notification | null;
  className?: string;
}) {
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          今日日报尚未生成。完成一次运行后将自动产出。
        </p>
      </div>
    );
  }

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <div className="mb-3 not-prose flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        {report.createdAt
          ? new Date(report.createdAt).toLocaleString('zh-CN')
          : null}
        {report.level === 'warning' && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            含待处理项
          </span>
        )}
      </div>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
    </div>
  );
}
