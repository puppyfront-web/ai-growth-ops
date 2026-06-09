'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge, PlatformBadge } from '@/components/shared/StatusBadge';
import { publishStatusLabels, contentTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { ContentItem } from '@/types/content';
import type { PublishJob } from '@/types/publish';

export type DayDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  contentItems: ContentItem[];
  publishJobs: PublishJob[];
};

export function DayDetailDialog({
  open,
  onOpenChange,
  date,
  contentItems,
  publishJobs
}: DayDetailDialogProps) {
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dateStr}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content Items */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              内容项 ({contentItems.length})
            </h4>
            {contentItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">当日无内容</p>
            ) : (
              <div className="space-y-1.5">
                {contentItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/content/${item.id}`}
                    className="block rounded-lg border p-2.5 hover:bg-accent/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {contentTypeLabels[item.type] ?? item.type}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(item.createdAt)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Publish Jobs */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              发布任务 ({publishJobs.length})
            </h4>
            {publishJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                当日无发布任务
              </p>
            ) : (
              <div className="space-y-1.5">
                {publishJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/publish/jobs/${job.id}`}
                    className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={job.platform} showIcon={false} />
                      <span className="text-xs text-muted-foreground">
                        {contentTypeLabels[job.contentType] ?? job.contentType}
                      </span>
                    </div>
                    <StatusBadge
                      status={job.status}
                      label={
                        publishStatusLabels[
                          job.status as keyof typeof publishStatusLabels
                        ]
                      }
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" asChild>
            <Link href="/content/new">新建内容</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/publish/queue">创建发布</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
