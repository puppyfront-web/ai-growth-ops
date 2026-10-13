'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export type LeadFunnelCardProps = {
  qualifiedLeads: number;
  totalLeads: number;
  className?: string;
};

export function LeadFunnelCard({
  qualifiedLeads,
  totalLeads,
  className
}: LeadFunnelCardProps) {
  const qualifiedPct =
    totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">线索漏斗</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold tabular-nums">
              {qualifiedLeads}
            </span>
            <span className="text-sm text-muted-foreground">
              {' '}
              / {totalLeads} 合格线索
            </span>
          </div>
          <span className="text-sm font-medium tabular-nums">
            {qualifiedPct}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{
              width: totalLeads > 0 ? `${Math.max(qualifiedPct, 2)}%` : '0%'
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          全部互动中转化为合格线索的比例
        </p>
      </CardContent>
    </Card>
  );
}
