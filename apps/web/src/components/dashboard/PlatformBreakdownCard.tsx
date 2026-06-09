'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plug } from 'lucide-react';
import type { PlatformAnalytics } from '@/types/analytics';
import { platformLabels, platformIcons } from '@/lib/constants';
import { formatNumber } from '@/lib/utils';

export type PlatformBreakdownCardProps = {
  data: PlatformAnalytics[];
  className?: string;
};

export function PlatformBreakdownCard({
  data,
  className
}: PlatformBreakdownCardProps) {
  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-base font-semibold">平台分布</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">
            暂无平台数据
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-purple-500" />
          <CardTitle className="text-base font-semibold">平台分布</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((p) => (
            <div
              key={p.platform}
              className="flex items-center justify-between rounded-lg border p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {platformIcons[p.platform as keyof typeof platformIcons] ??
                    '📱'}
                </span>
                <span className="text-sm font-medium">
                  {platformLabels[p.platform as keyof typeof platformLabels] ??
                    p.platform}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>发布 {formatNumber(p.publishCount)}</span>
                <span>线索 {formatNumber(p.leadCount)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
